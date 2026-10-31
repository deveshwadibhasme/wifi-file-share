const { createApp, findAvailablePort } = require("../lib/server");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");

async function runTests() {
  console.log("Starting wifi-file-share verification tests...");

  // Setup temp directory
  const testDir = path.resolve(__dirname, "temp-shared");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const testContent = "Hello World from Wi-Fi File Share!";
  const testFile = path.join(testDir, "hello.txt");
  fs.writeFileSync(testFile, testContent, "utf8");

  const subDir = path.join(testDir, "subfolder");
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, "inner.txt"), "Nested file content", "utf8");

  // Create app and listen on ephemeral port
  const { app } = createApp(testDir);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // Test 1: Web UI index
    console.log("Test 1: Web interface (GET /)...");
    const indexRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(indexRes.status, 200);
    const indexHtml = await indexRes.text();
    assert.ok(indexHtml.includes("Wi-Fi File Share"), "Index HTML missing title");

    // Test 1b: Verify client-side script syntax
    console.log("Test 1b: Client-side JavaScript syntax verification...");
    const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, "No <script> tag found in HTML");
    // This will throw if the browser script has any syntax error like bad regex or unterminated string
    new vm.Script(scriptMatch[1]);

    // Test 2: List files API
    console.log("Test 2: List files API (GET /api/files)...");
    const filesRes = await fetch(`${baseUrl}/api/files`);
    assert.strictEqual(filesRes.status, 200);
    const files = await filesRes.json();
    assert.strictEqual(Array.isArray(files), true, "Result should be an array");
    const subfolderEntry = files.find((f) => f.name === "subfolder");
    const helloEntry = files.find((f) => f.name === "hello.txt");
    assert.ok(subfolderEntry && subfolderEntry.isDirectory, "Subfolder not found in listing");
    assert.ok(helloEntry && !helloEntry.isDirectory, "hello.txt not found in listing");
    assert.strictEqual(helloEntry.size, Buffer.byteLength(testContent));

    // Test 3: Download full file
    console.log("Test 3: Download full file (GET /api/download?path=hello.txt)...");
    const dlRes = await fetch(`${baseUrl}/api/download?path=hello.txt`);
    assert.strictEqual(dlRes.status, 200);
    const dlContent = await dlRes.text();
    assert.strictEqual(dlContent, testContent);

    // Test 4: Range request (resuming / seeking)
    console.log("Test 4: Range request (GET /api/download with Range header)...");
    const rangeRes = await fetch(`${baseUrl}/api/download?path=hello.txt`, {
      headers: { Range: "bytes=0-4" }
    });
    assert.strictEqual(rangeRes.status, 206, "Expected 206 Partial Content");
    assert.strictEqual(rangeRes.headers.get("Content-Range"), `bytes 0-4/${Buffer.byteLength(testContent)}`);
    const rangeContent = await rangeRes.text();
    assert.strictEqual(rangeContent, "Hello");

    // Test 5: Subdirectory listing
    console.log("Test 5: Subdirectory listing (GET /api/files?path=subfolder)...");
    const subRes = await fetch(`${baseUrl}/api/files?path=subfolder`);
    assert.strictEqual(subRes.status, 200);
    const subFiles = await subRes.json();
    assert.strictEqual(subFiles.length, 1);
    assert.strictEqual(subFiles[0].name, "inner.txt");

    // Test 6: Security - directory traversal prevention
    console.log("Test 6: Security check - directory traversal blocked...");
    const traversalRes = await fetch(`${baseUrl}/api/files?path=../../`);
    assert.strictEqual(traversalRes.status, 403, "Directory traversal must return 403 Forbidden");

    // Test 7: Port availability helper
    console.log("Test 7: Port availability auto-discovery...");
    const nextPort = await findAvailablePort(60000);
    assert.ok(typeof nextPort === "number" && nextPort >= 60000);

    console.log("\nAll tests passed successfully! [OK]");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
