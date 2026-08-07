# DataEyes Code Local API / MCP

DataEyes Code 在桌面 App 中启动一个仅监听 localhost 的辅助服务，用于健康检查、发布信息和后续 MCP 工具扩展。

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
  "app": "DataEyes Code",
  "version": "1.1.0",
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
- `yufeng.support`: returns project and support links.
- `yufeng.prompt_suggestions`: returns starter task ideas.

`yufeng.*` 是为兼容现有 MCP 客户端保留的稳定协议标识，不代表当前展示品牌。

Example:

```bash
curl -X POST http://127.0.0.1:43112/mcp ^
  -H "Content-Type: application/json" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

## Notes

- The server binds to `127.0.0.1` only.
- The desktop app does not expose user API keys through this local API.
- Workbench 的文件、终端和电脑工具通过受信任 Electron IPC 使用，不会由这个无认证的 localhost 端点暴露。
