/**
 * Canvas command protocol for AI-driven canvas manipulation.
 */
import { nodes, addNode, addEdge, updateNode, removeNode } from '@/stores/canvas'

const ALLOWED_NODE_TYPES = new Set([
  'text',
  'imageConfig',
  'image',
  'videoConfig',
  'video',
  'llmConfig',
  'comfyWorkflow'
])

const ALLOWED_DATA_FIELDS = {
  text: ['content', 'label'],
  imageConfig: ['prompt', 'label', 'model', 'size', 'quality'],
  image: ['label', 'prompt', 'source'],
  videoConfig: ['prompt', 'label', 'model', 'ratio', 'duration'],
  video: ['label', 'source', 'duration'],
  llmConfig: ['systemPrompt', 'label', 'model', 'outputFormat'],
  comfyWorkflow: ['prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'label']
}

const BLOCKED_DATA_FIELDS = new Set([
  'apiWorkflow',
  'baseUrl',
  'bindings',
  'status',
  'error',
  'outputNodeId',
  'outputNodeIds',
  'lastPromptId',
  'lastRunAt',
  'assetPath',
  'url',
  'loading',
  'progress',
  'attempt',
  'isPolling',
  'createdAt',
  'updatedAt'
])

function getNodeById(id) {
  return nodes.value.find(node => node.id === id) || null
}

function sanitizeNodeData(type, data = {}) {
  const allowed = new Set(ALLOWED_DATA_FIELDS[type] || ['label'])
  const cleaned = {}
  for (const [key, value] of Object.entries(data || {})) {
    if (BLOCKED_DATA_FIELDS.has(key)) continue
    if (!allowed.has(key)) continue
    cleaned[key] = value
  }
  return cleaned
}

function validatePosition(position) {
  if (position == null) return null
  if (typeof position !== 'object') return fail('position 必须是对象')
  if (!Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) {
    return fail('position.x / position.y 必须是数字')
  }
  return null
}

function ok(message, extra = {}) {
  return { ok: true, message, ...extra }
}

function fail(message) {
  return { ok: false, message }
}

// --- addNode ---
export function validateAddNode(params) {
  if (!params?.type || typeof params.type !== 'string') return fail('type 必须是非空字符串')
  if (!ALLOWED_NODE_TYPES.has(params.type)) return fail(`不支持创建节点类型: ${params.type}`)
  if (params.ref != null && typeof params.ref !== 'string') return fail('ref 必须是字符串')
  const posErr = validatePosition(params.position)
  if (posErr) return posErr
  if (params.data && typeof params.data !== 'object') return fail('data 必须是对象')
  return null
}

export function executeAddNode(params) {
  const err = validateAddNode(params)
  if (err) return err
  const { type, position, data } = params
  const id = addNode(type, position || { x: 200, y: 200 }, sanitizeNodeData(type, data || {}))
  return ok('节点已创建', { nodeIds: [id] })
}

// --- updateNode ---
export function validateUpdateNode(params) {
  if (!params?.id || typeof params.id !== 'string') return fail('id 必须是非空字符串')
  if (!params?.data || typeof params.data !== 'object') return fail('data 必须是对象')
  const node = getNodeById(params.id)
  if (!node) return fail(`节点不存在: ${params.id}`)
  const cleaned = sanitizeNodeData(node.type, params.data)
  if (Object.keys(cleaned).length === 0) {
    return fail(`没有允许更新的字段。${node.type} 只允许更新: ${(ALLOWED_DATA_FIELDS[node.type] || ['label']).join(', ')}`)
  }
  return null
}

export function executeUpdateNode(params) {
  const err = validateUpdateNode(params)
  if (err) return err
  const node = getNodeById(params.id)
  const cleaned = sanitizeNodeData(node.type, params.data)
  updateNode(params.id, { ...cleaned, updatedAt: Date.now() })
  return ok('节点已更新', { nodeIds: [params.id] })
}

// --- removeNode ---
export function validateRemoveNode(params) {
  if (!params?.id || typeof params.id !== 'string') return fail('id 必须是非空字符串')
  if (!getNodeById(params.id)) return fail(`节点不存在: ${params.id}`)
  return null
}

export function executeRemoveNode(params) {
  const err = validateRemoveNode(params)
  if (err) return err
  removeNode(params.id)
  return ok('节点已删除')
}

// --- connectNodes ---
export function validateConnectNodes(params) {
  if (!params?.source || typeof params.source !== 'string') return fail('source 必须是非空字符串')
  if (!params?.target || typeof params.target !== 'string') return fail('target 必须是非空字符串')
  if (params.source === params.target) return fail('不能连接同一个节点')
  if (!getNodeById(params.source)) return fail(`源节点不存在: ${params.source}`)
  if (!getNodeById(params.target)) return fail(`目标节点不存在: ${params.target}`)
  return null
}

export function executeConnectNodes(params) {
  const err = validateConnectNodes(params)
  if (err) return err
  const edgeId = addEdge({
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle || 'right',
    targetHandle: params.targetHandle || 'left',
    type: params.edgeType
  })
  return ok('节点已连接', { edgeIds: [edgeId] })
}

// --- runComfyWorkflow ---
export function validateRunComfyWorkflow(params) {
  if (!params?.nodeId || typeof params.nodeId !== 'string') return fail('nodeId 必须是非空字符串')
  const node = getNodeById(params.nodeId)
  if (!node) return fail(`节点不存在: ${params.nodeId}`)
  if (node.type !== 'comfyWorkflow') return fail('runComfyWorkflow 只能运行 Comfy 工作流节点')
  return null
}

export function executeRunComfyWorkflow(params) {
  const err = validateRunComfyWorkflow(params)
  if (err) return err
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return fail('当前环境无法触发 Comfy 工作流运行')
  }
  window.dispatchEvent(new CustomEvent('yufeng:run-comfy-workflow', {
    detail: { nodeId: params.nodeId }
  }))
  return ok('Comfy 工作流运行请求已发送', { nodeIds: [params.nodeId] })
}

// --- importComfyWorkflowTemplate (stub) ---
export function validateImportComfyWorkflowTemplate(params) {
  if (!params?.apiWorkflow || typeof params.apiWorkflow !== 'object') return fail('apiWorkflow 必须是对象')
  return null
}

export function executeImportComfyWorkflowTemplate(_params) {
  return ok('Comfy 工作流模板导入已预留')
}

// --- Command dispatch ---
const COMMAND_MAP = {
  addNode: { validate: validateAddNode, execute: executeAddNode },
  updateNode: { validate: validateUpdateNode, execute: executeUpdateNode },
  removeNode: { validate: validateRemoveNode, execute: executeRemoveNode },
  connectNodes: { validate: validateConnectNodes, execute: executeConnectNodes },
  runComfyWorkflow: { validate: validateRunComfyWorkflow, execute: executeRunComfyWorkflow },
  importComfyWorkflowTemplate: { validate: validateImportComfyWorkflowTemplate, execute: executeImportComfyWorkflowTemplate }
}

export function executeCommand(name, params) {
  const cmd = COMMAND_MAP[name]
  if (!cmd) return fail(`未知命令: ${name}`)
  return cmd.execute(params || {})
}

export function validateCommand(name, params) {
  const cmd = COMMAND_MAP[name]
  if (!cmd) return fail(`未知命令: ${name}`)
  return cmd.validate(params || {})
}

export function validateCommandBatch(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return fail('commands 必须是非空数组')
  }
  const plannedRefs = new Map()
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (!cmd.name) return fail(`第 ${i + 1} 条命令缺少 name`)
    const cmdDef = COMMAND_MAP[cmd.name]
    if (!cmdDef) return fail(`第 ${i + 1} 条: 未知命令 "${cmd.name}"`)

    if (cmd.name === 'addNode') {
      const err = cmdDef.validate(cmd.params || {})
      if (err) return fail(`第 ${i + 1} 条: ${err.message}`)
      const ref = cmd.params?.ref
      if (ref) {
        if (plannedRefs.has(ref) || getNodeById(ref)) return fail(`第 ${i + 1} 条: ref 已存在 "${ref}"`)
        plannedRefs.set(ref, cmd.params.type)
      }
      continue
    }

    if (cmd.name === 'connectNodes') {
      const params = cmd.params || {}
      if (!params.source || typeof params.source !== 'string') return fail(`第 ${i + 1} 条: source 必须是非空字符串`)
      if (!params.target || typeof params.target !== 'string') return fail(`第 ${i + 1} 条: target 必须是非空字符串`)
      if (params.source === params.target) return fail(`第 ${i + 1} 条: 不能连接同一个节点`)
      if (!getNodeById(params.source) && !plannedRefs.has(params.source)) return fail(`第 ${i + 1} 条: 源节点不存在或未声明 ref "${params.source}"`)
      if (!getNodeById(params.target) && !plannedRefs.has(params.target)) return fail(`第 ${i + 1} 条: 目标节点不存在或未声明 ref "${params.target}"`)
      continue
    }

    const err = cmdDef.validate(cmd.params || {})
    if (err) return fail(`第 ${i + 1} 条: ${err.message}`)
  }
  return null
}

export function executeCommandBatch(commands) {
  const results = []
  const allNodeIds = []
  const allEdgeIds = []
  const refMap = new Map()

  for (const cmd of commands) {
    const params = { ...(cmd.params || {}) }
    if (cmd.name === 'connectNodes') {
      params.source = refMap.get(params.source) || params.source
      params.target = refMap.get(params.target) || params.target
    }
    const result = executeCommand(cmd.name, params)
    results.push({ name: cmd.name, ...result })
    if (!result.ok) {
      return { ok: false, results, failedAt: cmd.name, message: result.message, nodeIds: allNodeIds, edgeIds: allEdgeIds }
    }
    if (result.nodeIds) allNodeIds.push(...result.nodeIds)
    if (result.edgeIds) allEdgeIds.push(...result.edgeIds)
    if (cmd.name === 'addNode' && cmd.params?.ref && result.nodeIds?.[0]) {
      refMap.set(cmd.params.ref, result.nodeIds[0])
    }
  }

  return { ok: true, results, nodeIds: allNodeIds, edgeIds: allEdgeIds }
}

export const COMMAND_NAMES = Object.keys(COMMAND_MAP)
