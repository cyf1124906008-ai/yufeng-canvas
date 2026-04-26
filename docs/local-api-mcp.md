# YUFENG Canvas Local API / MCP

YUFENG Canvas starts a localhost-only helper server in the desktop app. It is designed as the foundation for future workflow import, agent orchestration, and MCP integrations.

## Default Endpoint

```text
http://127.0.0.1:43112
```

Set a custom port before launching the app:

```bash
YUFENG_LOCAL_API_PORT=43113
```

Disable the local server:

```bash
YUFENG_LOCAL_API=0
```

## Health Check

```bash
curl http://127.0.0.1:43112/health
```

Response:

```json
{
  "ok": true,
  "app": "YUFENG Canvas",
  "version": "0.1.30",
  "mcp": "http://127.0.0.1:43112/mcp"
}
```

## MCP Endpoint

```text
POST http://127.0.0.1:43112/mcp
```

Supported JSON-RPC methods:

- `initialize`
- `tools/list`
- `tools/call`

Built-in tools:

- `yufeng.health`: returns app version and local API status.
- `yufeng.release`: returns the latest GitHub release page.

Example:

```bash
curl -X POST http://127.0.0.1:43112/mcp ^
  -H "Content-Type: application/json" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

## Notes

- The server binds to `127.0.0.1` only.
- The desktop app does not expose user API keys through this local API.
- Workflow import and multi-agent execution will be added as explicit tools after the UI flow is stable.
