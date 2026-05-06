/**
 * Canvas command protocol for AI-driven canvas manipulation.
 * All AI-driven mutations must go through this file.
 */
import {
  nodes,
  edges,
  addNode,
  addEdge,
  updateNode,
  removeNode,
  currentProjectId as canvasProjectId,
  canvasViewport
} from '@/stores/canvas'
import {
  projects,
  currentProjectId as projectStoreCurrentId,
  createProject,
  updateProject,
  updateProjectCanvas
} from '@/stores/projects'
import { PROJECT_TYPES, createEmptyProjectStructure } from '@/config/projectSchema'
import { buildComfyWorkflowNodeData, isComfyApiWorkflow } from '@/integrations/comfy/workflowAdapter'
import { buildDefaultComfyWrapperData } from '@/integrations/comfy/yufengComfyShell'
import { createHuobaoDramaProjectSeed, createHuobaoStoryboards, normalizeHuobaoShotToYufengShot } from '@/integrations/drama/huobaoDramaCore'

const ALLOWED_NODE_TYPES = new Set(['text', 'imageConfig', 'image', 'videoConfig', 'video', 'llmConfig', 'comfyWorkflow', 'cloudImageWorkflow'])

const ALLOWED_DATA_FIELDS = {
  text: ['content', 'label'],
  imageConfig: ['prompt', 'label', 'model', 'size', 'quality'],
  image: ['label', 'prompt', 'source'],
  videoConfig: ['prompt', 'label', 'model', 'ratio', 'duration'],
  video: ['label', 'source', 'duration'],
  llmConfig: ['systemPrompt', 'label', 'model', 'outputFormat'],
  comfyWorkflow: ['prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'label'],
  cloudImageWorkflow: ['prompt', 'negativePrompt', 'label', 'model', 'size', 'seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise']
}

const BLOCKED_DATA_FIELDS = new Set([
  'apiWorkflow', 'baseUrl', 'bindings', 'status', 'error', 'outputNodeId', 'outputNodeIds',
  'lastPromptId', 'lastRunAt', 'assetPath', 'url', 'loading', 'progress', 'attempt',
  'isPolling', 'createdAt', 'updatedAt'
])

function ok(message, extra = {}) {
  return { ok: true, message, ...extra }
}

function fail(message) {
  return { ok: false, message }
}

function getNodeById(id) {
  return nodes.value.find(node => node.id === id) || null
}

function getCurrentProject() {
  const id = canvasProjectId.value || projectStoreCurrentId.value
  return projects.value.find(project => project.id === id) || null
}

function persistCurrentCanvas(projectId = canvasProjectId.value) {
  if (!projectId) return
  updateProjectCanvas(projectId, {
    nodes: nodes.value,
    edges: edges.value,
    viewport: canvasViewport.value
  })
}

function ensureProject({ name = '未命名项目', type = PROJECT_TYPES.MIXED } = {}) {
  let project = getCurrentProject()
  if (project) {
    if (type && project.type !== type) updateProject(project.id, { type })
    canvasProjectId.value = project.id
    projectStoreCurrentId.value = project.id
    persistCurrentCanvas(project.id)
    return { projectId: project.id, project: projects.value.find(p => p.id === project.id) || project, created: false }
  }

  const projectId = createProject(name, type)
  canvasProjectId.value = projectId
  projectStoreCurrentId.value = projectId
  persistCurrentCanvas(projectId)
  project = projects.value.find(p => p.id === projectId)
  return { projectId, project, created: true }
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

function addLinkedNode(type, position, data) {
  return addNode(type, position || { x: 200, y: 200 }, data || {})
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
  const id = addLinkedNode(params.type, params.position, sanitizeNodeData(params.type, params.data || {}))
  persistCurrentCanvas()
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
    return fail(`${node.type} 没有允许更新的字段`)
  }
  return null
}

export function executeUpdateNode(params) {
  const err = validateUpdateNode(params)
  if (err) return err
  const node = getNodeById(params.id)
  const cleaned = sanitizeNodeData(node.type, params.data)
  updateNode(params.id, { ...cleaned, updatedAt: Date.now() })
  persistCurrentCanvas()
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
  persistCurrentCanvas()
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
  persistCurrentCanvas()
  return ok('节点已连接', { edgeIds: [edgeId] })
}

// --- Comfy ---
export function validateImportComfyWorkflow(params) {
  const workflow = params?.apiWorkflow || params?.workflow
  if (!isComfyApiWorkflow(workflow)) return fail('请选择有效的 Comfy API workflow JSON（高级本地 Comfy 兼容）')
  return null
}

export function executeImportComfyWorkflow(params) {
  const err = validateImportComfyWorkflow(params)
  if (err) return err
  const position = params.position || { x: 220, y: 180 }
  const data = buildComfyWorkflowNodeData(params.apiWorkflow || params.workflow, params.name || params.fileName || 'Comfy 工作流')
  const nodeId = addLinkedNode('comfyWorkflow', position, data)
  persistCurrentCanvas()
  return ok('高级本地 Comfy 兼容：workflow 已导入为可编辑节点', { nodeIds: [nodeId] })
}

export function validateCreateComfyWrapper(params) {
  if (params?.templateId != null && typeof params.templateId !== 'string') return fail('templateId 必须是字符串')
  const posErr = validatePosition(params?.position)
  if (posErr) return posErr
  return null
}

export function executeCreateComfyWrapper(params = {}) {
  const err = validateCreateComfyWrapper(params)
  if (err) return err
  const data = buildDefaultComfyWrapperData(params.templateId || 'txt2img-basic')
  const nodeId = addLinkedNode('comfyWorkflow', params.position || { x: 240, y: 180 }, {
    ...data,
    bindings: data.bindings || {
      prompt: { virtual: true },
      negativePrompt: { virtual: true },
      width: { virtual: true },
      height: { virtual: true },
      seed: { virtual: true },
      steps: { virtual: true },
      cfg: { virtual: true }
    },
    status: 'idle',
    error: '这是旧版工作流包装节点。可导入工作流配置后在高级设置中使用，普通用户请使用云端 ImageConfig 节点。'
  })
  persistCurrentCanvas()
  return ok('高级本地 Comfy 兼容：包装节点已创建', { nodeIds: [nodeId] })
}

export function validateRunComfyWorkflow(params) {
  if (!params?.nodeId || typeof params.nodeId !== 'string') return fail('nodeId 必须是非空字符串')
  const node = getNodeById(params.nodeId)
  if (!node) return fail(`节点不存在: ${params.nodeId}`)
  if (node.type !== 'comfyWorkflow') return fail('runComfyWorkflow 只能运行 Comfy 工作流节点')
  if (!node.data?.apiWorkflow) return fail('高级本地 Comfy 兼容：该节点还没有绑定 API workflow JSON，不能运行')
  return null
}

export function executeRunComfyWorkflow(params) {
  const err = validateRunComfyWorkflow(params)
  if (err) return err
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return fail('当前环境无法触发 Comfy 工作流运行')
  }
  window.dispatchEvent(new CustomEvent('yufeng:run-comfy-workflow', { detail: { nodeId: params.nodeId } }))
  return ok('高级本地 Comfy 兼容：工作流运行请求已发送', { nodeIds: [params.nodeId] })
}

// Backward-compatible alias. It is no longer a stub.
export const validateImportComfyWorkflowTemplate = validateImportComfyWorkflow
export const executeImportComfyWorkflowTemplate = executeImportComfyWorkflow

// --- Drama ---
export function validateCreateDramaProject(params = {}) {
  if (params.title != null && typeof params.title !== 'string') return fail('title 必须是字符串')
  if (params.premise != null && typeof params.premise !== 'string') return fail('premise 必须是字符串')
  return null
}

export function executeCreateDramaProject(params = {}) {
  const err = validateCreateDramaProject(params)
  if (err) return err
  const { projectId, project, created } = ensureProject({ name: params.title || '短剧项目', type: PROJECT_TYPES.DRAMA })
  const base = createEmptyProjectStructure(PROJECT_TYPES.DRAMA)
  const seed = createHuobaoDramaProjectSeed(params.premise || params.title || '短剧项目')
  const now = Date.now()
  updateProject(projectId, {
    type: PROJECT_TYPES.DRAMA,
    name: params.title || project?.name || '短剧项目',
    drama: {
      ...base.drama,
      ...(project?.drama || {}),
      premise: params.premise || project?.drama?.premise || seed.premise,
      characters: project?.drama?.characters?.length ? project.drama.characters : seed.characters,
      locations: project?.drama?.locations?.length ? project.drama.locations : seed.locations,
      episodes: project?.drama?.episodes?.length ? project.drama.episodes : seed.episodes
    },
    aiWorkspace: {
      ...base.aiWorkspace,
      ...(project?.aiWorkspace || {}),
      plans: [
        ...((project?.aiWorkspace && Array.isArray(project.aiWorkspace.plans)) ? project.aiWorkspace.plans : []),
        { id: `plan_${now}`, title: params.title || '短剧项目规划', content: params.premise || '', createdAt: now }
      ]
    }
  })
  persistCurrentCanvas(projectId)
  return ok(created ? '短剧项目已创建' : '当前项目已升级为短剧项目', { projectId })
}

export function validateCreateCharacterBible(params = {}) {
  if (params.characters != null && !Array.isArray(params.characters)) return fail('characters 必须是数组')
  return null
}

export function executeCreateCharacterBible(params = {}) {
  const err = validateCreateCharacterBible(params)
  if (err) return err
  const { projectId, project } = ensureProject({ name: params.title || '短剧项目', type: PROJECT_TYPES.DRAMA })
  const seed = createHuobaoDramaProjectSeed(project?.drama?.premise || params.title || '短剧项目')
  const characters = params.characters?.length ? params.characters : (project?.drama?.characters?.length ? project.drama.characters : seed.characters)
  updateProject(projectId, {
    type: PROJECT_TYPES.DRAMA,
    drama: { ...(project?.drama || {}), characters }
  })
  const y = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const bibleId = addLinkedNode('text', { x: 120, y }, { label: '角色 Bible', content: characters.map(c => `${c.name}：${c.description}`).join('\n') })
  const portraitId = addLinkedNode('imageConfig', { x: 520, y }, { label: '角色标准照', prompt: '角色标准照，正面，干净背景，面部清晰，服装发型稳定', size: '1024x1024', quality: 'high' })
  const sheetId = addLinkedNode('imageConfig', { x: 900, y }, { label: '角色三视图 / 表情表', prompt: '角色设定表，正面侧面背面，多表情，统一服装和发型', size: '1920x1080', quality: 'high' })
  addEdge({ source: bibleId, target: portraitId, sourceHandle: 'right', targetHandle: 'left' })
  const edge2 = addEdge({ source: portraitId, target: sheetId, sourceHandle: 'right', targetHandle: 'left' })
  persistCurrentCanvas(projectId)
  return ok('角色库和一致性节点已创建', { projectId, nodeIds: [bibleId, portraitId, sheetId], edgeIds: [edge2] })
}

export function validateCreateSceneBible(params = {}) {
  if (params.locations != null && !Array.isArray(params.locations)) return fail('locations 必须是数组')
  return null
}

export function executeCreateSceneBible(params = {}) {
  const err = validateCreateSceneBible(params)
  if (err) return err
  const { projectId, project } = ensureProject({ name: params.title || '短剧项目', type: PROJECT_TYPES.DRAMA })
  const seed = createHuobaoDramaProjectSeed(project?.drama?.premise || params.title || '短剧项目')
  const locations = params.locations?.length ? params.locations : (project?.drama?.locations?.length ? project.drama.locations : seed.locations)
  updateProject(projectId, { type: PROJECT_TYPES.DRAMA, drama: { ...(project?.drama || {}), locations } })
  const y = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const nodeId = addLinkedNode('text', { x: 120, y }, { label: '场景 Bible', content: locations.map(l => `${l.name || l.location}：${l.description || l.prompt || ''}`).join('\n') })
  persistCurrentCanvas(projectId)
  return ok('场景库已创建', { projectId, nodeIds: [nodeId] })
}

export function validateCreateEpisodeOutline(params = {}) {
  if (params.episodes != null && !Array.isArray(params.episodes)) return fail('episodes 必须是数组')
  return null
}

export function executeCreateEpisodeOutline(params = {}) {
  const err = validateCreateEpisodeOutline(params)
  if (err) return err
  const { projectId, project } = ensureProject({ name: params.title || '短剧项目', type: PROJECT_TYPES.DRAMA })
  const episodes = params.episodes?.length ? params.episodes : [{ id: `ep_${Date.now()}_1`, index: 1, title: '第一集', summary: params.summary || '建立人物关系、抛出冲突，并在结尾留下钩子。' }]
  updateProject(projectId, { type: PROJECT_TYPES.DRAMA, drama: { ...(project?.drama || {}), episodes } })
  return ok('分集大纲已创建', { projectId, episodeIds: episodes.map(ep => ep.id) })
}

export function validateCreateShotList(params = {}) {
  if (params.shots != null && !Array.isArray(params.shots)) return fail('shots 必须是数组')
  return null
}

export function executeCreateShotList(params = {}) {
  const err = validateCreateShotList(params)
  if (err) return err
  const { projectId, project } = ensureProject({ name: params.title || '短剧项目', type: PROJECT_TYPES.DRAMA })
  const premise = params.premise || project?.drama?.premise || '短剧项目'
  const incomingShots = params.shots?.length ? params.shots : createHuobaoStoryboards(premise, Number(params.count || 8))
  const now = Date.now()
  const shots = incomingShots.map((rawShot, index) => {
    const shot = normalizeHuobaoShotToYufengShot(rawShot)
    return ({
    id: shot.id || `shot_${now}_${index + 1}`,
    index: index + 1,
    title: shot.title || `镜头 ${index + 1}`,
    description: shot.description || '',
    prompt: shot.prompt || shot.description || `${premise}，镜头 ${index + 1}，电影感短剧首帧`,
    imagePrompt: shot.imagePrompt || shot.prompt || shot.description || `${premise}，镜头 ${index + 1}，电影感短剧首帧`,
    videoPrompt: shot.videoPrompt || `${premise}，镜头 ${index + 1}，自然镜头运动，画面稳定`,
    shotType: shot.shotType,
    angle: shot.angle,
    movement: shot.movement,
    location: shot.location,
    time: shot.time,
    bgmPrompt: shot.bgmPrompt,
    soundEffect: shot.soundEffect,
    duration: shot.duration || 5,
    status: shot.status || 'pending',
    createdAt: now,
    updatedAt: now
  })
  })

  const baseY = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const nodeIds = []
  const edgeIds = []
  for (let i = 0; i < shots.length; i++) {
    const y = baseY + i * 190
    const shot = shots[i]
    const textId = addLinkedNode('text', { x: 120, y }, { label: `${shot.title} 镜头描述`, content: `${shot.description || shot.prompt}\n\n视频：${shot.videoPrompt}` })
    const imageId = addLinkedNode('imageConfig', { x: 540, y }, { label: `${shot.title} 首帧`, prompt: shot.imagePrompt || shot.prompt, size: '1920x1080', quality: 'high' })
    const videoId = addLinkedNode('videoConfig', { x: 920, y }, { label: `${shot.title} 视频`, prompt: shot.videoPrompt, ratio: '16:9', duration: shot.duration })
    const edge1 = addEdge({ source: textId, target: imageId, sourceHandle: 'right', targetHandle: 'left' })
    const edge2 = addEdge({ source: imageId, target: videoId, sourceHandle: 'right', targetHandle: 'left' })
    shot.nodeIds = { text: textId, firstFrame: imageId, video: videoId }
    nodeIds.push(textId, imageId, videoId)
    edgeIds.push(edge1, edge2)
  }

  updateProject(projectId, {
    type: PROJECT_TYPES.DRAMA,
    drama: {
      ...(project?.drama || {}),
      premise,
      shots: [...((project?.drama && Array.isArray(project.drama.shots)) ? project.drama.shots : []), ...shots]
    }
  })
  persistCurrentCanvas(projectId)
  return ok(`已创建 ${shots.length} 个镜头、首帧和视频节点`, { projectId, shotIds: shots.map(shot => shot.id), nodeIds, edgeIds })
}

export function validateCreateFirstFrameWorkflow(params = {}) {
  if (params.shotId != null && typeof params.shotId !== 'string') return fail('shotId 必须是字符串')
  return null
}

export function executeCreateFirstFrameWorkflow(params = {}) {
  const y = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const prompt = params.prompt || '电影感短剧首帧，主体清晰，构图明确，角色一致，光影统一'
  const nodeId = addLinkedNode('imageConfig', { x: 520, y }, { label: params.label || '首帧生成', prompt, size: '1920x1080', quality: 'high' })
  persistCurrentCanvas()
  return ok('首帧工作流已创建', { nodeIds: [nodeId] })
}

export function validateCreateVideoWorkflow(params = {}) {
  if (params.duration != null && !Number.isFinite(Number(params.duration))) return fail('duration 必须是数字')
  return null
}

export function executeCreateVideoWorkflow(params = {}) {
  const y = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const nodeId = addLinkedNode('videoConfig', { x: 900, y }, { label: params.label || '视频生成', prompt: params.prompt || '自然镜头运动，画面稳定，保持主体一致性', ratio: params.ratio || '16:9', duration: params.duration || 5 })
  persistCurrentCanvas()
  return ok('视频工作流已创建', { nodeIds: [nodeId] })
}

// --- Cloud Image Workflow ---
export function validateCreateCloudImageWorkflow(params = {}) {
  const posErr = validatePosition(params.position)
  if (posErr) return posErr
  return null
}

export function executeCreateCloudImageWorkflow(params = {}) {
  const err = validateCreateCloudImageWorkflow(params)
  if (err) return err
  const y = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const nodeId = addLinkedNode('cloudImageWorkflow', params.position || { x: 420, y }, {
    label: params.label || '云端专业工作流',
    prompt: params.prompt || '',
    negativePrompt: params.negativePrompt || '',
    size: params.size || '1440x2560',
    steps: Number(params.steps) || 20,
    cfg: Number(params.cfg) || 7,
    sampler: params.sampler || 'euler',
    scheduler: params.scheduler || 'normal',
    denoise: params.denoise != null ? Number(params.denoise) : 1.0,
    seed: params.seed != null ? Number(params.seed) : -1
  })
  persistCurrentCanvas()
  return ok('云端专业工作流节点已创建', { nodeIds: [nodeId] })
}

export function validateRunCloudImageWorkflow(params = {}) {
  if (!params.nodeId || typeof params.nodeId !== 'string') return fail('nodeId 必须是非空字符串')
  const node = getNodeById(params.nodeId)
  if (!node) return fail(`节点不存在: ${params.nodeId}`)
  if (node.type !== 'cloudImageWorkflow') return fail('该节点不是云端专业工作流节点')
  return null
}

export function executeRunCloudImageWorkflow(params = {}) {
  const err = validateRunCloudImageWorkflow(params)
  if (err) return err
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return fail('当前环境无法触发云端工作流运行')
  }
  window.dispatchEvent(new CustomEvent('yufeng:run-cloud-image-workflow', { detail: { nodeId: params.nodeId } }))
  return ok('云端专业工作流运行请求已发送', { nodeIds: [params.nodeId] })
}

// --- assets/error helpers ---
export function validateSaveAsset(params = {}) {
  if (!params.assetId && !params.nodeId) return fail('saveAsset 需要 assetId 或 nodeId')
  return null
}
export function executeSaveAsset(params = {}) { return ok('资产保存由生成节点自动完成', { assetIds: params.assetId ? [params.assetId] : [] }) }

export function validateFixWorkflowError(params = {}) {
  if (params.nodeId != null && typeof params.nodeId !== 'string') return fail('nodeId 必须是字符串')
  return null
}
export function executeFixWorkflowError(params = {}) {
  return ok('已生成工作流修复建议', { suggestions: ['检查 Comfy 是否连接', '确认 SaveImage / PreviewImage 输出节点存在', '确认缺失模型和自定义节点已安装'], nodeIds: params.nodeId ? [params.nodeId] : [] })
}

const COMMAND_MAP = {
  createProject: { validate: () => null, execute: (params = {}) => {
    const { projectId } = ensureProject({ name: params.name || '未命名项目', type: params.type || PROJECT_TYPES.MIXED })
    return ok('项目已创建', { projectId })
  } },
  addNode: { validate: validateAddNode, execute: executeAddNode },
  updateNode: { validate: validateUpdateNode, execute: executeUpdateNode },
  removeNode: { validate: validateRemoveNode, execute: executeRemoveNode },
  connectNodes: { validate: validateConnectNodes, execute: executeConnectNodes },
  importComfyWorkflow: { validate: validateImportComfyWorkflow, execute: executeImportComfyWorkflow },
  importComfyWorkflowTemplate: { validate: validateImportComfyWorkflowTemplate, execute: executeImportComfyWorkflowTemplate },
  createComfyWrapper: { validate: validateCreateComfyWrapper, execute: executeCreateComfyWrapper },
  runComfyWorkflow: { validate: validateRunComfyWorkflow, execute: executeRunComfyWorkflow },
  createDramaProject: { validate: validateCreateDramaProject, execute: executeCreateDramaProject },
  createCharacterBible: { validate: validateCreateCharacterBible, execute: executeCreateCharacterBible },
  createSceneBible: { validate: validateCreateSceneBible, execute: executeCreateSceneBible },
  createEpisodeOutline: { validate: validateCreateEpisodeOutline, execute: executeCreateEpisodeOutline },
  createShotList: { validate: validateCreateShotList, execute: executeCreateShotList },
  createFirstFrameWorkflow: { validate: validateCreateFirstFrameWorkflow, execute: executeCreateFirstFrameWorkflow },
  createVideoWorkflow: { validate: validateCreateVideoWorkflow, execute: executeCreateVideoWorkflow },
  createCloudImageWorkflow: { validate: validateCreateCloudImageWorkflow, execute: executeCreateCloudImageWorkflow },
  runCloudImageWorkflow: { validate: validateRunCloudImageWorkflow, execute: executeRunCloudImageWorkflow },
  fixWorkflowError: { validate: validateFixWorkflowError, execute: executeFixWorkflowError },
  saveAsset: { validate: validateSaveAsset, execute: executeSaveAsset }
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
  if (!Array.isArray(commands) || commands.length === 0) return fail('commands 必须是非空数组')
  const plannedRefs = new Map()
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (!cmd.name) return fail(`第 ${i + 1} 条命令缺少 name`)
    const cmdDef = COMMAND_MAP[cmd.name]
    if (!cmdDef) return fail(`第 ${i + 1} 条：未知命令 ${cmd.name}`)

    if (cmd.name === 'addNode') {
      const err = cmdDef.validate(cmd.params || {})
      if (err) return fail(`第 ${i + 1} 条：${err.message}`)
      const ref = cmd.params?.ref
      if (ref) {
        if (plannedRefs.has(ref) || getNodeById(ref)) return fail(`第 ${i + 1} 条：ref 已存在 ${ref}`)
        plannedRefs.set(ref, cmd.params.type)
      }
      continue
    }

    if (cmd.name === 'connectNodes') {
      const params = cmd.params || {}
      if (!params.source || typeof params.source !== 'string') return fail(`第 ${i + 1} 条：source 必须是非空字符串`)
      if (!params.target || typeof params.target !== 'string') return fail(`第 ${i + 1} 条：target 必须是非空字符串`)
      if (params.source === params.target) return fail(`第 ${i + 1} 条：不能连接同一个节点`)
      if (!getNodeById(params.source) && !plannedRefs.has(params.source)) return fail(`第 ${i + 1} 条：源节点不存在或未声明 ref ${params.source}`)
      if (!getNodeById(params.target) && !plannedRefs.has(params.target)) return fail(`第 ${i + 1} 条：目标节点不存在或未声明 ref ${params.target}`)
      continue
    }

    const err = cmdDef.validate(cmd.params || {})
    if (err) return fail(`第 ${i + 1} 条：${err.message}`)
  }
  return null
}

export function executeCommandBatch(commands) {
  const results = []
  const allNodeIds = []
  const allEdgeIds = []
  const allShotIds = []
  const allAssetIds = []
  const refMap = new Map()
  let projectId = null

  for (const cmd of commands) {
    const params = { ...(cmd.params || {}) }
    if (cmd.name === 'connectNodes') {
      params.source = refMap.get(params.source) || params.source
      params.target = refMap.get(params.target) || params.target
    }
    const result = executeCommand(cmd.name, params)
    results.push({ name: cmd.name, ...result })
    if (!result.ok) return { ok: false, results, failedAt: cmd.name, message: result.message, nodeIds: allNodeIds, edgeIds: allEdgeIds, shotIds: allShotIds, assetIds: allAssetIds, projectId }
    if (result.projectId) projectId = result.projectId
    if (result.nodeIds) allNodeIds.push(...result.nodeIds)
    if (result.edgeIds) allEdgeIds.push(...result.edgeIds)
    if (result.shotIds) allShotIds.push(...result.shotIds)
    if (result.assetIds) allAssetIds.push(...result.assetIds)
    if (cmd.name === 'addNode' && cmd.params?.ref && result.nodeIds?.[0]) refMap.set(cmd.params.ref, result.nodeIds[0])
  }

  return { ok: true, results, nodeIds: allNodeIds, edgeIds: allEdgeIds, shotIds: allShotIds, assetIds: allAssetIds, projectId }
}

export const COMMAND_NAMES = Object.keys(COMMAND_MAP)
