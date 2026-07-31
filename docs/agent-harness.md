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

V0.1 的“验证”只确认目标产物真实存在且生成节点没有报错。

## V0.1 工具契约

| 工具 | Agent 输入 | Router 负责 | 结果 observation |
| --- | --- | --- | --- |
| `generate_image` | 创作提示词、画幅建议 | 图片模型与供应商配置 | 配置节点、图片结果节点、成功/失败 |
| `generate_video` | 运动提示词、比例、时长、首帧节点 | 视频模型与供应商配置 | 配置节点、视频结果节点、成功/失败 |
| `finish` | 交付摘要 | 无 | Verifier 检查是否真的可以结束 |

媒体 URL、API Key 和完整供应商响应不会写进 Planner 上下文；Planner 只看到完成状态、节点引用和必要的错误摘要。

## V0.2：Result Observation

V0.2 已把图片结果观察接进同一个逐步循环：

```text
generate_image → analyze_image → accept / retry
                                      ↓
                          improve prompt → generate_image
```

- 浏览器先验证真实图片能否解码，并读取尺寸、比例等技术信息。
- 当前文本模型声明支持 Vision 时，`analyze_image` 会看图并返回结构化评价；最终分数和是否通过由本地 `QualityPolicy` 复算，不信任模型自报结论。
- 未通过时，`PromptImprover` 保留原始目标并合并改进建议；默认最多重做两次，总候选不超过三张。
- 没有 Vision 能力时只做降级技术检查，并在 Canvas 明确显示“未视觉验证”；运行方也可以关闭降级通过。
- 每次候选和 Quality Check 节点都会保留。达到重做上限后任务失败并保留现场，不会假装交付成功。
- 图片任务通过检查后才能结束；视频任务的首帧通过检查后才能进入视频生成。

详细契约与验收边界见 [V0.2 Result Observation 设计](plans/agent-v0.2-result-observation.md)。

## V0.3：Model Intelligence Router

V0.3 已把“用户当前选中的模型”升级为可解释的候选排序：

- `ModelProfile` 统一图片、视频和 Vision 模型的能力、质量、速度、成本、可靠性、可用性与支持参数；未知指标明确保持未知。
- `ModelScorer` 先做能力、Provider、比例、分辨率、时长和参考图等硬过滤，再按 balanced / quality / speed / cost 策略评分。
- 用户当前选择仍有有限偏好加分，但不能越过硬能力约束。
- 创作目标中的“电影级 / 最高质量”“尽快”“预算有限”等表达可触发有限的本地策略推断；没有明确偏好时使用 balanced。
- Canvas runtime 会按排序逐个尝试候选。只有 429、5xx、超时、网络中断和临时不可用会触发自动切换；认证、权限、参数、能力、内容安全和用户取消不会被掩盖。
- 每个失败配置节点都会保留，最终错误包含脱敏 attempts 摘要，Agent observation 不接触 API Key 或媒体 URL。
- 现有仅含 `key/label` 的模型配置继续兼容；Provider 模型列表返回的安全画像字段会被保留并用于路由。

详细契约与验收边界见 [V0.3 Model Router 设计](plans/agent-v0.3-model-router.md)。

## 后续阶段

- V0.4：Agent 根据观察结果动态插入编辑、放大等节点。
- V0.5：长任务上下文、项目记忆、checkpoint、预算和调用统计。
