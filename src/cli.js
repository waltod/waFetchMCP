#!/usr/bin/env node
import { readSync as fsReadSync } from "node:fs";
import { discoverPage, fetchJson, fetchUrl, getRobotsTxt } from "./fetcher-core.js";
import { getFetcherFunction, listFetcherFunctions, runFetcherFunction, saveFetcherFunction } from "./function-host.js";

const [command, url, ...rest] = process.argv.slice(2);

try {
  const options = parseArgs(rest);
  let result;
  if (command === "fetch") {
    result = await fetchUrl({ url, ...options });
  } else if (command === "json") {
    result = await fetchJson({ url, ...options });
  } else if (command === "discover") {
    result = await discoverPage({ url, ...options });
  } else if (command === "robots") {
    result = await getRobotsTxt({
      ...(String(url || "").startsWith("http://") || String(url || "").startsWith("https://")
        ? { url }
        : { host: url }),
      ...options
    });
  } else if (command === "functions") {
    result = listFetcherFunctions();
  } else if (command === "get-function") {
    result = getFetcherFunction(url);
  } else if (command === "run-function") {
    result = await runFetcherFunction({ name: url, args: options.args || {}, trace: options.trace });
  } else if (command === "save-function") {
    result = saveFetcherFunction({ definition: JSON.parse(readStdin()), overwrite: options.overwrite });
  } else {
    printUsage();
    process.exit(command ? 1 : 0);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--method") {
      options.method = args[++index];
    } else if (arg === "--body") {
      options.body = args[++index];
    } else if (arg === "--type") {
      options.responseType = args[++index];
    } else if (arg === "--path") {
      options.path = args[++index];
    } else if (arg === "--max-bytes") {
      options.maxBytes = args[++index];
    } else if (arg === "--timeout") {
      options.timeoutMs = args[++index];
    } else if (arg === "--no-redirect") {
      options.followRedirects = false;
    } else if (arg === "--header") {
      const [key, ...value] = String(args[++index] || "").split(":");
      options.headers = { ...(options.headers || {}), [key.trim()]: value.join(":").trim() };
    } else if (arg === "--arg") {
      const [key, ...value] = String(args[++index] || "").split("=");
      options.args = { ...(options.args || {}), [key.trim()]: value.join("=") };
    } else if (arg === "--trace") {
      options.trace = true;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`Usage:
  wafetchmcp fetch https://example.com [--type auto|text|json|base64]
  wafetchmcp json https://example.com/api [--path result.items[0]]
  wafetchmcp discover https://example.com
  wafetchmcp robots https://example.com
  wafetchmcp robots example.com
  wafetchmcp functions
  wafetchmcp get-function fandom-allpages
  wafetchmcp run-function fandom-allpages --arg wiki=example
  type function.json | wafetchmcp save-function --overwrite`);
}

function readStdin() {
  let input = "";
  const buffer = new Uint8Array(4096);
  let bytesRead = 0;
  while ((bytesRead = fsReadSync(0, buffer, 0, buffer.length)) > 0) {
    input += Buffer.from(buffer.slice(0, bytesRead)).toString("utf8");
  }
  return input;
}
