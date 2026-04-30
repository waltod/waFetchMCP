import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const child = spawn(process.execPath, ["src/mcp-server.js"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "wafetchmcp-smoke", version: "0.1.0" }
  }
});

await delay(300);
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {}
});

await delay(700);
child.kill();
await once(child, "exit");

for (const tool of [
  "fetch_url",
  "fetch_json",
  "discover_page",
  "get_robots_txt",
  "fetcher_status",
  "list_fetcher_functions",
  "save_fetcher_function",
  "run_fetcher_function"
]) {
  if (!stdout.includes(tool)) {
    console.error(stderr);
    console.error(stdout);
    throw new Error(`MCP tools/list did not include ${tool}.`);
  }
}

console.log("waFetchMCP MCP smoke test passed.");
