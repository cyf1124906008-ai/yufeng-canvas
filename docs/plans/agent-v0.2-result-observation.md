# Agent V0.2：Result Observation 可执行设计

> 实现状态：核心闭环已落地。`generate_image → analyze_image → accept/retry`、本地复算、提示词改进、最多三张候选、Canvas Quality Check 和降级标记均已接入。`RunPolicy` 已提供独立策略模块；供应商费用采集与运行时预算扣减仍按产品路线放在 V0.5，不在本阶段宣称完成。

## 1. 目标与边界

V0.2 让 Creative Agent 在图片生成后先“看结果”，再决定接受、修改提示词重做或停止。它解决的不是模型路由，而是下面这个闭环：

```text
generate_image
      ↓
analyze_image
      ↓
 ┌────┴───────────────┐
 │ accept             │ retry
 ↓                    ↓
finish / video    improve_prompt
                       ↓
                generate_image
```

本阶段只引入一个新工具 `analyze_image`。图片任务检查最终图片；视频任务先检查首帧图片，通过后才调用 `generate_video`。最终视频的内容理解留给后续 `analyze_video`，V0.2 仍只对视频结果做 V0.1 的存在性检查。

明确不在 V0.2 内实现：Multi-Agent、按质量/价格动态选模型、图片编辑、视频视觉评分、项目长期记忆，以及无限自治重试。

## 2. 完成标准

一项图片结果只有满足以下任一条件，Verifier 才允许 `finish`：

1. `analyze_image` 返回 `reviewMode: "vision"`，代码复算后的总分达到阈值，关键维度达标且没有 hard failure；
2. 当前没有可用 Vision 能力，技术检查通过并返回 `reviewMode: "degraded"`。这时允许完成，但交付必须明确标记“内容质量未经视觉模型验证”。

视频任务还必须满足：被采用的首帧已通过上述检查，且真实视频结果已产出。

达到最大重做次数仍不合格时，任务不得假成功。Runner 以 `QUALITY_RETRIES_EXHAUSTED` 失败结束，Canvas 保留全部候选结果和评分，用户可以手动选择、修改后从节点继续。

## 3. `analyze_image` 工具契约

### 3.1 输入

```js
{
  artifactRef: 'output:1',       // AgentState output 的稳定引用
  imageNodeId: 'image-node-id',  // Canvas 中已完成的真实图片节点
  outputNodeId: 'image-node-id', // 可与 imageNodeId 二选一
  goal: '帮我做一张黑银科技感新能源汽车海报',
  prompt: '本次生成实际使用的 prompt',
  requiredText: [],              // 用户明确要求出现在画面中的文字
  ratio: '9:16',
  attempt: 1
}
```

`artifactRef` 使用生成 output 的 step，例如 `output:1`。工具在 Canvas runtime 内部根据节点读取媒体地址；URL、base64、API Key 和完整供应商响应不得进入 Planner 的文本上下文。Planner 只看到引用、评分、问题摘要和改进建议。

### 3.2 结构化输出

```js
{
  schemaVersion: '1',
  artifactRef: 'output:1',
  reviewMode: 'vision',          // vision | degraded
  overallScore: 84,              // degraded 时必须为 null
  dimensions: {
    goalAlignment:   { score: 88, feedback: '主体和黑银风格符合目标' },
    subjectIntegrity:{ score: 92, feedback: '车身完整，无明显畸变' },
    composition:     { score: 82, feedback: '主体略偏下但可用' },
    visualQuality:   { score: 86, feedback: '光影和细节清晰' },
    styleMatch:      { score: 80, feedback: '科技感足够' },
    textIntegrity:   { score: null, feedback: '用户未要求画内文字' }
  },
  hardFailures: [],
  decision: 'accept',            // accept | retry | unverified
  summary: '画面可直接采用',
  improvements: [],
  suggestedPrompt: {
    additions: [],
    negative: []
  },
  technical: {
    decodable: true,
    width: 1080,
    height: 1920,
    mimeType: 'image/png'
  },
  usage: {
    cost: { amount: 0.01, currency: 'CNY', estimated: false }
  }
}
```

结构校验规则：

- 分数只能是 `0..100` 的有限数值；不适用的维度只能为 `null`，不能由模型自行删除字段。
- `hardFailures` 只能使用代码表：`UNDECODABLE`、`MISSING_SUBJECT`、`SEVERE_DEFORMATION`、`WRONG_ASPECT_RATIO`、`REQUIRED_TEXT_BROKEN`、`GOAL_MISMATCH`。
- `summary`、单条 `feedback` 和改进建议有长度上限，禁止把模型长篇分析写进 Context。
- 工具输出中的 `overallScore` 仅用于审计。是否接受以及最终分数由本地 `QualityPolicy` 复算，不能信任模型自报的 `decision`。
- Vision 返回 JSON 损坏时，同一次分析最多做一次 schema-repair 请求；仍不合法则抛出 `VISION_SCHEMA_INVALID`，不得伪装成无 Vision 降级。

### 3.3 本地评分策略

默认权重：

| 维度 | 权重 | 关键维度最低分 |
| --- | ---: | ---: |
| goalAlignment | 30% | 70 |
| subjectIntegrity | 20% | 70 |
| composition | 15% | 60 |
| visualQuality | 15% | 60 |
| styleMatch | 15% | 60 |
| textIntegrity | 5% | 用户要求画内文字时为 70 |

不适用的维度从分母中移除后重新归一化。默认接受条件：复算总分 `>= 82`、全部适用维度达到最低分、`hardFailures` 为空、技术检查通过。

这些值集中在 `QualityPolicy`，可由运行配置覆盖，但不能由 Planner 或 Vision 模型在单次任务中改写。

## 4. 重做和 Prompt 改进

### 4.1 次数约束

- `maxQualityRetries` 默认 `2`，表示首次生成后最多再生成两次，总候选图最多三张。
- 同一个 `artifactRef` 只允许成功分析一次；重复的 `analyze_image` 动作由 guard 拒绝。
- 每次重做必须引用一份已完成且结论为 retry 的 review。
- 第三张仍不合格时立即产生 `QUALITY_RETRIES_EXHAUSTED`，不能再请求第四张。

次数必须由运行时计数器强制执行，不能只写进 LLM prompt。

### 4.2 PromptImprover

`PromptImprover` 使用确定性合并，不让 Planner 任意丢掉用户约束：

1. 保留初始 goal 和本轮实际 prompt；
2. 将 review 的 `improvements` 以及 `suggestedPrompt.additions` 添加到“本轮修正”段；
3. 将 `suggestedPrompt.negative` 添加到 negative prompt；
4. 始终保留用户要求的主体、画幅、风格、颜色和画内文字；
5. 限制新增建议条数和总字符数，去重并过滤空建议；
6. 计算 prompt hash。如果改进后与上一版相同，则抛出 `PROMPT_NOT_IMPROVED`，避免花钱生成相同结果。

建议的生成动作输入：

```js
{
  prompt: '原始创作提示词\n本轮修正：车身完整入镜；主体垂直居中',
  negativePrompt: '车身裁切，轮胎畸变，乱码文字',
  revision: 2,
  retryOf: 'output:1',
  reviewRef: 'review:output:1'
}
```

每一轮只根据最近一次 review 改进，不把历次自然语言分析无限拼接进 prompt。结构化的原始 goal constraints 始终作为不可删除的基线。

## 5. 无 Vision 能力时的降级

`analyze_image` 必须始终注册。工具内部先通过 Model Router/Provider 配置查询 `image_understanding` 能力，而不是让 Planner 猜测某个模型是否支持看图。

没有可用 Vision 能力时只运行本地技术检查：

- 图片 URL/Blob 能加载并解码；
- 宽高大于零；
- MIME 类型是允许的图片类型；
- 用户指定画幅时，比例误差不超过配置阈值；
- 对明确要求的最低分辨率进行检查。

返回结果必须为：

```js
{
  reviewMode: 'degraded',
  overallScore: null,
  dimensions: null,
  hardFailures: [],
  decision: 'unverified',
  summary: '未配置可看图模型，仅完成图片技术检查',
  technical: { decodable: true, width: 1080, height: 1920 }
}
```

降级模式不做盲目重生成，因为没有证据表明下一张更好。技术检查通过就继续，并在 Canvas 节点和最终交付中显示 `qualityUnverified: true`；技术检查失败则按普通工具失败处理。Provider 暂时超时、Vision JSON 损坏不等同于“没有能力”，不得静默降级。

## 6. 费用与循环保护

运行策略新增：

```js
{
  maxQualityRetries: 2,
  minAcceptScore: 82,
  maxSteps: 8,
  budget: { amount: 10, currency: 'CNY' },
  allowDegradedReview: true
}
```

保护规则按以下优先级在调用工具前执行：

1. 取消信号；
2. 全局 `maxSteps`；
3. `maxQualityRetries`；
4. 同一 output 重复分析 guard；
5. prompt hash 重复 guard；
6. 预算 guard。

每个工具结果用统一结构报告 `usage.cost`。Runner 累加同币种实际费用；重试前用 Router 提供的预估费用检查 `spent + estimatedNextCall <= budget`。超预算时抛出 `AGENT_BUDGET_EXCEEDED`，保留已有候选，不再调用生成 API。若供应商暂不报告费用，则标记 `unmeteredCalls`，仍由重做次数和最大步数提供硬保护，不能把未知费用当作零成本宣传。

图片最坏动作数为 `3 × (generate_image + analyze_image) + finish = 7`。视频最坏动作数为上述六步加 `generate_video + finish = 8`，与 V0.1 默认 `maxSteps: 8` 相容。任何新增步骤都必须同步重新计算默认上限，而不是绕过 Runner 的熔断。

## 7. 与现有 Core 的扩展点映射

本节是实现 V0.2 时的最小改动清单，不要求重写 V0.1。

| 现有组件 | V0.2 扩展 | 保持不变的契约 |
| --- | --- | --- |
| `ToolRegistry` | 注册 `analyze_image`；handler 继续接收 `(input, { signal, state, context, action })` | registry 不理解图片评分业务 |
| `Planner` | 动作白名单加入 `analyze_image`；fallback 依次判断“最新图片是否有 review、review 是否通过、是否可重做” | `nextAction()` 每轮仍只返回一个动作 |
| `AgentState` | 可先复用 `observations` 保存 review；增加查询 helper、retry/cost 派生统计。若新增字段，必须进入 `snapshot()` | outputs 仍只记录真实媒体产物，review 不是 output |
| `ContextManager` | 只加入压缩后的 review 摘要、分数、问题 code 和 prompt additions | 不写媒体 URL/base64、密钥或完整 Vision 响应 |
| `Verifier` | 图片 finish 需要 accepted/degraded review；视频 finish 需要已审首帧和视频 output | 继续作为 finish 的硬 gate，不相信 Planner 自行宣布完成 |
| `AgentRunner` | 在工具执行前调用 `RunPolicy` guards；从工具结果累计 usage；可增加语义事件 | 取消、工具错误、maxSteps 和 snapshot 返回语义不变 |
| Canvas runtime | `analyze_image` 显示为 Quality Check 节点；重做结果作为同一生成节点的尝试分支 | Agent core 不直接 import Vue store |

建议新增的独立模块：

```text
src/agent/observation/
├── AnalyzeImageTool.js
├── ImageReviewSchema.js
├── QualityPolicy.js
├── PromptImprover.js
└── RunPolicy.js
```

Core 只增加通用的动作和 guard 接入点；评分 schema、Vision 调用和 prompt 改进留在 observation 模块，避免 `AgentRunner` 变成业务大杂烩。

### Planner 的确定性 fallback 状态机

```text
无图片
  → generate_image

最新图片无 review
  → analyze_image

review = accept
  → 图片任务 finish
  → 视频任务 generate_video（若尚无视频）

review = degraded 且 allowDegradedReview
  → 同 accept，但交付带 qualityUnverified

review = retry 且 retries < maxQualityRetries 且预算允许
  → generate_image(improved prompt)

review = retry 且达到上限
  → QUALITY_RETRIES_EXHAUSTED
```

LLM 可以提出下一动作，但上述 guard 和 Verifier 必须在本地代码中执行。LLM 返回损坏 JSON 时仍走这套状态机，保证结果可预测。

## 8. Canvas 表现与事件

V0.2 至少展示：当前评分、各维度问题、是否降级、当前尝试次数、已花费用（可得时）和采用的候选。

在现有通用 `action` / `tool_started` / `tool_succeeded` 事件上，可以增加以下语义事件，但每个事件仍携带 plain state snapshot：

- `review_completed`：携带 `artifactRef`、复算分数和决策；
- `review_degraded`：说明没有 Vision 能力；
- `retry_planned`：携带 revision、retryOf 和问题 codes；
- `quality_exhausted`：候选全部不合格；
- `budget_blocked`：继续生成会超过预算。

重做不覆盖旧图。Canvas 应显示 `尝试 #1 ❌ → 尝试 #2 ✅`，并保留用户锁定任意候选、改 prompt、从此处继续的入口。

## 9. 验收测试

使用 `node:test` 和纯 stub tools，测试不调用真实供应商。建议新增 `tests/agent-observation.test.js`，至少覆盖：

### A. 首次通过

- 图片 goal 的动作严格为 `generate_image → analyze_image → finish`。
- review 复算分数达到 82，Verifier 允许完成。
- 最终 snapshot 能找到采用 output 及其 review，未发生重做。

### B. 一次改进后通过

- 第一次 review 为 72 分并指出主体裁切。
- 下一动作只能是 `generate_image`，输入含 `revision: 2`、`retryOf` 和“主体完整入镜”，且保留原始风格/画幅约束。
- 第二次图片只分析一次，达到阈值后 finish。
- Canvas 事件中能区分两个候选，旧图未被覆盖。

### C. 重做上限

- 连续三张图均未达到阈值。
- `generate_image` 恰好调用三次、`analyze_image` 恰好调用三次，绝不出现第四次生成。
- run reject 的 code 为 `QUALITY_RETRIES_EXHAUSTED`，状态不是 completed，三个候选仍保留。

### D. 提前 finish gate

- 图片已经生成但尚未 review 时，LLM 返回 finish 必须被 Verifier 拒绝。
- review 为 retry 时再次 finish 仍被拒绝。
- 只有 accepted review 或允许的 degraded review 可以结束。

### E. 无 Vision 降级

- capability resolver 返回没有 `image_understanding`。
- 工具只做一次技术检查，不调用 Vision stub，不触发重生成。
- 技术检查通过后任务完成，snapshot 和事件均含 `qualityUnverified: true`。
- 图片不可解码时任务失败，不允许降级完成。

### F. Schema 与分数防线

- Vision 自报 95 分，但维度加权复算为 76 时必须 retry。
- 越界分数、缺字段、未知 hard failure code 在一次 repair 后仍不合法，抛 `VISION_SCHEMA_INVALID`。
- 未要求画内文字时 `textIntegrity: null` 被正确移出权重分母。

### G. 循环 guard

- 同一个 `artifactRef` 第二次 analyze 被拒绝且不调用 Vision。
- 改进 prompt hash 与上一版相同时抛 `PROMPT_NOT_IMPROVED`，不调用图片生成工具。
- LLM 持续返回 analyze 或 finish 也不能绕过 review/retry 限制与 `maxSteps`。

### H. 预算 guard

- 已花 8 元、下一次预计 3 元、预算 10 元时，重做前抛 `AGENT_BUDGET_EXCEEDED`。
- 被拦截的生成工具调用次数为零；已有图片和 review 保留。
- 未知费用被计入 `unmeteredCalls`，且重做次数保护仍生效。

### I. 视频路径

- “10 秒咖啡广告”的动作必须为 `generate_image → analyze_image → generate_video → finish`。
- 首帧 review 未通过时绝不能调用 `generate_video`。
- 传给视频工具的是最终被接受的图片引用和 10 秒时长，不是第一次失败候选。

### J. V0.1 回归

- V0.1 的取消、工具失败、最大步数和 LLM JSON fallback 测试继续通过。
- `ToolRegistry`、`subscribe()`、`run()` 返回 snapshot 的公共签名不变。
- 没有任何 Core 模块 import Vue、Pinia 或 Canvas store。

## 10. 实施顺序

1. 实现 `ImageReviewSchema` 与 `QualityPolicy`，先用 fixture 验证本地复算和 schema 防线。
2. 实现 `AnalyzeImageTool`，把 Vision adapter 与无 Vision 技术检查分开测试。
3. 实现 `PromptImprover` 与 retry/prompt hash guards。
4. 扩展 Planner fallback、Verifier 和 AgentState 查询 helper。
5. 接入费用累计与调用前 budget guard。
6. 接 Canvas Quality Check 节点、候选分支和事件展示。
7. 跑 V0.2 验收测试、V0.1 回归测试以及生产构建。

只有 A 至 J 全部通过，才能把 V0.2 标记为完成。
