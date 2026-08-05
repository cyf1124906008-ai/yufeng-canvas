# Agent V0.7：Command Center

> 实现状态：已落地。V0.7 把 V0.6 的通用 Workbench 收紧为可审查、可干预的桌面命令中心，重点补齐计划状态、结构化文件变更、条件回滚、终端实时状态和 Provider 配置入口。

## 目标

V0.7 不扩大 Agent 的系统权限，而是让现有能力更接近可靠的编码 Agent：用户能看见计划、工具阶段、真实命令输出和精确文件变更；Agent 修改现有文件时不再只能整体覆盖。

执行循环仍然是：

```text
用户任务
  ↓
计划 / 更新步骤
  ↓
选择一个工具 → 执行 → 观察
  ↓                    ↑
diff / 输出 / 错误 / 审批结果
  ↓
继续、改道、请求用户决定或完成
```

## 新命令中心

默认界面继续使用一个通用 `WorkbenchSession`，但信息结构升级为命令中心：

- 左侧展示本地工作区、Provider 状态、任务历史和新任务入口。
- 中间展示用户消息、Agent 回复、工具调用、审批卡和终端阶段事件，底部固定任务输入区。
- 右侧检查器展示结构化计划、工作区上下文、文件 diff、作品和已知运行信息。
- 文本附件会作为有明确边界的任务资料加入当前消息；附件内容不获得系统指令权限。
- 历史任务保持只读；恢复历史不会自动重放本地命令、补丁或远程 Provider 请求。

Workbench UI 只消费事件投影，不直接执行文件、终端或电脑操作。

## 结构化任务计划

`task.update_plan` 是无副作用的 Workbench 工具。计划包含 1 到 32 个步骤：

```js
{
  explanation: '先审计，再修改并验证',
  steps: [
    { id: 'audit', step: '读取关键文件', status: 'completed' },
    { id: 'change', step: '应用补丁', status: 'in_progress' },
    { id: 'verify', step: '运行测试', status: 'pending' }
  ]
}
```

状态只允许 `pending`、`in_progress`、`completed`，且最多一个步骤为 `in_progress`。每次更新产生 `plan_updated` 事件；Projector 计算计划总状态、revision 和 updatedAt。计划是可展示的执行摘要，不是模型隐藏思维链。

## SHA 绑定的结构化补丁

`workspace.read` 除脱敏后的 UTF-8 内容外，还返回真实文件的 SHA-256。修改现有文本文件时，Agent 应优先调用 `workspace.patch`：

```js
{
  path: 'src/example.js',
  beforeSha256: '<workspace.read 返回的 sha256>',
  hunks: [
    {
      startLine: 12,
      oldLines: ['const enabled = false'],
      newLines: ['const enabled = true']
    }
  ],
  finalNewline: true
}
```

补丁的行号基于同一个原文件。执行前后会检查：

1. 路径仍位于当前 workspace root（桌面 App 首次启动自动绑定专用默认目录），且不经过符号链接。
2. 文件是有效 UTF-8 文本，大小与补丁输入均在上限内。
3. 当前 SHA-256 与 `beforeSha256` 完全一致。
4. 每个 `oldLines` 与指定位置完全一致，hunk 不重叠。
5. 原生确认框展示完整规范化补丁，而不是截断摘要。
6. 临时文件写完后通过同目录 rename 替换，避免半写文件。

成功后产生 `workspace_diff` 事件，包含路径、before / after SHA、hunks、最终换行状态与操作类型。事件进入历史前统一脱敏；原始秘密值不会因为 diff 功能进入持久任务记录。

`workspace.write` 仍用于明确的新建文件或用户批准的完整写入，但不再是修改现有文件的默认方案。

## 条件回滚

结构化补丁成功后，Electron 在内存中保存一条原始 rollback record，并向事件流只返回不可猜测的 `rollbackId`。UI 必须把它显示为“条件回滚”，不能显示为永久、无条件的撤销能力。

回滚需要同时满足：

- rollback record 仍存在于当前 App 会话；记录最多保留 100 条。
- 用户没有切换 workspace root，App 没有重启。
- 当前文件 SHA-256 仍等于原 diff 的 `afterSha256`。
- 逆向应用 hunks 后的 SHA-256 精确等于原 diff 的 `beforeSha256`。
- 用户批准 Workbench 工具调用，并再次确认 Electron 展示的完整原始补丁。

任何条件不满足都会 fail closed，不会用整文件覆盖来“强行回滚”。成功回滚同样产生 `workspace_diff`，并生成新的条件 rollback record，因此同一机制可以在条件仍满足时撤销这次回滚。

持久事件中的回滚字段为：

```js
{
  state: 'conditional',
  rollbackId: '<opaque id>',
  requires: ['ephemeral_record_present', 'current_sha256_matches_after'],
  expires: 'app_session',
  expectedCurrentSha256: '<diff afterSha256>'
}
```

重开历史时即使仍能看到旧 `rollbackId`，Electron 也没有对应的内存记录，调用会被拒绝。

## 终端实时状态

`terminal.run` 仍使用 `executable + args` 和 `shell:false`。Workbench 在轮询受控 job 时产生 `tool_progress` 事件，阶段包括 `starting`、`started`、运行状态以及最终状态，并附带：

- 当前字符长度、输出字节和输出上限；
- 是否截断、是否超时、exitCode；
- best-effort 终止边界与 `termination_unconfirmed`。

运行中的 stdout / stderr 文本不进入 `tool_progress`：独立脱敏每个分片会让跨分片的凭据有机会泄漏。命令结束后，累计的有界输出作为一条最终 observation 统一脱敏；它也是命令是否成功的事实来源。

这里实现的是非交互式受控命令，不是真正 PTY：stdin 当前为忽略状态，不支持交互式 TUI、终端尺寸、颜色能力协商或 shell 会话保持。

## Provider Console

“模型与 API”入口升级为 Providers & Models 控制台，已实现：

- Provider 列表及本机配置状态；
- 默认 Base URL / API Key；
- 对话、图片、视频能力专用的地址与 Key 覆盖；
- 规范化后的只读 endpoint route 预览；
- 连接测试、模型同步、DataEyes 实测模型目录导入；
- 手动维护对话、图片、视频模型，图片模型可指定协议；
- 能力覆盖摘要，以及本机数据导入 / 导出入口。

这些是本地连接与目录管理能力。V0.7 没有实现跨用户的实时价格、成功率学习、远程配额治理或 Provider 账号托管。

## 事件与投影

V0.7 新增三类 append-only Workbench 事件：

| 事件 | 投影 |
| --- | --- |
| `plan_updated` | `projection.plan` |
| `tool_progress` | `projection.toolProgress[]` 与 `toolCalls[].latestProgress` |
| `workspace_diff` | `projection.workspaceDiffs[]` 与 `toolCalls[].workspaceDiffId` |

所有事件先经过统一 JSON-safe 脱敏边界。危险工具的原始参数只在当前执行与 Electron 原生审批链中短暂存在，恢复的脱敏历史不能重放副作用。

## 明确未实现

V0.7 不包含以下能力：

1. **真正 PTY**：没有交互式 shell、stdin 会话、终端 resize 或 TUI 支持。
2. **任务级多并发隔离 / Git worktree**：没有为每个任务自动创建独立工作树、容器或文件系统；任务仍操作当前绑定的同一个 workspace root，用户可以显式切换目录。
3. **可配置权限模式**：没有 `read-only`、`ask`、`full-access` 等策略档位，也没有持久命令 allowlist。当前策略仍是安全读取直接执行，危险副作用逐项审批并由 Electron 原生确认。
4. **Checkpoint 续跑**：任务历史可恢复查看，但不会自动续跑中断的命令、补丁或 Provider 任务。

这些限制应在 UI、README 和发布说明中保持可见，不能用“Codex 风格”措辞暗示已经具备。

## 验收范围

- 多步骤任务能建立和更新计划，计划状态可由事件重建。
- 修改现有文件会生成 SHA 绑定的结构化 diff，冲突时拒绝。
- 条件回滚在原文件未变化且原始记录仍在时恢复原 SHA；记录过期或文件变化时拒绝。
- 终端运行期间能观察阶段、输出长度与截断状态，结束后能查看统一脱敏的最终输出；取消无法确认时不会误报已停止。
- Provider Console 能配置连接、测试、同步 / 导入模型并展示能力覆盖。
- 持久历史不包含 API Key、裸媒体字节、原始截图或未脱敏 diff 内容。
