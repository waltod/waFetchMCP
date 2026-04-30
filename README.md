# waFetchMCP

Generic MCP server for safe public-web fetching and reusable declarative fetch workflows.

Use it when an agent needs to inspect an unknown page, call a public JSON endpoint, check robots.txt, or save a repeatable scraper-like workflow without writing a custom MCP server.

## Features

Feature | What it does
--- | ---
HTTP fetch | `GET`, `POST`, headers, bodies, redirects, timeouts, byte limits
JSON fetch | Parse JSON and select paths like `result.items[0].name`
Page discovery | Title, meta, links, scripts, forms, endpoints, JSON-LD, OpenGraph
Robots check | Fetch and parse `/robots.txt`
Challenge signals | Reports CAPTCHA, WAF, login walls, rate limits, bot checks
Saved workflows | JSON functions in [`functions/`](functions)
Safety defaults | Blocks private/local networks and auth headers by default

## Quick Start

```bash
git clone https://github.com/waltod/waFetchMCP.git
cd waFetchMCP
npm install
npm test
```

Node.js 18+ is required.

## Install

Client | Setup
--- | ---
Codex CLI / IDE | [One-command install](docs/INSTALL-CODEX-CLAUDE.md#codex)
Claude, OpenCode, Cursor, VS Code | [MCP client install guide](docs/INSTALL-CODEX-CLAUDE.md)
Open WebUI / cloud UI | [HTTP bridge notes](docs/INSTALL-CODEX-CLAUDE.md#open-webui-and-cloud-uis)
CLI | Use `npm run cli -- <command>` from the repo
Workflow board | [waFetchMCP workflow](docs/wafetchmcp-workflow.md)
Function examples | [Bundled functions](functions/README.md)

Minimal Codex config:

```toml
[mcp_servers.waFetchMCP]
command = "node"
args = ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"]

[mcp_servers.waFetchMCP.env]
FETCHER_FUNCTIONS_DIR = "C:\\MCP\\waFetchMCP\\functions"
```

Change the paths for your checkout, then restart the MCP client.

## CLI

```bash
npm run cli -- fetch https://example.com
npm run cli -- json https://example.com/api --path result.items[0]
npm run cli -- discover https://example.com
npm run cli -- robots example.com
npm run cli -- functions
```

Run a saved workflow:

```bash
npm run cli -- run-function lcsc-search-list --arg "keyword=ESPRESSIF ESP32-S3" --arg limit=5
```

## Examples

Example | Command
--- | ---
Fandom page list | `npm run cli -- run-function fandom-allpages --arg wiki=harrypotter --arg limit=3`
Fandom page HTML | `npm run cli -- run-function fandom-page-html --arg wiki=harrypotter --arg "title=Harry Potter"`
IMDb title suggestion | `npm run cli -- run-function imdb-title-suggestion --arg titleId=tt0133093`
IMDb genre scraper | `npm run cli -- run-function imdb-genre-scraper --arg filter=action --arg limit=5 --trace`
LCSC concise search | `npm run cli -- run-function lcsc-search-list --arg "keyword=ESPRESSIF ESP32-S3" --arg limit=5`
LCSC product detail | `npm run cli -- run-function lcsc-product-detail --arg productCode=C2980297`

IMDb chart pages may return Amazon WAF challenges to direct HTTP clients. waFetchMCP reports the challenge instead of bypassing it.

## MCP Tools

Tool | Purpose
--- | ---
`fetch_url` | Fetch HTTP(S), return text, JSON, or base64
`fetch_json` | Fetch JSON and optionally select a path
`discover_page` | Inspect HTML metadata, links, forms, scripts, endpoints
`get_robots_txt` | Fetch and parse robots.txt
`fetcher_status` | Show runtime limits and safety settings
`list_fetcher_functions` | List saved workflow functions
`get_fetcher_function` | Inspect a workflow definition
`save_fetcher_function` | Save or replace a workflow
`run_fetcher_function` | Run a saved or inline workflow
`delete_fetcher_function` | Delete a saved workflow

## Workflows

Saved functions are data-only JSON files in [`functions/`](functions). Supported step ops:

```text
fetch_url, fetch_json, fetch_each_url, fetch_each_json,
discover_page, get_robots_txt, json_path, regex, unique, map, template
```

See [`functions/README.md`](functions/README.md) for bundled workflows and command examples.

## Safety

- Public web only by default: localhost, private IPs, link-local, multicast, and private DNS resolutions are blocked.
- `Authorization` headers are blocked unless `FETCHER_ALLOW_AUTH_HEADER=true`.
- Response size and timeout limits are enforced.
- Challenge detection is diagnostic only; waFetchMCP does not bypass CAPTCHA, WAF, login, or bot checks.
- robots.txt is surfaced for agents to inspect before repeated fetching.

Environment variable | Default
--- | ---
`FETCHER_ALLOW_PRIVATE` | `false`
`FETCHER_ALLOW_AUTH_HEADER` | `false`
`FETCHER_MAX_BYTES` | `1048576`
`FETCHER_TIMEOUT_MS` | `30000`
`FETCHER_FUNCTIONS_DIR` | `functions`
`FETCHER_USER_AGENT` | `waFetchMCP/0.1`

## Development

```bash
npm install
npm test
```

CI runs the same smoke tests on Node 18, 20, and 22.

## Links

- [MCP client install guide](docs/INSTALL-CODEX-CLAUDE.md)
- [Bundled workflow functions](functions/README.md)
- [Workflow board source](docs/wafetchmcp-workflow.md)
- [Issues](https://github.com/waltod/waFetchMCP/issues)

## License

MIT
