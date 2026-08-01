# YUFENG Desktop Agent Harness

YUFENG Agent 的默认交互不是画布或生图页，而是一个 Codex 风格的桌面任务工作台：用户描述希望电脑完成的任务，Agent 每轮只决定一个下一动作，执行后观察真实结果，再继续、请求批准或完成。

## 北极星

> 用户说要什么，Agent 自己选择工具、执行、检查和修改；危险动作由用户批准，最后交付结果。

Canvas 不在正常执行链路中。旧 Canvas 仅作为迁移期的无路由源码保留，后续确认不再需要其项目数据后可以彻底删除。

## 当前运行结构

```text
User Task
   ↓
WorkbenchSession ──→ Planner（每轮一个 next action）
   ↓                          ↑
ToolRegistry                  │ sanitized observation
   ├── workspace.*            │
   ├── terminal.run           │
   ├── computer.*             │
   └── creative.generate ─────┘
   ↓
WorkbenchEventStream → Projector → Workbench UI
   ↓
WorkbenchSessionRepository → 本地任务历史
```

关键边界：

- 通用 Planner 只看到注册工具的名称、描述、schema、风险和审批策略，不直接接触 Electron IPC。
- Creative 工具内部仍只调用 `generate_image`、`analyze_image`、`generate_video` 等能力，不直接点名供应商模型。
- 写文件、运行命令和 macOS 控制在执行前必须进入 `awaiting_approval`；模型不能自行设置 approval。
- 文件工具只访问用户选择的真实工作区根目录；终端使用 executable + args，不使用 shell 字符串拼接。
- 终端超时和取消是 best-effort：Unix 终止受控进程组，Windows 终止直接子进程。主动脱离该边界的后代进程不承诺被终止，未观察到直接进程退出时返回 `termination_unconfirmed`。
- Provider 工具不导入 Canvas store，不创建节点，也不要求 Vue Flow 组件处于挂载状态。
- 图片和视频的真实 URL 只保存在 ArtifactStore 与展示层；Planner 看到稳定 artifact ID。
- API Key、裸 base64、完整 Provider 响应和媒体 URL不会进入 Planner 上下文或运行快照。
- Workbench UI 只投影事件和提交用户决定，不直接承担工具执行职责；桌面 App 和 Web 调试页复用同一套界面。
- 运行历史只在本地展示，不回灌 Planner 上下文；凭据、data URL、blob URL 和裸 base64 不进入持久化记录。

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

### V0.5a：Local Run History

- 运行投影和作品元数据最多保留 50 条，刷新或重启后可只读打开。
- 桌面端 data URL 图片通过 IPC 落入 App 私有 assets 目录，历史只保存受控相对引用。
- 只有无签名参数、无凭据且不指向本机/私网的 HTTPS 作品地址可作为 best-effort 线索；带 Token 或签名的 Provider URL 只保留元数据。
- App 上次退出时仍在运行的记录会标记为 `interrupted`，不自动重提远程任务。
- 这一阶段不是 checkpoint：可回看，不会从中断的某一步续跑。

详细契约见 [V0.5a Local Run History](plans/agent-v0.5a-run-history.md)。

### V0.6：Desktop Agent Workbench

- 通用 `WorkbenchSession` 支持多轮消息、逐步工具调用、失败观察、审批、拒绝改道和最终答复。
- Electron 提供工作区、受控终端与 macOS 屏幕 / 应用 / 点击 / 输入工具。
- 三栏 Workbench 展示本地任务历史、消息与工具活动、审批卡、文件变更、权限和产物。
- Creative Agent 作为 `creative.generate` 工具接入，不再定义整个产品边界。
- 截图只在内存展示，任务事件流不保存原始截图或媒体字节。

详细契约见 [V0.6 Desktop Workbench](plans/agent-v0.6-workbench.md)。

## 动态决策的边界

`InterventionPolicy` 已作为纯决策核心保留并有测试覆盖，可根据质量证据选择 accept、regenerate、edit 或 upscale，并带循环保护。但当前 Headless Runtime 只启用已具备直接 Provider 执行器的安全路径：生成、观察、重做和视频。

在无画布 `edit_image` 与 `upscale_image` 工具完成前，不向用户宣称 Agent 已能执行局部编辑或真正超分。决策能力和执行能力必须同时存在才会注册给 Agent。

## 下一阶段

1. 结构化补丁、文件 diff 预览与按变更批准。
2. run checkpoint、安全续跑与已接受命令 / Provider 任务的恢复。
3. 成本预算、最大调用次数、token 与 Provider 任务统计。
4. 浏览器工具和可安装的 Tool / MCP 扩展。
5. 确认旧项目迁移完成后，删除隔离的 Canvas 代码与 Vue Flow 依赖。
