import { nodes, edges } from '@/stores/canvas'

const NODE_DATA_KEYS = {
  text: ['content', 'label'],
  imageConfig: ['label', 'model', 'size', 'quality', 'prompt'],
  image: ['label', 'url', 'source', 'prompt'],
  videoConfig: ['label', 'model', 'ratio', 'dur', 'prompt'],
  video: ['label', 'url', 'source'],
  llmConfig: ['label', 'systemPrompt', 'outputFormat'],
  comfyWorkflow: ['label', 'prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'status', 'baseUrl', 'bindings']
}

export function buildCanvasSnapshot() {
  const nodeSummaries = nodes.value.map(n => {
    const dataKeys = NODE_DATA_KEYS[n.type] || ['label']
    const dataSummary = {}
    for (const k of dataKeys) {
      const v = n.data?.[k]
      if (v != null && v !== '' && typeof v !== 'object') dataSummary[k] = v
      else if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length <= 5) dataSummary[k] = v
    }
    return { id: n.id, type: n.type, position: n.position, data: dataSummary }
  })

  const edgeSummaries = edges.value.map(e => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle, targetHandle: e.targetHandle
  }))

  return { nodes: nodeSummaries, edges: edgeSummaries, nodeCount: nodeSummaries.length, edgeCount: edgeSummaries.length }
}

export function buildCanvasAgentSystemPrompt(snapshot) {
  return `你是一个画布助手，可以根据用户自然语言指令操控画布节点。

当前画布状态：
${JSON.stringify(snapshot, null, 2)}

可用命令：
- addNode: { type, position: {x,y}, data: {...} }
  type 可选：text | imageConfig | image | videoConfig | video | llmConfig | comfyWorkflow
- updateNode: { id, data: {...} }
- removeNode: { id }
- connectNodes: { source, target, sourceHandle?, targetHandle?, edgeType? }
- runComfyWorkflow: { nodeId }

规则：
1. 你必须只返回 JSON，不要返回其他内容。
2. addNode 的 position 要避免和现有节点重叠，y 值比现有最大 y 至少大 200。
3. updateNode 需要指定现有节点的 id。
4. removeNode 必须谨慎，只有在用户明确要求删除时才使用。
5. connectNodes 的 sourceHandle 默认 "right"，targetHandle 默认 "left"。
6. runComfyWorkflow 只触发运行，不创建节点。

返回格式：
{
  "summary": "一句话说明要做什么",
  "commands": [
    { "name": "addNode", "params": {...} },
    { "name": "connectNodes", "params": {...} }
  ],
  "requiresConfirmation": false
}

requiresConfirmation 规则：
- 包含 removeNode → true
- 包含 runComfyWorkflow → true
- 其他 → false`
}

export function parseAgentCommandResponse(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: '模型返回为空' }
  }

  // Try extracting from ```json code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonCandidate = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim()

  // Try to find JSON object
  const jsonMatch = jsonCandidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { ok: false, error: '模型返回中未找到 JSON' }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.commands || !Array.isArray(parsed.commands)) {
      return { ok: false, error: '返回的 JSON 缺少 commands 数组' }
    }
    return { ok: true, plan: parsed }
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${e.message}` }
  }
}

export function classifyCommandRisk(commands) {
  const risks = { safe: [], destructive: [], execution: [] }
  for (const cmd of commands) {
    if (cmd.name === 'removeNode') risks.destructive.push(cmd)
    else if (cmd.name === 'runComfyWorkflow') risks.execution.push(cmd)
    else risks.safe.push(cmd)
  }
  const needsConfirm = risks.destructive.length > 0 || risks.execution.length > 0
  return { risks, needsConfirm, riskLabels: [] }
}
