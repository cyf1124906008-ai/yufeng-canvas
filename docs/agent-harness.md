# YUFENG Creative Agent Harness

YUFENG Agent 的默认交互不是画布，而是一个自主任务运行器：用户描述最终作品，Agent 每轮只决定一个下一动作，执行后观察真实结果，再继续或完成。

## 北极星

> 用户说要什么，Agent 自己选择能力、执行、检查和修改，最后交付作品。

Canvas 不在正常执行链路中。旧 Canvas 仅作为迁移期的无路由源码保留，后续确认不再需要其项目数据后可以彻底删除。

## 当前运行结构

```text
User Goal
   ↓
AgentRunner ──→ Planner（每轮一个 action）
   ↓                    ↑
ToolRegistry            │ sanitized observation
   ↓                    │
Headless Creative Tool ─┘
   ↓
ModelRouter → DataEyes / configured provider
   ↓
ArtifactStore（私有媒体）
   ↓
analyze_image → QualityPolicy → continue / retry / done
   ↓
RunProjector → Agent Workspace
```

关键边界：

- Agent 只调用 `generate_image`、`analyze_image`、`generate_video` 等能力，不直接点名供应商模型。
- Provider 工具不导入 Canvas store，不创建节点，也不要求 Vue Flow 组件处于挂载状态。
- 图片和视频的真实 URL 只保存在 ArtifactStore 与展示层；Planner 看到稳定 artifact ID。
- API Key、裸 base64、完整 Provider 响应和媒体 URL不会进入 Planner 上下文或运行快照。
- Agent Workspace 只投影运行状态，不承担执行职责；桌面 App 和 Web 调试页复用同一套 runtime。

## 已完成阶段

### V0.1：逐步执行

- 图片目标：规划 Prompt → 生成图片 → 验证后交付。
- 视频目标：生成首图 → 检查首图 → 图生视频 → 交付。
- Planner 每轮返回一个 action；Verifier 阻止在真实结果出现前提前结束。

### V0.2：Result Observation

- `analyze_image` 读取真实图片并输出结构化评价。
- 本地 `QualityPolicy` 复算是否通过，不信任模型自报结论。
- 未通过时保留原候选、改进 Prompt 并有限重做。
- 没有 Vision 能力时明确标记为 degraded，不伪装成已完成视觉检查。

详细契约见 [V0.2 Result Observation](plans/agent-v0.2-result-observation.md)。

### V0.3：Model Intelligence Router

- 统一 ModelProfile 的能力、质量、速度、成本、可靠性、可用性与参数支持。
- 先做硬能力过滤，再按 balanced / quality / speed / cost 排序。
- 只对 429、5xx、超时、网络中断等安全重试类型切换候选。
- Provider 已接受异步任务后不再切换模型，避免重复提交和重复计费。

详细契约见 [V0.3 Model Router](plans/agent-v0.3-model-router.md)。

### V0.4：Headless Agent Runtime

- 图片与视频工具直接使用现有 Provider 协议，不经过 Canvas 节点执行器。
- 视频任务一旦创建，只轮询同一个任务；达到等待上限时返回 pending 信息，不再提交第二个模型。
- RunProjector 把 AgentRunner 事件转换成可序列化、安全且有界的 UI 快照。
- Agent Workspace 展示任务、执行轨迹、候选作品、停止/重试和最终交付。
- 默认路由改为 Agent Workspace；`/canvas/...` 重定向到 `/`。
- Windows 与 macOS 使用相同 Electron 桌面入口。

详细契约见 [V0.4 Headless Runtime](plans/agent-v0.4-headless-runtime.md)。

## 动态决策的边界

`InterventionPolicy` 已作为纯决策核心保留并有测试覆盖，可根据质量证据选择 accept、regenerate、edit 或 upscale，并带循环保护。但当前 Headless Runtime 只启用已具备直接 Provider 执行器的安全路径：生成、观察、重做和视频。

在无画布 `edit_image` 与 `upscale_image` 工具完成前，不向用户宣称 Agent 已能执行局部编辑或真正超分。决策能力和执行能力必须同时存在才会注册给 Agent。

## 下一阶段

1. 持久化项目、run checkpoint 与崩溃恢复。
2. 成本预算、最大调用次数、token 与 Provider 任务统计。
3. 无画布图片编辑 / 放大执行器。
4. 视频内容观察和失败后的受限修正。
5. 确认旧项目迁移完成后，删除隔离的 Canvas 代码与 Vue Flow 依赖。
