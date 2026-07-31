# Agent V0.3：Model Intelligence Router 与失败切换

> 实现状态：已落地。当前 Provider 内的模型会被适配为统一 Registry，经硬能力过滤和本地评分后输出有序候选；图片与视频 Canvas 工具已接入可重试故障 fallback，并保留每次尝试节点。跨项目统计学习、远程实时价格同步和总预算治理留给后续阶段。

## 1. 目标

V0.3 把 V0.1 的“当前选中模型”升级成真正的能力路由：Agent 只表达 `generate_image`、`image_to_video`、`analyze_image` 等意图，Router 根据任务约束和 ModelProfile 返回按优先级排列的候选模型。首选模型遇到明确可重试故障时，运行时自动切换到下一候选。

```text
Agent action
    ↓ capability + task constraints
ModelRouter
    ↓ hard capability filter
ModelScorer
    ↓ quality / speed / cost / reliability / availability
ranked candidates
    ↓
attempt #1 ── retryable failure ──→ attempt #2
    │                                  │
 success                           success / final error
```

本阶段仍是一个 Creative Agent，不引入 Multi-Agent。预算累计、跨项目成功率学习和远程实时价格同步属于后续运行治理能力；V0.3 先把稳定的数据契约、确定性评分和失败切换闭环做通。

## 2. ModelProfile

统一画像至少包含：

```js
{
  id: 'provider:model-key',
  key: 'model-key',
  provider: 'dataeyes',
  capabilities: ['text_to_image', 'image_to_image'],
  quality: null,       // 已知时为 0..100；未知保持 null
  speed: null,         // 已知时为 0..100；未知保持 null
  cost: null,          // 可为归一化分数或结构化价格
  reliability: null,   // 已知时为 0..100
  availability: true,
  supported: {
    ratios: [],
    resolutions: [],
    durations: [],
    audio: null,
    referenceImage: null
  },
  defaultParams: {},
  preferred: false
}
```

规则：

- 未知数据保持未知，不把缺失价格宣传成免费，也不伪造成功率。
- 旧模型对象继续可用。适配器从现有 `availableChatModels`、`availableImageModels`、`availableVideoModels` 补充能力组；当前用户选择只作为 preference，不再成为硬锁。
- Registry 和 Planner 上下文中不出现 API Key、Base URL 或媒体地址。
- Provider `/models` 响应如果携带 `capabilities`、`quality`、`speed`、`cost/pricing`、`reliability`、`availability`、`supported`，本地模型 Store 应保留这些安全元数据。

## 3. 硬过滤与评分

硬过滤先于评分。候选必须：

1. 声明或由所属能力组安全推断出目标 capability；
2. 当前可用；
3. 满足任务明确要求的比例、分辨率、时长、参考图或音频能力；
4. 属于当前已配置 Provider，且该能力组存在 API Key。

评分由本地策略完成。默认 `balanced` 同时考虑质量、速度、成本、可靠性和当前可用性；另提供 `quality`、`speed`、`economy` 三种偏好。当前用户选择得到有限 preference bonus，不能越过硬能力约束。

排序必须稳定：总分相同先比较 preference，再比较原 Registry 顺序和模型 key，保证同一输入得到同一结果。

任务策略可以由显式 action 输入指定，也可以从目标做有限推断：例如“最高质量/电影级”偏质量，“尽快/快速”偏速度，“省钱/低成本”偏经济。没有明确偏好时使用 balanced。

## 4. 失败切换

仅以下故障自动尝试下一个候选：

- HTTP `429`；
- HTTP `5xx`；
- 网络连接失败；
- 明确的超时；
- Provider 返回的临时不可用/过载错误。

以下情况不得切模型掩盖问题：

- 用户取消或 `AbortError`；
- `401/403` 认证和权限错误；
- 请求参数无效；
- 模型不支持任务能力；
- 内容安全拒绝；
- 本地 Canvas 逻辑错误。

每个候选最多尝试一次。失败的配置节点和输出节点保留在 Canvas，日志记录候选序号、模型 key、失败分类和是否继续，但不记录凭证或媒体 URL。全部失败时抛出包含脱敏 attempts 摘要的最终错误，不返回假成功。

## 5. 稳定 API

建议 Router 保持 V0.1 兼容：

```js
router.route(capability, taskOptions)       // 最佳候选，兼容旧调用方
router.rank(capability, taskOptions)        // 全部有序候选
```

`route()` 的返回继续包含 `model`、`profile`、`provider`、`capability`、`type`，并新增 `score`、`scoreBreakdown` 和 `candidates`。Agent 只看到能力和执行 observation，模型名留在 Router/runtime 日志层。

失败执行器保持与 Canvas 解耦：

```js
executeWithModelFallback({
  candidates,
  signal,
  execute: (candidate, attemptContext) => runCanvasAttempt(candidate),
  onAttempt
})
```

## 6. 验收

- 旧的仅含 `{ key, label }` 模型配置仍能路由，当前选择在无其他数据时保持优先。
- 能力不匹配或不可用模型永远不会进入候选。
- quality、speed、economy 策略能在同一组有画像的候选上产生可解释的不同排序。
- 首选模型 `429/5xx/timeout` 时自动切换，第二候选成功后返回真实结果。
- `401/403`、参数错误和取消不会切换。
- 全部候选失败时 attempts 已脱敏，Canvas 现场保留。
- V0.1、V0.2 测试继续通过；生产构建和本地页面无新增错误。
