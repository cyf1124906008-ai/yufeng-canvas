# Agent V0.4：Headless Runtime

状态：第一阶段已实现。

V0.4 将 Creative Agent 的执行链从 Canvas 节点中抽离。Agent 现在可以在没有 Vue Flow、节点组件或 Canvas store 的情况下，直接路由模型、调用 Provider、保存作品并观察结果。

## 目标

- 默认入口改为任务式 Agent Workspace。
- 图片和图生视频工具直接调用 Provider。
- Provider 响应中的媒体与凭证不进入 Agent 上下文。
- 异步视频避免重复提交和重复计费。
- UI 只是运行状态投影，卸载 UI 不影响 Agent 核心契约。
- 旧 Canvas 不注册用户路由，也不作为运行依赖。

## 执行链

```text
goal
  ↓
AgentRunner
  ↓
Planner → ToolRegistry
  ↓
headless generate_image / analyze_image / generate_video
  ↓
ModelRouter → Provider
  ↓
ArtifactStore
  ↓
sanitized observation → next action
```

## 主要模块

| 模块 | 责任 |
| --- | --- |
| `useHeadlessCreativeAgent` | 组合 Runner、Planner、Verifier、工具和展示投影。 |
| `headlessImageTool` | 直接执行图片 Provider，按 Router 候选处理安全 fallback。 |
| `headlessAnalyzeImageTool` | 从私有 ArtifactStore 取真实图片，交给共享观察器。 |
| `headlessVideoTool` | 创建并轮询图生视频任务，防止任务接受后再次提交。 |
| `headlessChatClient` | 调用文本 / Vision endpoint，不依赖 Canvas 日志。 |
| `RunProjector` | 将 Runner 事件转换成有界、可序列化、脱敏的 UI 状态。 |
| `AgentWorkspace` | 输入目标并展示任务轨迹、候选作品与交付结果。 |

## 安全与计费语义

- Router 只把临时、明确可重试的失败交给下一候选。
- 认证、权限、参数、能力、内容安全和用户取消不触发模型切换。
- 视频 Provider 返回 task ID 后，后续轮询失败只重试该 task。
- 等待耗尽返回 pending task，不创建另一个付费任务。
- ArtifactStore 对 Planner 只暴露 ID、类型和必要元数据。
- 运行投影递归清理 secret 字段、媒体 URL 与裸 base64。

## 已知边界

- 当前 ArtifactStore 是运行期内存存储，应用刷新后不会恢复；持久化与 checkpoint 属于下一阶段。
- 当前 headless 工具已覆盖图片、图片观察和图生视频。
- 动态 edit / upscale 决策核心已有，但直接 Provider 执行器尚未注册。
- 视频工具停止本地轮询后，Provider 已接受的远端任务可能仍继续运行。
- 本地 macOS 包未配置 Developer ID 签名和 notarization。

## 验收

自动测试覆盖：

- 无 Canvas 完成图片生成、视觉检查与交付。
- 已检查图片自主继续图生视频。
- 图片 Provider 临时错误按候选顺序 fallback。
- Provider 已接受任务后不会提交第二个视频任务。
- 取消、轮询重试、pending 和媒体脱敏。
- RunProjector 快照隔离、有界、可序列化且不泄漏媒体和凭证。

运行：

```bash
pnpm test
pnpm build
```

## 下一阶段

加入持久化 Run / Project、checkpoint、预算和调用统计，然后补齐无画布 edit / upscale 执行器。
