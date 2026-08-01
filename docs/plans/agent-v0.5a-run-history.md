# Agent V0.5a: Local Run History

## 目标

V0.5a 只解决一个问题：Agent 运行结束后，刷新页面或重启桌面 App 仍能找回这次任务的目标、执行轨迹、结果状态和作品引用。

它不是 checkpoint 或 resume runtime。历史记录是只读投影，不会让 Agent 从中断步骤继续执行。

## 数据流

```text
AgentRunner event
  ↓
RunProjector snapshot
  ↓
Artifact metadata manifest
  ↓
RunHistoryRepository (local, max 50)
  ↓
AgentRunHistoryPanel (read-only)
```

Planner 不读取 RunHistoryRepository。历史不是新一轮推理的隐式记忆。

## 持久化契约

- Schema 版本为 1，默认 key 为 `yufeng-agent-run-history-v1`。
- 最多保留 50 条，同 run ID 更新且移到最前。
- 单条记录有硬大小上限；损坏 JSON、未知 schema 或过大文档 fail closed。
- API Key、Authorization、Token、Cookie、Password、data URL、blob URL、裸 base64 和媒体字节会在写入和读取时再次脱敏。
- 本地记录可删除或全部清空；对应的 App 私有图片副本通过受控 IPC 异步清理。超过 50 条自动淘汰时也使用同样的清理边界。

## 作品恢复边界

### 桌面图片

Provider 返回 data URL 时，Electron main process 把图片落到 App 私有 assets 根目录。渲染层的历史 manifest 只保存 `assetRef` 相对引用和 main process 针对 `runId + assetRef` 签发的所有权证明，不保存绝对路径或 base64。读取与删除时会验证可信 renderer、Agent 命名空间、所有权证明、词法边界、realpath 边界和符号链接；图片写入、读取和文件签名检查有 25MB 硬上限，每个 run 最多 250MB，Agent 资产总计最多 2GB。

### 远程图片和视频

只有不带 query / hash / 账号信息、且不指向本机或私网的 HTTPS URL 会保留为 best-effort 恢复线索。带签名、Token、过期参数的 Provider URL 不进入 localStorage，历史中只保留作品元数据。

当前 Electron assets API 只落盘 data URL 图片，不落盘视频字节。

## 异常退出

启动 runtime 时，上次留在 queued / planning / running / waiting / retrying 的历史会转为 `interrupted`。它不显示“停止”或“一键重试”动作，避免在供应商可能仍在运行时重复提交和重复计费。

历史 I/O 是 best-effort 副作用，有独立超时。它不延迟 Agent 完成，也不会阻塞下一个 Provider 任务。删除与清空使用 session tombstone / generation，迟到的持久化任务不能把记录复活。

## 验收标准

- 完成、失败、停止和中断记录可在本地历史显示。
- 点击历史可只读回看 RunProjector 快照和可用作品。
- 持久化 JSON 不包含 API 凭据或媒体 base64。
- 本地图片稳定 ID 在重启后保留。
- 上次未完成的运行不会自动重提供应商。
