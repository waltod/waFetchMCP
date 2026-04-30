# Installing waFetchMCP in Codex and Claude

This guide shows how to install waFetchMCP as a local stdio MCP server.

## Prerequisites

- Node.js 18 or newer.
- A local checkout of waFetchMCP.
- Dependencies installed with `npm install`.

```bash
git clone https://github.com/waltod/waFetchMCP.git
cd waFetchMCP
npm install
npm test
```

Use the absolute path to `src/mcp-server.js` in your MCP client config.

waFetchMCP is a direct HTTP fetcher. It can report challenge-like signals and inspect robots.txt, JSON-LD, and OpenGraph metadata during discovery, but it does not bypass CAPTCHA, login walls, bot checks, or other access controls.

## Codex

Codex reads MCP servers from `config.toml`.

Common config locations:

- Windows: `C:\Users\<you>\.codex\config.toml`
- macOS/Linux: `~/.codex/config.toml`

Add this block:

```toml
[mcp_servers.waFetchMCP]
command = "node"
args = ["C:\\path\\to\\waFetchMCP\\src\\mcp-server.js"]
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0

[mcp_servers.waFetchMCP.env]
FETCHER_MAX_BYTES = "1048576"
FETCHER_TIMEOUT_MS = "30000"
FETCHER_FUNCTIONS_DIR = "C:\\path\\to\\waFetchMCP\\functions"
```

Windows example:

```toml
[mcp_servers.waFetchMCP]
command = "node"
args = ['C:\MCP\waFetchMCP\src\mcp-server.js']
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0

[mcp_servers.waFetchMCP.env]
FETCHER_MAX_BYTES = "1048576"
FETCHER_TIMEOUT_MS = "30000"
FETCHER_FUNCTIONS_DIR = 'C:\MCP\waFetchMCP\functions'
```

macOS/Linux example:

```toml
[mcp_servers.waFetchMCP]
command = "node"
args = ["/Users/you/MCP/waFetchMCP/src/mcp-server.js"]
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0

[mcp_servers.waFetchMCP.env]
FETCHER_MAX_BYTES = "1048576"
FETCHER_TIMEOUT_MS = "30000"
FETCHER_FUNCTIONS_DIR = "/Users/you/MCP/waFetchMCP/functions"
```

Restart Codex after editing the config.

### Verify in Codex

Ask Codex to list available MCP tools or run:

```text
Use waFetchMCP to list saved fetcher functions.
```

Expected tools include:

- `fetch_url`
- `fetch_json`
- `discover_page`
- `get_robots_txt`
- `list_fetcher_functions`
- `run_fetcher_function`
- `save_fetcher_function`

After setup, a useful smoke prompt is:

```text
Use waFetchMCP to discover https://example.com and summarize title, robots, OpenGraph, JSON-LD, endpoints, and any challenge signals.
```

## Claude Desktop

Claude Desktop reads MCP servers from `claude_desktop_config.json`.

Common config locations:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add `waFetchMCP` under `mcpServers`:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": [
        "C:\\path\\to\\waFetchMCP\\src\\mcp-server.js"
      ],
      "env": {
        "FETCHER_MAX_BYTES": "1048576",
        "FETCHER_TIMEOUT_MS": "30000",
        "FETCHER_FUNCTIONS_DIR": "C:\\path\\to\\waFetchMCP\\functions"
      }
    }
  }
}
```

Windows example:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": [
        "C:\\MCP\\waFetchMCP\\src\\mcp-server.js"
      ],
      "env": {
        "FETCHER_MAX_BYTES": "1048576",
        "FETCHER_TIMEOUT_MS": "30000",
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

macOS example:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": [
        "/Users/you/MCP/waFetchMCP/src/mcp-server.js"
      ],
      "env": {
        "FETCHER_MAX_BYTES": "1048576",
        "FETCHER_TIMEOUT_MS": "30000",
        "FETCHER_FUNCTIONS_DIR": "/Users/you/MCP/waFetchMCP/functions"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config.

### Verify in Claude

Open a new Claude chat and ask:

```text
Use waFetchMCP to list saved fetcher functions.
```

Claude should be able to call `list_fetcher_functions` and show bundled functions such as `fandom-allpages` and `fandom-page-html`.

If your checkout includes LCSC-style catalog examples, they will appear in the same function list. The exact names may differ by package version, so prefer `list_fetcher_functions` before running an example.

## Optional Safety Settings

waFetchMCP is public-web only by default. These settings should be enabled only when needed:

```toml
FETCHER_ALLOW_PRIVATE = "true"
FETCHER_ALLOW_AUTH_HEADER = "true"
```

Meaning:

- `FETCHER_ALLOW_PRIVATE=true` allows localhost and private network fetches.
- `FETCHER_ALLOW_AUTH_HEADER=true` allows outgoing `Authorization` headers.

Leave both disabled for normal public website exploration.

## Discovery And Compliance Notes

- Use `discover_page` before saving a new workflow for an unknown site.
- Inspect `robots` output and respect crawl guidance before repeated fetching.
- Use JSON-LD and OpenGraph output when it provides enough structured metadata; it is usually more stable than scraping visible page text.
- Treat `challenge` output as diagnostic information. waFetchMCP reports CAPTCHA, bot-check, login, access-denied, and JavaScript verification signals, but it does not bypass them.
- For sites that legitimately require browser interaction, handle that outside waFetchMCP with a site-approved browser workflow, authenticated integration, or official API.

## Troubleshooting

If the MCP server does not appear:

1. Confirm Node is on PATH: `node --version`.
2. Run `npm test` inside the waFetchMCP directory.
3. Use absolute paths in config.
4. Restart the MCP client after config changes.
5. Check client logs for JSON or TOML syntax errors.
6. Confirm the configured `FETCHER_FUNCTIONS_DIR` exists.

If a fetch is blocked:

- The URL may resolve to a private or local IP.
- The protocol may not be `http` or `https`.
- The response may exceed `FETCHER_MAX_BYTES`.
- `discover_page` may have detected a challenge, login gate, or robots policy. Decide the site-specific handling in your workflow.
- The server may require browser JavaScript execution; handle that outside waFetchMCP when appropriate for the site.
