/**
 * Canvas command protocol for AI-driven canvas manipulation.
 * Pure function interfaces — no model integration, just the command layer.
 */
import { addNode, addEdge, updateNode, removeNode } from '@/stores/canvas'

function ok(message, extra = {}) {
  return { ok: true, message, ...extra }
}

function fail(message) {
  return { ok: false, message }
}

// --- addNode ---
export function validateAddNode(params) {
  if (!params?.type || typeof params.type !== 'string') return fail('type 必须是非空字符串')
  if (params.data && typeof params.data !== 'object') return fail('data 必须是对象')
  return null
}

export function executeAddNode(params) {
  const err = validateAddNode(params)
  if (err) return err
  const { type, position, data } = params
  const id = addNode(type, position || { x: 200, y: 200 }, data || {})
  return ok('节点已创建', { nodeIds: [id] })
}

// --- updateNode ---
export function validateUpdateNode(params) {
  if (!params?.id || typeof params.id !== 'string') return fail('id 必须是非空字符串')
  if (!params?.data || typeof params.data !== 'object') return fail('data 必须是对象')
  return null
}

export function executeUpdateNode(params) {
  const err = validateUpdateNode(params)
  if (err) return err
  updateNode(params.id, { ...params.data, updatedAt: Date.now() })
  return ok('节点已更新', { nodeIds: [params.id] })
}

// --- removeNode ---
export function validateRemoveNode(params) {
  if (!params?.id || typeof params.id !== 'string') return fail('id 必须是非空字符串')
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
  return null
}

export function executeConnectNodes(params) {
  const err = validateConnectNodes(params)
  if (err) return err
  addEdge({
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle || 'right',
    targetHandle: params.targetHandle || 'left',
    type: params.edgeType
  })
  return ok('节点已连接', { edgeIds: [`${params.source}-${params.target}`] })
}

// --- runComfyWorkflow ---
export function validateRunComfyWorkflow(params) {
  if (!params?.nodeId || typeof params.nodeId !== 'string') return fail('nodeId 必须是非空字符串')
  return null
}

export function executeRunComfyWorkflow(params) {
  const err = validateRunComfyWorkflow(params)
  if (err) return err
  // Actual run is async and handled by ComfyWorkflowNode — this is the protocol stub
  return ok('Comfy 工作流运行已触发', { nodeIds: [params.nodeId] })
}

// --- importComfyWorkflowTemplate (stub) ---
export function validateImportComfyWorkflowTemplate(params) {
  if (!params?.apiWorkflow || typeof params.apiWorkflow !== 'object') return fail('apiWorkflow 必须是对象')
  return null
}

export function executeImportComfyWorkflowTemplate(_params) {
  // Will be implemented when LLM integration lands
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

export const COMMAND_NAMES = Object.keys(COMMAND_MAP)
