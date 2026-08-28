# YApi to Definition

Generate TypeScript types or JavaScript JSDoc definitions from private YApi interface links. Credentials stay in the MCP process and are never tool arguments or results.

## MCP configuration

```json
{
  "mcpServers": {
    "yapi-auto-mcp": {
      "command": "npx",
      "args": ["-y", "yapi-to-definition", "--stdio"],
      "env": {
        "YAPI_BASE_URL": "https://yapi.example.com",
        "YAPI_TOKEN_123": "project-123-token",
        "YAPI_TOKEN_456": "project-456-token"
      }
    }
  }
}
```

The project id is parsed from `/project/<id>/` in the YApi interface URL. Configure one `YAPI_TOKEN_<id>` variable for each project. Use plain environment-variable names and plain URL strings; do not include Markdown escapes or `${PROJECTID}` placeholders.

STDIO MCP clients can use the same `npx` command. Codex supports STDIO commands, arguments, and environment variables in MCP configuration.

## Local development

```bash
npm install
```

For multiple YApi domains, configure each project once with the included helper. The default config file is `~/.config/yapi-to-definition/config.json` on macOS/Linux and `%APPDATA%\\yapi-to-definition\\config.json` on Windows.

```bash
npm run config -- add https://yapi.example.com 123
```

For a YApi instance installed below a path, include it in the base URL:

```bash
npm run config -- add https://example.com/yapi 123
```

The command prompts for the token without echoing it. For secret-manager or CI environments, store only an environment-variable reference:

```bash
npm run config -- add https://yapi.example.com 123 --token-env YAPI_TOKEN_PROJECT_123
```

The older single-project `YAPI_BASE_URL`, `YAPI_PROJECT_ID`, and `YAPI_TOKEN` combination is also supported.

The generated configuration file contains a project token unless `--token-env` is used. Keep it user-readable only and never commit it. Configuration is reloaded on every tool call, so adding another project does not require restarting the MCP server.

## Connect to Codex

Add the local STDIO server in Codex settings, or add this to `~/.codex/config.toml`:

```toml
[mcp_servers.yapi_to_definition]
command = "npx"
args = ["-y", "yapi-to-definition", "--stdio"]

[mcp_servers.yapi_to_definition.env]
YAPI_BASE_URL = "https://yapi.example.com"
YAPI_TOKEN_123 = "project-123-token"
```

Restart Codex, then ask:

```text
Generate TypeScript definitions from https://yapi.example.com/project/123/interface/api/456
```

Use `language: "js"` when JavaScript JSDoc output is needed. The MCP server exposes one read-only tool: `generate_yapi_definition`.

Other MCP clients can use the same STDIO command and arguments. No Codex-only API is required.
