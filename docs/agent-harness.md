# YUFENG Creative Agent Harness

YUFENG Canvas 的目标不是让用户手工拼出每一步，而是让用户描述最终作品，由 Creative Agent 决定下一步并通过画布公开执行过程。

## 北极星

> 用户说要什么，Agent 选择能力、创建工作流、执行并检查，Canvas 负责展示、干预和接管。

## 运行结构

```text
User Goal
   ↓
AgentRunner ──→ Planner（每轮只决定下一步）
   ↓                    ↑
ToolRegistry            │ observation
   ↓                    │
Creative Tool ──→ ModelRouter ──→ DataEyes / configured provider
   ↓
Canvas nodes + real generation result
   ↓
ContextManager ──→ Verifier ──→ continue / done
```

Agent 不直接选择或调用某个具体供应商模型。它只调用 `generate_image`、`generate_video` 等创作能力；`ModelRouter` 根据当前配置为能力选择可用模型。这样可以在后续加入质量、价格、速度、成功率和自动 fallback，而不污染 Agent 的决策接口。

## V0.1 范围

V0.1 只实现一个 Creative Agent，不包含 Multi-Agent：

- 图片目标：理解目标 → 生成图片提示词 → 创建并运行图片节点 → 等待真实结果 → 验证完成。
- 视频目标：理解目标 → 生成首帧 → 等待真实图片 → 创建并运行图生视频节点 → 等待真实结果 → 验证完成。
- Planner 每轮只返回一个 action，不预先写死完整命令批次。
- Canvas 显示 Agent 创建的节点和执行状态，用户仍可切换到手动模式编辑、重跑或接管。
- 生成工具复用现有节点和 Provider 配置，不建立第二套图片/视频 API 客户端。

V0.1 的“验证”只确认目标产物真实存在且生成节点没有报错。对画面内容和质量进行视觉评分、修改提示词并自主重做，属于 V0.2。

## V0.1 工具契约

| 工具 | Agent 输入 | Router 负责 | 结果 observation |
| --- | --- | --- | --- |
| `generate_image` | 创作提示词、画幅建议 | 图片模型与供应商配置 | 配置节点、图片结果节点、成功/失败 |
| `generate_video` | 运动提示词、比例、时长、首帧节点 | 视频模型与供应商配置 | 配置节点、视频结果节点、成功/失败 |
| `finish` | 交付摘要 | 无 | Verifier 检查是否真的可以结束 |

媒体 URL、API Key 和完整供应商响应不会写进 Planner 上下文；Planner 只看到完成状态、节点引用和必要的错误摘要。

## 后续阶段

- V0.2：图片/视频结果观察、质量评分、提示词修订和有限次数重做。
- V0.3：基于质量、速度、成本、可靠性的 ModelProfile 路由和失败 fallback。
- V0.4：Agent 根据观察结果动态插入编辑、放大等节点。
- V0.5：长任务上下文、项目记忆、checkpoint、预算和调用统计。
