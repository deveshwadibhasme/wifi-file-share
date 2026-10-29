#!/usr/bin/env node


const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const app = express();
const PORT = 3000;

const requestedRoot = process.argv[2];

if (!requestedRoot) {
  console.error(
    "Usage: wifi-file-server ./<folder-to-share>"
  );
  process.exit(1);
}

const ROOT = path.resolve(process.cwd(), requestedRoot);

app.disable("x-powered-by");

async function getSafePath(relativePath = "") {
  const root = await fs.realpath(ROOT);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    const error = new Error("Invalid path");
    error.status = 403;
    throw error;
  }

  const actual = await fs.realpath(target);
  const resolvedRelative = path.relative(root, actual);

  if (
    resolvedRelative === ".." ||
    resolvedRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(resolvedRelative)
  ) {
    const error = new Error("Access outside shared folder denied");
    error.status = 403;
    throw error;
  }

  return actual;
}

// Simple browser interface.
app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wi-Fi File Server</title>
  <style>
    body { font: 16px system-ui; max-width: 800px;
      margin: 30px auto; padding: 0 16px; }
    li { padding: 12px 0; border-bottom: 1px solid #ddd; }
    a { overflow-wrap: anywhere; }
    .muted { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <h2>My PC Files</h2>
  <p class="muted">Browse folders and download files over Wi-Fi.</p>
  <p id="path">Loading...</p>
  <ul id="files"></ul>
  <script>
    const params = new URLSearchParams(location.search);
    const folder = params.get("path") || "";
    document.getElementById("path").textContent =
      "/" + folder;

    fetch("/api/files?path=" + encodeURIComponent(folder))
      .then(r => {
        if (!r.ok) throw new Error("Unable to list folder");
        return r.json();
      })
      .then(items => {
        const list = document.getElementById("files");
        if (folder) {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = "/?path=" +
            encodeURIComponent(folder.split("/").slice(0, -1).join("/"));
          a.textContent = "⬅ Parent folder";
          li.append(a);
          list.append(li);
        }

        for (const item of items) {
          const li = document.createElement("li");
          const a = document.createElement("a");
          const next = folder ? folder + "/" + item.name : item.name;

          a.textContent = (item.isDirectory ? "📁 " : "📄 ") +
            item.name + (item.isDirectory ? "/" : "");

          a.href = item.isDirectory
            ? "/?path=" + encodeURIComponent(next)
            : "/api/download?path=" + encodeURIComponent(next);

          li.append(a);

          if (!item.isDirectory) {
            const size = document.createElement("div");
            size.className = "muted";
            size.textContent =
              (item.size / 1024 / 1024).toFixed(2) + " MB";
            li.append(size);
          }

          list.append(li);
        }
      })
      .catch(error => {
        document.getElementById("files").textContent = error.message;
      });
  </script>
</body>
</html>`);
});

// List the contents of one folder.
app.get("/api/files", async (req, res, next) => {
  try {
    const target = await getSafePath(
      typeof req.query.path === "string" ? req.query.path : ""
    );

    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Not a folder" });
    }

    const entries = await fs.readdir(target, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async entry => {
        // Do not follow symbolic links.
        if (!entry.isDirectory() && !entry.isFile()) return null;

        const fullPath = path.join(target, entry.name);
        const info = await fs.stat(fullPath);

        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: entry.isFile() ? info.size : 0
        };
      })
    );

    res.json(items.filter(Boolean));
  } catch (error) {
    next(error);
  }
});

// Stream a file to the browser without loading the entire file into RAM.

app.get("/api/download", async (req, res, next) => {
  let stream;

  try {
    const relativePath =
      typeof req.query.path === "string" ? req.query.path : "";

    if (!relativePath) {
      return res.status(400).send("Missing file path");
    }

    const target = await getSafePath(relativePath);
    const info = await fs.stat(target);

    if (!info.isFile()) {
      return res.status(400).send("Not a regular file");
    }

    console.log("Starting download:", target);
    console.log("File size:", info.size);

    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`
    );
    res.setHeader("Content-Length", info.size);
    res.setHeader("Accept-Ranges", "bytes");

    stream = require("node:fs").createReadStream(target);

    stream.on("error", (err) => {
      console.error("File stream error:", err);

      if (!res.headersSent) {
        res.status(500).end("File read error");
      } else {
        res.destroy(err);
      }
    });

    res.on("close", () => {
      if (!res.writableEnded) {
        console.log("Client disconnected before download completed");
        stream.destroy();
      }
    });

    const startedAt = Date.now();
    let bytesSent = 0;

    stream.on("data", (chunk) => {
      bytesSent += chunk.length;
    });

    res.on("finish", () => {
      const seconds = (Date.now() - startedAt) / 1000;
      const mbps = (bytesSent * 8) / seconds / 1_000_000;

      console.log({
        bytesSent,
        seconds: seconds.toFixed(2),
        throughputMbps: mbps.toFixed(2),
      });
    });

    stream.pipe(res);
  } catch (err) {
    console.error("Download setup error:", err);

    if (!res.headersSent) {
      next(err);
    } else {
      res.destroy(err);
    }
  }
});


app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 404).send("Unable to access this file.");
});


function startServer(root) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Tool developed by https://www.linkedin.com/in/devesh-wadibhasme-220b662ab/`);
    console.log(`File server running on port ${PORT}`);
    console.log(`Shared folder: ${ROOT}`);

    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const info of interfaces || []) {
        if (info.family === "IPv4" && !info.internal) {
          console.log(`Open on your phone: http://${info.address}:${PORT}`);
        }
      }
    }
  });
}

module.exports = { startServer };


