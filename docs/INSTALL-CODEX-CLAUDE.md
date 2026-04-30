# Installing waFetchMCP in MCP Clients

This guide covers local stdio installation for current MCP clients. Use the client CLI when one exists; otherwise paste the JSON/YAML config.

Assume this checkout:

```powershell
git clone https://github.com/waltod/waFetchMCP.git C:\MCP\waFetchMCP
cd C:\MCP\waFetchMCP
npm install
npm test
```

Server command:

```text
node C:\MCP\waFetchMCP\src\mcp-server.js
```

Replace `C:\MCP\waFetchMCP` with your absolute checkout path on macOS/Linux.

## Fast Install Matrix

Client | Best current path
--- | ---
Codex CLI / Codex IDE | `codex mcp add`
Claude Code | `claude mcp add`
Claude Desktop | `claude_desktop_config.json`
Gemini CLI | `gemini mcp add`
OpenCode | `opencode.jsonc`
Cursor | `.cursor/mcp.json` or `~/.cursor/mcp.json`
VS Code / Copilot Agent Mode | `code --add-mcp` or `.vscode/mcp.json`
GitHub Copilot CLI / cloud agent | `/mcp add`, `~/.copilot/mcp-config.json`, or repo Cloud agent settings
Windsurf Cascade | `~/.codeium/windsurf/mcp_config.json`
Cline | MCP Servers UI or `cline_mcp_settings.json`
Continue | `.continue/mcpServers/*.yaml` or copied MCP JSON
Roo Code | MCP Servers UI / `mcp_settings.json`
Zed | `context_servers` in Zed settings
Open WebUI / cloud UI | Use `mcpo` bridge or a hosted Streamable HTTP MCP server

## Codex

Preferred CLI install:

```powershell
codex mcp add waFetchMCP --env FETCHER_MAX_BYTES=1048576 --env FETCHER_TIMEOUT_MS=30000 --env FETCHER_FUNCTIONS_DIR=C:\MCP\waFetchMCP\functions -- node C:\MCP\waFetchMCP\src\mcp-server.js
codex mcp list
codex mcp get waFetchMCP
```

Remove:

```powershell
codex mcp remove waFetchMCP
```

Manual fallback in `~/.codex/config.toml`:

```toml
[mcp_servers.waFetchMCP]
command = "node"
args = ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"]
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0

[mcp_servers.waFetchMCP.env]
FETCHER_MAX_BYTES = "1048576"
FETCHER_TIMEOUT_MS = "30000"
FETCHER_FUNCTIONS_DIR = "C:\\MCP\\waFetchMCP\\functions"
```

## Claude Code

User-wide install:

```powershell
claude mcp add --scope user -e FETCHER_MAX_BYTES=1048576 -e FETCHER_TIMEOUT_MS=30000 -e FETCHER_FUNCTIONS_DIR=C:\MCP\waFetchMCP\functions waFetchMCP -- node C:\MCP\waFetchMCP\src\mcp-server.js
claude mcp list
claude mcp get waFetchMCP
```

Project-shared install:

```powershell
claude mcp add --scope project -e FETCHER_FUNCTIONS_DIR=C:\MCP\waFetchMCP\functions waFetchMCP -- node C:\MCP\waFetchMCP\src\mcp-server.js
```

Claude Code stores project-scoped servers in `.mcp.json` and user-scoped servers in `~/.claude.json`.

## Claude Desktop

Edit `claude_desktop_config.json`.

Windows:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Config:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_MAX_BYTES": "1048576",
        "FETCHER_TIMEOUT_MS": "30000",
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

Restart Claude Desktop.

## Gemini CLI

Preferred CLI install:

```powershell
gemini mcp add -s user -e FETCHER_MAX_BYTES=1048576 -e FETCHER_TIMEOUT_MS=30000 -e FETCHER_FUNCTIONS_DIR=C:\MCP\waFetchMCP\functions waFetchMCP node C:\MCP\waFetchMCP\src\mcp-server.js
```

Manual fallback in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      },
      "timeout": 30000
    }
  }
}
```

Verify inside Gemini CLI:

```text
/mcp
```

## OpenCode

Add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "waFetchMCP": {
      "type": "local",
      "command": ["node", "C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "enabled": true,
      "environment": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

## Cursor

Project config:

```text
.cursor/mcp.json
```

Global config:

```text
~/.cursor/mcp.json
```

Config:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

## VS Code / GitHub Copilot Agent Mode

Install with the `code` CLI:

```powershell
code --add-mcp "{\"name\":\"waFetchMCP\",\"command\":\"node\",\"args\":[\"C:\\MCP\\waFetchMCP\\src\\mcp-server.js\"],\"env\":{\"FETCHER_FUNCTIONS_DIR\":\"C:\\MCP\\waFetchMCP\\functions\"}}"
```

Workspace fallback in `.vscode/mcp.json`:

```json
{
  "servers": {
    "waFetchMCP": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

Then open Copilot Chat in Agent Mode and enable the server in the tools picker.

## GitHub Copilot CLI And Cloud Agent

Copilot CLI interactive install:

```text
/mcp add
```

Choose `STDIO`, set command to `node C:\MCP\waFetchMCP\src\mcp-server.js`, and set environment variables as JSON.

Manual user config in `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      },
      "tools": ["*"]
    }
  }
}
```

For Copilot cloud agent, paste the same `mcpServers` shape in repository Settings, Copilot, Cloud agent. A stdio server must be installable inside the agent environment; otherwise expose waFetchMCP over Streamable HTTP.

## Windsurf Cascade

Edit:

```text
~/.codeium/windsurf/mcp_config.json
```

Config:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

## Cline

Use the MCP Servers icon, then Configure, or edit `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      },
      "disabled": false
    }
  }
}
```

## Continue

Create `.continue/mcpServers/wafetchmcp.yaml`:

```yaml
name: waFetchMCP
version: 0.1.0
schema: v1
mcpServers:
  - name: waFetchMCP
    type: stdio
    command: node
    args:
      - 'C:\MCP\waFetchMCP\src\mcp-server.js'
    env:
      FETCHER_FUNCTIONS_DIR: 'C:\MCP\waFetchMCP\functions'
```

Continue can also read standard MCP JSON copied into `.continue/mcpServers/`.

## Roo Code

Use MCP Servers, then Edit Global MCPs. Roo uses the same `mcpServers` JSON shape as Cline:

```json
{
  "mcpServers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      },
      "disabled": false
    }
  }
}
```

Roo Code's own docs currently announce a May 15, 2026 shutdown, so prefer Cline for new long-lived setups.

## Zed

Add a custom context server in Zed settings:

```json
{
  "context_servers": {
    "waFetchMCP": {
      "command": "node",
      "args": ["C:\\MCP\\waFetchMCP\\src\\mcp-server.js"],
      "env": {
        "FETCHER_FUNCTIONS_DIR": "C:\\MCP\\waFetchMCP\\functions"
      }
    }
  }
}
```

Then check the Agent Panel settings indicator for the server.

## Open WebUI And Cloud UIs

waFetchMCP currently ships as a stdio MCP server. Browser/cloud UIs usually cannot launch local stdio processes directly.

Open WebUI native MCP support expects Streamable HTTP. For waFetchMCP today, use Open WebUI's `mcpo` bridge to expose the stdio server as OpenAPI:

```powershell
$env:FETCHER_FUNCTIONS_DIR="C:\MCP\waFetchMCP\functions"
uvx mcpo --port 8000 --api-key "top-secret" -- node C:\MCP\waFetchMCP\src\mcp-server.js
```

Then add the generated OpenAPI server in Open WebUI's Admin Settings / External Tools, using the same API key.

For other cloud UIs, the rule is the same: either the UI must support stdio on the same machine, or you need to deploy/bridge waFetchMCP behind an HTTP transport.

## Verify

Ask the client:

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

## Optional Safety Settings

Keep these disabled unless you intentionally need them:

```text
FETCHER_ALLOW_PRIVATE=true
FETCHER_ALLOW_AUTH_HEADER=true
```

## References Checked

- OpenAI Codex MCP docs: https://developers.openai.com/codex/mcp
- Anthropic Claude Code MCP docs: https://docs.anthropic.com/en/docs/claude-code/mcp
- Gemini CLI MCP docs: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html
- OpenCode MCP docs: https://opencode.ai/docs/mcp-servers
- Cursor MCP docs: https://docs.cursor.com/advanced/model-context-protocol
- VS Code MCP docs: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
- GitHub Copilot CLI MCP docs: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
- GitHub Copilot cloud agent MCP docs: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp
- Windsurf Cascade MCP docs: https://docs.windsurf.com/windsurf/cascade/mcp
- Cline MCP docs: https://docs.cline.bot/mcp/adding-and-configuring-servers
- Continue MCP docs: https://docs.continue.dev/customize/deep-dives/mcp
- Roo Code docs: https://docs.roocode.com
- Zed MCP docs: https://zed.dev/docs/ai/mcp
- Open WebUI MCP docs: https://docs.openwebui.com/features/mcp
- Open WebUI mcpo docs: https://docs.openwebui.com/features/extensibility/plugin/tools/openapi-servers/mcp/
