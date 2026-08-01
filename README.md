<p align="center">
  <img src="docs/images/logo-mark.svg" width="96" alt="YUFENG Agent logo" />
</p>

<h1 align="center">YUFENG Agent</h1>

<p align="center">
  本地桌面 Agent Harness：像 Codex / Claude Code 一样接收任务，自主调用文件、终端、电脑控制与创作工具。
</p>

<p align="center">
  <a href="https://github.com/cyf1124906008-ai/yufeng-canvas/releases/latest">Latest Release</a>
  ·
  <a href="https://dataeyes.ai/">申请 DataEyes API Key</a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0f172a?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" />
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-37-00a3ff?style=flat-square" />
</p>

## 产品方向

YUFENG Agent 不要求用户拖节点或手工连接工作流。默认入口是一个 Codex 风格的桌面任务工作台：

```text
用户任务
  ↓
WorkbenchSession → Planner 每轮决定一个动作
  ↓
ToolRegistry
  ├── 任务：建立计划 / 更新步骤状态
  ├── 工作区：列出 / 读取 / 搜索 / 结构化补丁 / 条件回滚
  ├── 终端：运行命令 / 实时状态 / 最终脱敏输出 / 停止任务
  ├── 电脑：检查屏幕、打开应用、点击、输入文本
  └── Creative Agent：图片 / 视频生成与观察
  ↓
Observation → 继续 / 改道 / 请求批准 / 最终答复
```

核心原则是“执行一步，观察结果，再决定下一步”。Creative Agent 仍然保留，但它现在只是通用 Agent 的一项工具能力。

## 当前能力

| 能力 | 当前实现 |
| --- | --- |
| Codex-style Agent Workbench | 新三栏命令中心：工作区与任务历史、对话和实时工具轨迹、计划 / 文件变更 / 产物检查器；支持多轮补充和文本附件。 |
| Generic Agent Session | Planner 每轮只返回 `message`、`tool_call` 或 `finish`；工具失败与拒绝都会作为 observation 继续决策。 |
| Task Plan | Agent 可建立并更新结构化步骤，最多一个步骤处于 `in_progress`；计划状态通过事件流实时投影，不展示隐藏思维链。 |
| Local Workspace Tools | 在用户选择的根目录内列文件、读文本、搜索和新建文件；现有文件优先使用 SHA 绑定的行级补丁，产生可审查 diff。 |
| Conditional File Rollback | 每次结构化补丁生成当前 App 会话内的一次性回滚记录；只有记录仍存在且当前文件 SHA 与原变更一致时，才可经再次审批原子回滚。 |
| Controlled Terminal | 使用 executable + args 运行，不拼接 shell；支持超时、输出上限、实时阶段与输出长度、停止，以及结束后的统一脱敏输出。每次执行都要批准。 |
| macOS Computer Tools | 检查系统权限、截屏并用 Vision 分析、打开应用、坐标点击和输入文本；副作用逐项批准。 |
| Provider Console | 统一管理 Provider、默认与能力专用 Base URL / API Key、连接测试、接口映射、模型同步、DataEyes 实测目录导入与手动模型目录。 |
| Headless Provider Runtime | Agent 工具直接调用图片、Vision 与视频 Provider，不依赖 Canvas 组件挂载或节点点击。 |
| Result Observation | 图片生成后自动做技术检查与视觉评价；未达标时改进提示词并有限重做。 |
| Model Intelligence Router | 按能力、质量、速度、成本、可靠性与可用性排序，安全处理临时失败与 fallback。 |
| Artifact Store | Planner 只接触稳定作品引用；媒体内容、API Key 和完整响应不进入 Agent 上下文。 |
| Local Task History | 最多保留 30 条本地事件流；截图字节、凭据和裸媒体内容不会写入任务历史。 |
| Desktop App | 同一套 Agent Workspace 可运行于 Windows、macOS Electron 应用，也可用于本地 Web 调试。 |

当前使用一个通用 Agent，不做 Multi-Agent。旧 Canvas 源码暂时留作迁移参考，但没有用户入口，也不在 Agent 执行链路中；所有 `/canvas/...` 地址都会回到 Agent Workbench。

## 安全边界

- `workspace.write`、`workspace.patch`、`workspace.revert_patch`、`terminal.run`、截屏、打开应用、点击、输入文本和 Creative 模型调用都会先暂停，必须由用户在界面中明确批准；桌面副作用还会由 Electron 主进程弹出一次绑定实际参数的原生确认。
- 文件访问限制在用户选择的 workspace root 内，并校验 realpath、父目录与符号链接。
- 结构化补丁以 `workspace.read` 返回的 SHA-256 绑定基线，并精确校验旧行；文件变化或补丁上下文不一致时拒绝写入。回滚是条件能力，不是永久撤销：原始补丁只在当前 App 内存中保留，切换工作区、记录过期或重启后会拒绝。
- `.env`、私钥、credentials 等敏感文件不会被自动读取或搜索；普通文件内容中的常见 Key、Bearer Token 和私钥片段会在离开主进程前脱敏。
- 终端不是完整 OS 沙箱：批准后启动的程序仍拥有当前 macOS 用户权限，所以批准卡会显示完整命令与参数。
- 终端取消采用 best-effort 边界：macOS/Linux 会终止受控进程组，Windows 会终止直接子进程；程序若主动脱离进程组或另建后台服务，系统无法保证后代全部退出，此时任务会明确显示 `termination_unconfirmed`，不会伪装成已完全终止。
- 屏幕截图只保留在当前 App 内存中，用于预览与 Vision 分析；任务历史不会保存截图 base64。
- Web 调试页可以查看 Workbench 界面，但真实本地工具只在 Electron App 中启用。

## 快速开始

```bash
git clone https://github.com/cyf1124906008-ai/yufeng-canvas.git
cd yufeng-canvas
pnpm install
pnpm dev
```

打开“模型与 API”进入 Provider Console，配置自己的 Provider、Base URL、API Key 和模型名，也可以测试连接、同步模型或导入 DataEyes 实测目录。YUFENG Agent 不内置或上传用户的 Key。

推荐的 DataEyes 地址：

```text
Base URL: https://cloud.dataeyes.ai
```

## 测试与构建

```bash
pnpm test
pnpm build
```

## 桌面应用打包

Windows：

```bash
pnpm desktop:dist:win
```

Apple Silicon Mac：

```bash
pnpm desktop:dist:mac:arm64
```

Intel Mac：

```bash
pnpm desktop:dist:mac:x64
```

同时生成 macOS DMG 与 ZIP：

```bash
pnpm desktop:dist:mac
```

产物位于 `release/`。本地构建的 macOS App 默认未做 Apple Developer ID 公证，首次打开可能需要在 Finder 中右键选择“打开”；正式分发需补充签名与 notarization。

## 架构说明

- [Agent Harness 总体架构](docs/agent-harness.md)
- [V0.2 Result Observation](docs/plans/agent-v0.2-result-observation.md)
- [V0.3 Model Router](docs/plans/agent-v0.3-model-router.md)
- [V0.4 Headless Runtime](docs/plans/agent-v0.4-headless-runtime.md)
- [V0.5a Local Run History](docs/plans/agent-v0.5a-run-history.md)
- [V0.6 Desktop Workbench](docs/plans/agent-v0.6-workbench.md)
- [V0.7 Command Center](docs/plans/agent-v0.7-command-center.md)
- [v1.2.0 Release Notes](docs/releases/v1.2.0.md)
- [Local API / MCP](docs/local-api-mcp.md)

## Roadmap

- ✅ V0.1：单 Agent 逐步规划图片 / 视频目标。
- ✅ V0.2：Result Observation、质量门禁和有限重做。
- ✅ V0.3：Model Intelligence Router 与安全 fallback。
- ✅ V0.4：无画布 Provider 工具、Agent Workspace、运行投影和桌面入口。
- ✅ V0.5a：本地运行历史、安全脱敏、桌面图片引用恢复与中断状态识别。
- ✅ V0.6：通用多轮 Workbench、文件 / 终端 / macOS 工具、逐项审批和 Creative 工具化。
- ✅ V0.7：新命令中心、结构化计划、SHA 绑定的行级补丁与 diff 事件、当前 App 会话内的条件回滚、终端实时状态、Provider Console。
- 下一阶段：真正的 PTY 终端、任务 checkpoint / 安全续跑、成本预算与调用统计。
- 后续阶段：任务级多并发隔离与 Git worktree、可配置权限模式、浏览器工具，以及更多可安装的 Tool / MCP 扩展。

当前版本仍不包含真正 PTY、任务级多并发隔离 / 自动 Git worktree，或 `read-only` / `ask` / `full-access` 等可配置权限模式。现有终端是非交互式受控子进程，所有任务共享用户明确选择的工作区，危险操作继续逐项审批。

## 技术栈

Vue 3、Vite、Electron、Naive UI、Pinia。Agent 内核与工具协议使用可测试的纯 JavaScript；Vue Flow 只属于隔离的旧 Canvas 实现，不是默认运行依赖。

## License

MIT
