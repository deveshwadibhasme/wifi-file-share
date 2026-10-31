const express = require("express");
const fs = require("node:fs/promises");
const nodeFs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const { ui } = require("./ui");

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      server.close(() => resolve(startPort));
    });
  });
}

function createApp(sharedFolder) {
  const app = express();
  const ROOT = path.resolve(process.cwd(), sharedFolder);

  if (!nodeFs.existsSync(ROOT) || !nodeFs.statSync(ROOT).isDirectory()) {
    throw new Error(`Shared path does not exist or is not a directory: ${ROOT}`);
  }

  app.disable("x-powered-by");

  async function getSafePath(relativePath = "") {
    const root = await fs.realpath(ROOT);
    // Strip leading slashes to prevent path.resolve from treating relative paths as root drives on Windows
    let sanitized = relativePath.trim();
    while (sanitized.startsWith("/") || sanitized.startsWith("\\")) {
      sanitized = sanitized.slice(1);
    }
    const target = path.resolve(root, sanitized);
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

  // Browser interface
  app.get("/", (req, res) => {
    res.type("html").send(ui);
  });

  // List folder contents
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
        entries.map(async (entry) => {
          if (!entry.isDirectory() && !entry.isFile()) return null;

          const fullPath = path.join(target, entry.name);
          let size = 0;
          if (entry.isFile()) {
            try {
              const info = await fs.stat(fullPath);
              size = info.size;
            } catch {
              return null;
            }
          }

          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size,
          };
        })
      );

      const validItems = items.filter(Boolean);
      validItems.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

      res.json(validItems);
    } catch (error) {
      next(error);
    }
  });

  // Stream a file to download, supporting range requests
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

      const filename = path.basename(target);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      );

      const rangeHeader = req.headers.range;

      if (rangeHeader && rangeHeader.startsWith("bytes=")) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : info.size - 1;

        if (isNaN(start) || isNaN(end) || start > end || end >= info.size || start < 0) {
          res.setHeader("Content-Range", `bytes */${info.size}`);
          return res.status(416).send("Requested Range Not Satisfiable");
        }

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
        res.setHeader("Content-Length", chunkSize);
        stream = nodeFs.createReadStream(target, { start, end });
      } else {
        res.status(200);
        res.setHeader("Content-Length", info.size);
        stream = nodeFs.createReadStream(target);
      }

      stream.on("error", (err) => {
        console.error("File stream error:", err.message);
        if (!res.headersSent) {
          res.status(500).end("File read error");
        } else {
          res.destroy(err);
        }
      });

      res.on("close", () => {
        if (!res.writableEnded) {
          stream.destroy();
        }
      });

      const startedAt = Date.now();
      let bytesSent = 0;

      stream.on("data", (chunk) => {
        bytesSent += chunk.length;
      });

      res.on("finish", () => {
        const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        const mbps = (bytesSent * 8) / seconds / 1_000_000;
        console.log(
          `Downloaded: ${filename} (${(bytesSent / 1024 / 1024).toFixed(2)} MB in ${seconds.toFixed(2)}s, ${mbps.toFixed(2)} Mbps)`
        );
      });

      stream.pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy(err);
      }
    }
  });

  // Global error handler
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.code === "ENOENT") {
      return res.status(404).send("File or folder not found.");
    }
    res.status(err.status || 500).send(err.message || "Unable to access file.");
  });

  return { app, ROOT };
}

async function startServer(sharedFolder, options = {}) {
  let port = options.port !== undefined && options.port !== null ? Number(options.port) : null;
  if (!port && process.env.PORT) {
    port = Number(process.env.PORT);
  }

  if (!port) {
    port = await findAvailablePort(3000);
  }

  const { app, ROOT } = createApp(sharedFolder);

  const server = app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`Wi-Fi File Server running!`);
    console.log(`Author:        https://www.linkedin.com/in/devesh-wadibhasme-220b662ab/`);
    console.log(`Shared folder: ${ROOT}`);
    console.log(`Local URL:     http://localhost:${port}`);

    let foundWifi = false;
    const interfaces = os.networkInterfaces();
    for (const [name, infos] of Object.entries(interfaces)) {
      for (const info of infos || []) {
        if (info.family === "IPv4" && !info.internal) {
          console.log(`Phone URL:     http://${info.address}:${port} (${name})`);
          foundWifi = true;
        }
      }
    }
    if (!foundWifi) {
      console.log(`Note: No active external Wi-Fi / LAN IP detected.`);
    }
    console.log(`==================================================\n`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nError: Port ${port} is already in use.`);
      console.error(`Try specifying another port using --port <number> (e.g. --port ${port + 1})\n`);
      process.exit(1);
    } else {
      console.error(`\nServer error:`, err.message);
      process.exit(1);
    }
  });

  return server;
}

if (require.main === module) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("Usage: node lib/server.js <folder-path> [port]");
    process.exit(1);
  }
  startServer(folder, { port: process.argv[3] });
}

module.exports = { createApp, startServer, findAvailablePort };
