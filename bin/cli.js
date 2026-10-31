#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");
const { startServer } = require("../lib/server");
const pkg = require("../package.json");

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
  console.log(`
${pkg.name} v${pkg.version}
${pkg.description}

Usage:
  wifi-file-server <folder-path> [options]
  npx wifi-file-server <folder-path> [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000, or PORT env)
  -h, --help            Show this help message
  -v, --version         Show version number

Examples:
  wifi-file-server ./Videos
  wifi-file-server ./Documents --port 8080
  npx wifi-file-server . -p 4000
`);
  process.exit(0);
}

if (args.includes("-v") || args.includes("--version")) {
  console.log(pkg.version);
  process.exit(0);
}

let folderArg = null;
let port = process.env.PORT ? Number(process.env.PORT) : null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-p" || arg === "--port") {
    const next = args[++i];
    if (!next || isNaN(Number(next))) {
      console.error(`\nError: Missing or invalid port number after ${arg}\n`);
      process.exit(1);
    }
    port = Number(next);
  } else if (!folderArg && !arg.startsWith("-")) {
    folderArg = arg;
  }
}

if (!folderArg) {
  console.error(`\nUsage: wifi-file-server <folder-path> [options]`);
  console.error(`Example: wifi-file-server ./Videos`);
  console.error(`Run "wifi-file-server --help" for all options.\n`);
  process.exit(1);
}

const sharedFolder = path.resolve(process.cwd(), folderArg);

if (!fs.existsSync(sharedFolder)) {
  console.error(`\nError: Folder does not exist: ${sharedFolder}\n`);
  process.exit(1);
}

const stat = fs.statSync(sharedFolder);
if (!stat.isDirectory()) {
  console.error(`\nError: Path is not a directory: ${sharedFolder}\n`);
  process.exit(1);
}

startServer(sharedFolder, { port });
