#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");
const { startServer } = require("../lib/server");

const folderArg = process.argv[2];

if (!folderArg) {
    console.error("\nUsage: wifi-file-server <folder-path>");
    console.error("Example: wifi-file-server ./Videos\n");
    process.exit(1);
}

const sharedFolder = path.resolve(process.cwd(), folderArg);

if (!fs.existsSync(sharedFolder) || !fs.statSync(sharedFolder).isDirectory()) {
    console.error(`Error: Folder does not exist: ${sharedFolder}`);
    process.exit(1);
}

startServer(sharedFolder);
