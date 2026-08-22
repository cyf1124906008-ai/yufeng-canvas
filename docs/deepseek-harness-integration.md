# DeepSeek Harness 集成说明

DataEyes Code 从 1.5.0 开始采用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Cordis 运行时契约改造 Agent 底层。第一阶段是嵌入式内核迁移，不是把独立的 `dsh web` 页面套进现有桌面应用。

## 第一阶段边界

本阶段复用官方架构的三个核心原语：

- `@deepseek-ai/cordis`：插件、显式服务依赖和可逆 effect。
- `@deepseek-ai/dsh-scope`：每个活动 `WorkbenchSession` 一个独立 scope。
- `@deepseek-ai/dsh-invariants`：安装官方 scope dispatch 运行时约束。

现有的 `WorkbenchSession` 仍是追加式事件记录和任务状态的事实来源，现有 `ToolRegistry` 继续执行审批保护、参数脱敏和工具调用。这保留了历史兼容性，同时把 Planner、工具注册表和 Session Factory 变为可以替换、卸载和观测的 Cordis 插件服务。

```text
Cordis Context
├── deepseek.invariants
├── deepseek.invariants.companion
├── deepseek.scope.companion
├── dataeyes.planner             -> dataeyesWorkbenchPlannerFactory
├── dataeyes.tools               -> dataeyesWorkbenchToolRegistry
└── dataeyes.sessions            -> dataeyesWorkbenchSessionFactory
    ├── dsh scope: session A
    ├── dsh scope: session B
    └── dsh scope: session C
```

`dataeyes.sessions` 显式依赖 Planner 和 Tool Registry 服务。卸载任何依赖，Cordis 会自动撤销 Session Factory；此时新任务创建会 fail-closed，不会绕过内核创建一个未受管 Session。

## 会话生命周期

`useAgentWorkbench()` 的外部任务 API、审批模式、历史恢复、停止、继续和执行中引导语义保持不变。内部生命周期调整为：

1. 创建任务时由 Harness Session Factory 创建 `WorkbenchSession`。
2. 为该 Session 建立独立的 `createScope(ctx, key)`。
3. 新建任务、切换历史、删除任务或清空历史时，立即取消旧 Session，并启动可观测的 scope quiescence 回收。
4. Vue scope 或整个 Workbench 销毁时，先销毁所有 Session scope，再卸载 Cordis 插件树。

scope 是注册可见性和资源所有权边界，不是操作系统沙箱或权限边界。文件、终端和电脑控制权限仍必须经过现有审批策略与 Electron 主进程校验。

## 可观测运行时

`useAgentWorkbench()` 新增两个等价的只读 computed 值：

- `harnessRuntime`
- `runtimeSnapshot`

快照只包含可公开诊断信息：

- upstream 与集成阶段；
- Cordis、dsh-scope、dsh-invariants 版本；
- 插件状态、依赖、提供的服务与激活顺序；
- 服务可用性；
- 活动 scope / session 数量；
- `lifecycleScoped: true` 与 `authorityBoundary: false` 的明确安全边界；
- 脱敏后的启动或销毁错误。

快照经过递归冻结，不包含 Context、scope key、服务函数、Planner、Tool Registry 或其他可执行 capability。

## 兼容回退

如果 Cordis 内核构造阶段同步失败，Workbench 会进入 `compatibility-fallback`，保留旧任务能力并在 Runtime Log 和只读快照中明确标记 `degraded`。如果已经完成插件启动但核心服务随后缺失，则不做静默回退，新建任务会返回 `HARNESS_SESSION_FACTORY_UNAVAILABLE`，避免绕开已经生效的生命周期边界。

## 后续迁移

下一阶段可以沿官方 [Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) 继续拆分模型适配器、审批策略、持久化和 Agent Loop。每一步都应先定义 service seam 和可逆插件，再迁移消费者；不要直接替换当前事件历史或审批权威。
