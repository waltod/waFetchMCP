import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { discoverPage, fetchJson, fetchUrl, getRobotsTxt, getStatus } from "./fetcher-core.js";
import {
  deleteFetcherFunction,
  getFetcherFunction,
  listFetcherFunctions,
  runFetcherFunction,
  saveFetcherFunction
} from "./function-host.js";

const server = new McpServer({
  name: "waFetchMCP",
  version: "0.1.0"
});

const headersSchema = z.record(z.string()).default({});
const methodSchema = z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).default("GET");
const responseTypeSchema = z.enum(["auto", "text", "json", "base64"]).default("auto");

server.tool(
  "fetch_url",
  {
    url: z.string().url().describe("HTTP or HTTPS URL to fetch."),
    method: methodSchema.describe("HTTP method."),
    headers: headersSchema.describe("Request headers. Authorization is blocked unless FETCHER_ALLOW_AUTH_HEADER=true."),
    body: z.string().optional().describe("Raw request body for non-GET requests."),
    json: z.unknown().optional().describe("JSON request body. Sets the request body to JSON.stringify(json)."),
    responseType: responseTypeSchema.describe("How to return the response body."),
    followRedirects: z.boolean().default(true).describe("Follow redirects."),
    timeoutMs: z.number().int().min(1000).max(120000).optional().describe("Request timeout in milliseconds."),
    maxBytes: z.number().int().min(1024).max(20 * 1024 * 1024).optional().describe("Maximum response bytes to read.")
  },
  async (input) => toolJson(await fetchUrl(input), "Fetched URL.")
);

server.tool(
  "fetch_json",
  {
    url: z.string().url().describe("HTTP or HTTPS JSON URL to fetch."),
    method: methodSchema.describe("HTTP method."),
    headers: headersSchema.describe("Request headers."),
    body: z.string().optional().describe("Raw request body for non-GET requests."),
    json: z.unknown().optional().describe("JSON request body."),
    path: z.string().optional().describe("Optional simple JSON path, for example result.items[0].name."),
    followRedirects: z.boolean().default(true).describe("Follow redirects."),
    timeoutMs: z.number().int().min(1000).max(120000).optional().describe("Request timeout in milliseconds."),
    maxBytes: z.number().int().min(1024).max(20 * 1024 * 1024).optional().describe("Maximum response bytes to read.")
  },
  async (input) => toolJson(await fetchJson(input), "Fetched JSON.")
);

server.tool(
  "discover_page",
  {
    url: z.string().url().describe("HTML page URL to inspect for title, metadata, links, scripts, forms, endpoint-like strings, JSON-LD, OpenGraph, and challenge signals."),
    headers: headersSchema.describe("Request headers."),
    maxItems: z.number().int().min(1).max(500).default(100).describe("Maximum links/scripts/endpoints to return."),
    timeoutMs: z.number().int().min(1000).max(120000).optional().describe("Request timeout in milliseconds."),
    maxBytes: z.number().int().min(1024).max(20 * 1024 * 1024).optional().describe("Maximum HTML bytes to read.")
  },
  async (input) => toolJson(await discoverPage(input), "Discovered page metadata.")
);

server.tool(
  "get_robots_txt",
  {
    url: z.string().url().optional().describe("Any URL on the target site. waFetchMCP will fetch that origin's /robots.txt."),
    host: z.string().optional().describe("Target host, for example example.com. Used when url is omitted."),
    protocol: z.enum(["http:", "https:", "http", "https"]).optional().describe("Protocol to use when host is provided. Defaults to https."),
    useSourceProtocol: z.boolean().default(false).describe("When url is provided, use the URL protocol instead of defaulting to https."),
    followRedirects: z.boolean().default(true).describe("Follow redirects."),
    timeoutMs: z.number().int().min(1000).max(120000).optional().describe("Request timeout in milliseconds."),
    maxBytes: z.number().int().min(1024).max(20 * 1024 * 1024).optional().describe("Maximum robots.txt bytes to read.")
  },
  async (input) => toolJson(await getRobotsTxt(input), "Fetched robots.txt.")
);

server.tool(
  "fetcher_status",
  {},
  async () => toolJson(getStatus())
);

server.tool(
  "list_fetcher_functions",
  {},
  async () => toolJson(listFetcherFunctions(), "Saved fetcher functions.")
);

server.tool(
  "get_fetcher_function",
  {
    name: z.string().min(1).describe("Saved function name.")
  },
  async ({ name }) => toolJson(getFetcherFunction(name), "Saved fetcher function definition.")
);

server.tool(
  "save_fetcher_function",
  {
    definition: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      version: z.string().optional(),
      inputSchema: z.record(z.unknown()).optional(),
      steps: z.array(z.record(z.unknown())).min(1),
      returns: z.unknown().optional()
    }).describe("Declarative fetch workflow definition."),
    overwrite: z.boolean().default(false).describe("Replace an existing saved function with the same name.")
  },
  async (input) => toolJson(saveFetcherFunction(input), "Saved fetcher function.")
);

server.tool(
  "run_fetcher_function",
  {
    name: z.string().optional().describe("Saved function name. Omit when passing an inline definition."),
    definition: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      version: z.string().optional(),
      inputSchema: z.record(z.unknown()).optional(),
      steps: z.array(z.record(z.unknown())).min(1),
      returns: z.unknown().optional()
    }).optional().describe("Inline function definition to run without saving."),
    args: z.record(z.unknown()).default({}).describe("Function arguments."),
    trace: z.boolean().default(false).describe("Include step previews and timings.")
  },
  async (input) => toolJson(await runFetcherFunction(input), "Ran fetcher function.")
);

server.tool(
  "delete_fetcher_function",
  {
    name: z.string().min(1).describe("Saved function name.")
  },
  async ({ name }) => toolJson(deleteFetcherFunction(name), "Deleted fetcher function.")
);

const transport = new StdioServerTransport();
await server.connect(transport);

function toolJson(value, lead) {
  const text = lead ? `${lead}\n\n${JSON.stringify(value, null, 2)}` : JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}
