export function isComfyApiWorkflow(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false
  const keys = Object.keys(json)
  if (keys.length === 0) return false
  let nodeCount = 0
  for (const key of keys) {
    if (!/^\d+$/.test(key)) return false
    const node = json[key]
    if (!node || typeof node !== 'object') return false
    if (!node.class_type || typeof node.inputs !== 'object') return false
    nodeCount++
  }
  return nodeCount > 0
}

export function buildComfyBindings(apiWorkflow) {
  const bindings = {}
  let clipCount = 0
  for (const [nodeId, node] of Object.entries(apiWorkflow || {})) {
    if (node.class_type === 'CLIPTextEncode') {
      if (clipCount === 0 && node.inputs?.text != null) bindings.prompt = { nodeId, input: 'text' }
      else if (clipCount === 1 && node.inputs?.text != null) bindings.negativePrompt = { nodeId, input: 'text' }
      clipCount++
    }
    if (node.class_type === 'EmptyLatentImage') {
      if (node.inputs?.width != null) bindings.width = { nodeId, input: 'width' }
      if (node.inputs?.height != null) bindings.height = { nodeId, input: 'height' }
    }
    if (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
      if (node.inputs?.seed != null) bindings.seed = { nodeId, input: 'seed' }
      if (node.inputs?.steps != null) bindings.steps = { nodeId, input: 'steps' }
      if (node.inputs?.cfg != null) bindings.cfg = { nodeId, input: 'cfg' }
    }
    if (node.class_type === 'CheckpointLoaderSimple' && node.inputs?.ckpt_name != null) {
      bindings.checkpoint = { nodeId, input: 'ckpt_name' }
    }
    if (String(node.class_type || '').includes('Lora') && node.inputs?.lora_name != null) {
      bindings.lora = { nodeId, input: 'lora_name' }
    }
  }
  return bindings
}

export function extractComfyDefaults(apiWorkflow, bindings) {
  const defaults = {
    prompt: '',
    negativePrompt: '',
    width: 512,
    height: 512,
    seed: -1,
    steps: 20,
    cfg: 7
  }
  for (const [key, binding] of Object.entries(bindings || {})) {
    const value = apiWorkflow?.[binding.nodeId]?.inputs?.[binding.input]
    if (value != null && typeof value !== 'object') defaults[key] = value
  }
  return defaults
}

export function findComfyOutputNodes(apiWorkflow) {
  return Object.entries(apiWorkflow || {})
    .filter(([, node]) => ['SaveImage', 'PreviewImage', 'VHS_VideoCombine'].includes(node.class_type))
    .map(([nodeId, node]) => ({ nodeId, classType: node.class_type }))
}

export function buildComfyWorkflowNodeData(apiWorkflow, name = 'Comfy 工作流') {
  if (!isComfyApiWorkflow(apiWorkflow)) throw new Error('无效的 Comfy API workflow JSON')
  const bindings = buildComfyBindings(apiWorkflow)
  const defaults = extractComfyDefaults(apiWorkflow, bindings)
  const outputNodes = findComfyOutputNodes(apiWorkflow)
  const label = String(name || 'Comfy 工作流').replace(/\.json$/i, '')
  const missing = []
  if (!bindings.prompt) missing.push('Prompt')
  if (outputNodes.length === 0) missing.push('SaveImage/PreviewImage')
  return {
    label,
    apiWorkflow,
    bindings,
    ...defaults,
    outputNodes,
    status: 'idle',
    error: missing.length ? `已导入，但未识别到：${missing.join('、')}。可在专业模式检查 workflow。` : '',
    startedAt: null,
    outputNodeIds: [],
    lastPromptId: null,
    lastRunAt: null,
    baseUrl: 'http://127.0.0.1:8188',
    yufengShell: true,
    wrapperTemplateTitle: label
  }
}
