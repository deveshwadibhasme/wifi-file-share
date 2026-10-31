
const ui = `<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wi-Fi File Share</title>
    <style>
        :root {
            --bg: #f9fafb;
            --card-bg: #ffffff;
            --text: #111827;
            --muted: #6b7280;
            --border: #e5e7eb;
            --link: #2563eb;
            --hover: #f3f4f6;
            --error: #ef4444;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #111827;
                --card-bg: #1f2937;
                --text: #f9fafb;
                --muted: #9ca3af;
                --border: #374151;
                --link: #60a5fa;
                --hover: #374151;
            }
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.5;
            background: var(--bg);
            color: var(--text);
            max-width: 800px;
            margin: 0 auto;
            padding: 24px 16px;
        }

        header {
            margin-bottom: 20px;
        }

        h1 {
            margin: 0 0 6px 0;
            font-size: 24px;
            font-weight: 700;
        }

        .muted {
            color: var(--muted);
            font-size: 14px;
        }

        .path-bar {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px 14px;
            margin: 16px 0;
            font-family: monospace;
            font-size: 14px;
            word-break: break-all;
        }

        ul {
            list-style: none;
            padding: 0;
            margin: 0;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
        }

        li {
            border-bottom: 1px solid var(--border);
        }

        li:last-child {
            border-bottom: none;
        }

        a.item,
        a.parent-link {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            color: inherit;
            text-decoration: none;
            min-height: 48px;
            transition: background-color 0.15s ease;
        }

        a.item:hover,
        a.parent-link:hover {
            background: var(--hover);
        }

        .name {
            overflow-wrap: anywhere;
            word-break: break-word;
            font-weight: 500;
            padding-right: 12px;
        }

        .file .name {
            color: var(--link);
        }

        .size {
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }

        .parent-link {
            color: var(--link);
            font-weight: 600;
            background: var(--hover);
        }

        .message {
            padding: 24px 16px;
            text-align: center;
        }

        .error {
            color: var(--error);
            padding: 16px;
        }
    </style>
</head>

<body>
    <header>
        <h1>Wi-Fi File Share</h1>
        <p class="muted">Browse and download files directly from your PC.</p>
    </header>
    <div class="path-bar" id="path">Loading...</div>
    <ul id="files">
        <li class="message muted">Loading files...</li>
    </ul>
    <script>
        function formatBytes(bytes) {
            if (!bytes || bytes <= 0) return "0 B";
            const units = ["B", "KB", "MB", "GB", "TB"];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2);
            return val + " " + units[i];
        }

        try {
            const params = new URLSearchParams(location.search);
            var folder = (params.get("path") || "").trim();
            while (folder.startsWith("/") || folder.startsWith("\\\\")) {
                folder = folder.slice(1);
            }
            while (folder.endsWith("/") || folder.endsWith("\\\\")) {
                folder = folder.slice(0, -1);
            }
            document.getElementById("path").textContent = "/" + folder;

            fetch("/api/files?path=" + encodeURIComponent(folder))
                .then(function (r) {
                    if (!r.ok) {
                        return r.text().then(function (msg) { throw new Error(msg || "Unable to list folder"); });
                    }
                    return r.json();
                })
                .then(function (items) {
                    var list = document.getElementById("files");
                    list.innerHTML = "";

                    if (folder) {
                        var li = document.createElement("li");
                        var a = document.createElement("a");
                        var parentParts = folder.split("/").filter(Boolean);
                        parentParts.pop();
                        var parentPath = parentParts.join("/");
                        a.href = parentPath ? "/?path=" + encodeURIComponent(parentPath) : "/";
                        a.className = "parent-link";
                        a.textContent = "⬅ .. (Parent folder)";
                        li.appendChild(a);
                        list.appendChild(li);
                    }

                    if (!items || items.length === 0) {
                        var emptyLi = document.createElement("li");
                        emptyLi.className = "message muted";
                        emptyLi.textContent = "This folder is empty.";
                        list.appendChild(emptyLi);
                        return;
                    }

                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var itemLi = document.createElement("li");
                        var itemA = document.createElement("a");
                        var next = folder ? (folder + "/" + item.name) : item.name;

                        itemA.className = item.isDirectory ? "item dir" : "item file";
                        itemA.href = item.isDirectory
                            ? "/?path=" + encodeURIComponent(next)
                            : "/api/download?path=" + encodeURIComponent(next);

                        var nameSpan = document.createElement("span");
                        nameSpan.className = "name";
                        nameSpan.textContent = (item.isDirectory ? "📁 " : "📄 ") + item.name + (item.isDirectory ? "/" : "");
                        itemA.appendChild(nameSpan);

                        if (!item.isDirectory) {
                            var sizeSpan = document.createElement("span");
                            sizeSpan.className = "size muted";
                            sizeSpan.textContent = formatBytes(item.size);
                            itemA.appendChild(sizeSpan);
                        }

                        itemLi.appendChild(itemA);
                        list.appendChild(itemLi);
                    }
                })
                .catch(function (err) {
                    console.error("Failed to load files:", err);
                    var list = document.getElementById("files");
                    list.innerHTML = "";
                    var errLi = document.createElement("li");
                    errLi.className = "error";
                    errLi.textContent = "Error: " + err.message;
                    list.appendChild(errLi);
                });
        } catch (e) {
            console.error("Initialization error:", e);
            document.getElementById("files").innerHTML = '<li class="error">Client error: ' + e.message + '</li>';
        }
    </script>
</body>

</html>`;

module.exports = { ui };
