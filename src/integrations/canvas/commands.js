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
import { createHuobaoDramaProjectSeed, createHuobaoStoryboards, normalizeHuobaoShotToYufengShot, addShot, removeShot, duplicateShot, addCharacter, removeCharacter as removeDramaCharacter, updateCharacter as updateDramaCharacter, addScene, removeScene as removeDramaScene, updateScene as updateDramaScene, addEpisode, removeEpisode as removeDramaEpisode, updateEpisode as updateDramaEpisode } from '@/integrations/drama/huobaoDramaCore'

const ALLOWED_NODE_TYPES = new Set(['text', 'imageConfig', 'image', 'videoConfig', 'video', 'llmConfig', 'comfyWorkflow', 'cloudImageWorkflow', 'dramaShot'])

const ALLOWED_DATA_FIELDS = {
  text: ['content', 'label'],
  imageConfig: ['prompt', 'label', 'model', 'size', 'quality'],
  image: ['label', 'prompt', 'source'],
  videoConfig: ['prompt', 'label', 'model', 'ratio', 'duration'],
  video: ['label', 'source', 'duration'],
  llmConfig: ['systemPrompt', 'label', 'model', 'outputFormat'],
  comfyWorkflow: ['prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'label'],
  cloudImageWorkflow: ['prompt', 'negativePrompt', 'label', 'model', 'size', 'seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise'],
  dramaShot: ['label', 'shotId', 'shotIndex', 'shotTitle', 'shotType', 'angle', 'movement', 'sceneName', 'characterNames', 'description', 'dialogue', 'status', 'firstFrameStatus', 'videoStatus', 'firstFrameNodeId', 'videoNodeId']
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
  const settings = params.settings || {}
  const seed = createHuobaoDramaProjectSeed(params.premise || params.title || '短剧项目', settings)
  const now = Date.now()
  updateProject(projectId, {
    type: PROJECT_TYPES.DRAMA,
    name: params.title || project?.name || '短剧项目',
    drama: {
      ...base.drama,
      ...(project?.drama || {}),
      premise: params.premise || project?.drama?.premise || seed.premise,
      genre: project?.drama?.genre || seed.genre || '',
      style: project?.drama?.style || seed.style || 'realistic',
      characters: project?.drama?.characters?.length ? project.drama.characters : seed.characters,
      scenes: project?.drama?.scenes?.length ? project.drama.scenes : seed.scenes,
      episodes: project?.drama?.episodes?.length ? project.drama.episodes : seed.episodes,
      dramaGenerationSettings: settings || seed.dramaGenerationSettings || base.drama?.dramaGenerationSettings || {}
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
  const characters = project?.drama?.characters || []
  const scenes = project?.drama?.scenes || []
  const incomingShots = params.shots?.length ? params.shots : createHuobaoStoryboards(premise, Number(params.count || project?.drama?.dramaGenerationSettings?.shotCount || 8), characters, scenes)
  const now = Date.now()

  const shots = incomingShots.map((rawShot, index) => {
    const shot = normalizeHuobaoShotToYufengShot(rawShot)
    return {
      id: shot.id || `shot_${now}_${index + 1}`,
      index: index + 1,
      storyboardNumber: index + 1,
      title: shot.title || `镜头 ${index + 1}`,
      shotType: shot.shotType || '',
      angle: shot.angle || '',
      movement: shot.movement || '',
      sceneId: shot.sceneId || '',
      location: shot.location || '',
      time: shot.time || '',
      characterIds: shot.characterIds || [],
      action: shot.action || '',
      dialogue: shot.dialogue || '',
      description: shot.description || '',
      result: shot.result || '',
      atmosphere: shot.atmosphere || '',
      imagePrompt: shot.imagePrompt || shot.prompt || shot.description || '',
      prompt: shot.prompt || shot.imagePrompt || shot.description || '',
      firstFramePrompt: shot.firstFramePrompt || shot.imagePrompt || shot.description || '',
      videoPrompt: shot.videoPrompt || '',
      bgmPrompt: shot.bgmPrompt || '',
      soundEffect: shot.soundEffect || '',
      duration: shot.duration || 5,
      status: 'idle',
      firstFrameStatus: 'idle',
      videoStatus: 'idle',
      nodeIds: {},
      firstFrameNodeId: '',
      videoNodeId: '',
      assetIds: [],
      episodeId: shot.episodeId || '',
      createdAt: now,
      updatedAt: now
    }
  })

  // Create DramaShotNode for each shot
  const baseY = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 220 : 180
  const nodeIds = []
  const edgeIds = []
  for (let i = 0; i < shots.length; i++) {
    const y = baseY + i * 160
    const x = 300
    const shot = shots[i]
    const characterNames = shot.characterIds
      .map(cid => characters.find(c => c.id === cid))
      .filter(Boolean)
      .map(c => c.name)
      .join('、')
    const sceneObj = scenes.find(s => s.id === shot.sceneId)
    const sceneName = sceneObj?.name || shot.location || ''

    const dramaShotNodeId = addLinkedNode('dramaShot', { x, y }, {
      label: shot.title,
      shotId: shot.id,
      shotIndex: shot.index,
      shotTitle: shot.title,
      shotType: shot.shotType,
      angle: shot.angle,
      movement: shot.movement,
      sceneName,
      characterNames,
      description: shot.description,
      dialogue: shot.dialogue,
      status: 'idle',
      firstFrameStatus: 'idle',
      videoStatus: 'idle',
      firstFrameNodeId: '',
      videoNodeId: ''
    })
    shot.nodeIds = { text: dramaShotNodeId }
    nodeIds.push(dramaShotNodeId)

    // Connect sequential shots
    if (i > 0 && nodeIds.length >= 2) {
      const prevNodeId = nodeIds[nodeIds.length - 2]
      const edgeId = addEdge({ source: prevNodeId, target: dramaShotNodeId, sourceHandle: 'right', targetHandle: 'left' })
      edgeIds.push(edgeId)
    }
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
  return ok(`已创建 ${shots.length} 个镜头节点`, { projectId, shotIds: shots.map(shot => shot.id), nodeIds, edgeIds })
}

export function validateCreateFirstFrameWorkflow(params = {}) {
  if (!params.shotId || typeof params.shotId !== 'string') return fail('shotId 必须是非空字符串')
  return null
}

export function executeCreateFirstFrameWorkflow(params = {}) {
  const err = validateCreateFirstFrameWorkflow(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project?.drama?.shots) return fail('当前项目没有短剧数据')
  const shot = project.drama.shots.find(s => s.id === params.shotId)
  if (!shot) return fail(`镜头不存在: ${params.shotId}`)

  const dramaShotNodeId = shot.nodeIds?.text
  if (!dramaShotNodeId) return fail('镜头没有对应的画布节点')
  const dramaShotNode = getNodeById(dramaShotNodeId)
  if (!dramaShotNode) return fail('镜头画布节点不存在')

  const prompt = shot.firstFramePrompt || shot.imagePrompt || shot.description || '电影感短剧首帧，主体清晰，构图明确，角色一致，光影统一'
  const x = (dramaShotNode.position?.x || 300) + 320
  const y = dramaShotNode.position?.y || 180

  const cloudNodeId = addLinkedNode('cloudImageWorkflow', { x, y }, {
    label: `${shot.title} 首帧`,
    prompt,
    negativePrompt: '',
    size: '1440x2560',
    steps: 20,
    cfg: 7,
    sampler: 'euler',
    scheduler: 'normal',
    denoise: 1.0,
    seed: -1
  })
  addEdge({ source: dramaShotNodeId, target: cloudNodeId, sourceHandle: 'right', targetHandle: 'left' })

  shot.firstFrameNodeId = cloudNodeId
  shot.nodeIds = shot.nodeIds || {}
  shot.nodeIds.firstFrame = cloudNodeId
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas()

  return ok(`镜头「${shot.title}」首帧工作流已创建`, { nodeIds: [cloudNodeId], edgeIds: [], shotId: params.shotId })
}

export function validateCreateVideoWorkflow(params = {}) {
  if (!params.shotId || typeof params.shotId !== 'string') return fail('shotId 必须是非空字符串')
  return null
}

export function executeCreateVideoWorkflow(params = {}) {
  const err = validateCreateVideoWorkflow(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project?.drama?.shots) return fail('当前项目没有短剧数据')
  const shot = project.drama.shots.find(s => s.id === params.shotId)
  if (!shot) return fail(`镜头不存在: ${params.shotId}`)

  const dramaShotNodeId = shot.nodeIds?.text
  if (!dramaShotNodeId) return fail('镜头没有对应的画布节点')
  const dramaShotNode = getNodeById(dramaShotNodeId)
  if (!dramaShotNode) return fail('镜头画布节点不存在')

  const prompt = shot.videoPrompt || shot.description || '自然镜头运动，画面稳定'
  const firstFrameNodeId = shot.firstFrameNodeId || shot.nodeIds?.firstFrame
  const sourceX = firstFrameNodeId
    ? (getNodeById(firstFrameNodeId)?.position?.x || dramaShotNode.position?.x || 300)
    : (dramaShotNode.position?.x || 300)
  const x = sourceX + 380
  const y = dramaShotNode.position?.y || 180

  const videoNodeId = addLinkedNode('videoConfig', { x, y }, {
    label: `${shot.title} 视频`,
    prompt,
    ratio: project.drama.dramaGenerationSettings?.aspectRatio || '9:16',
    duration: shot.duration || 5
  })

  const sourceId = firstFrameNodeId || dramaShotNodeId
  addEdge({ source: sourceId, target: videoNodeId, sourceHandle: 'right', targetHandle: 'left' })

  shot.videoNodeId = videoNodeId
  shot.nodeIds = shot.nodeIds || {}
  shot.nodeIds.video = videoNodeId
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas()

  return ok(`镜头「${shot.title}」视频工作流已创建`, { nodeIds: [videoNodeId], edgeIds: [], shotId: params.shotId })
}

// --- Drama Shot Commands ---

export function validateUpdateDramaShot(params = {}) {
  if (!params?.shotId || typeof params.shotId !== 'string') return fail('shotId 必须是非空字符串')
  return null
}

export function executeUpdateDramaShot(params = {}) {
  const err = validateUpdateDramaShot(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project?.drama?.shots) return fail('当前项目没有短剧数据')
  const shot = project.drama.shots.find(s => s.id === params.shotId)
  if (!shot) return fail(`镜头不存在: ${params.shotId}`)

  const patch = params.patch || {}
  if (params.field && params.value != null) {
    patch[params.field] = params.value
  }
  Object.assign(shot, patch, { updatedAt: Date.now() })

  // Sync DramaShotNode data
  const nodeId = shot.nodeIds?.text
  if (nodeId) {
    const characters = project.drama.characters || []
    const scenes = project.drama.scenes || []
    const characterNames = (shot.characterIds || [])
      .map(cid => characters.find(c => c.id === cid))
      .filter(Boolean)
      .map(c => c.name)
      .join('、')
    const sceneObj = scenes.find(s => s.id === shot.sceneId)
    const sceneName = sceneObj?.name || shot.location || ''

    updateNode(nodeId, {
      label: shot.title,
      shotTitle: shot.title,
      shotType: shot.shotType,
      angle: shot.angle,
      movement: shot.movement,
      sceneName,
      characterNames,
      description: shot.description,
      dialogue: shot.dialogue,
      status: shot.status,
      firstFrameStatus: shot.firstFrameStatus,
      videoStatus: shot.videoStatus,
      firstFrameNodeId: shot.firstFrameNodeId || '',
      videoNodeId: shot.videoNodeId || ''
    })
    window.dispatchEvent(new CustomEvent(`yufeng:update-drama-shot-${params.shotId}`, { detail: { shot } }))
  }

  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('镜头已更新', { shotId: params.shotId })
}

export function validateLocateDramaShot(params = {}) {
  if (!params?.shotId || typeof params.shotId !== 'string') return fail('shotId 必须是非空字符串')
  return null
}

export function executeLocateDramaShot(params = {}) {
  const err = validateLocateDramaShot(params)
  if (err) return err
  const project = getCurrentProject()
  const shot = project?.drama?.shots?.find(s => s.id === params.shotId)
  if (!shot) return fail(`镜头不存在: ${params.shotId}`)
  const nodeId = shot.nodeIds?.text || shot.firstFrameNodeId || shot.videoNodeId
  if (!nodeId) return fail('该镜头没有关联节点')
  const node = getNodeById(nodeId)
  if (!node) return fail(`节点不存在: ${nodeId}`)
  return ok('已定位镜头节点', { nodeId, shotId: params.shotId })
}

export function validateAddDramaShot(params = {}) {
  return null
}

export function executeAddDramaShot(params = {}) {
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!project.drama) {
    updateProject(project.id, { type: PROJECT_TYPES.DRAMA, drama: { ...createEmptyProjectStructure(PROJECT_TYPES.DRAMA).drama } })
  }
  const freshProject = getCurrentProject()
  const shot = addShot(freshProject, params.shotData || {})
  if (!shot) return fail('添加镜头失败')

  // Create DramaShotNode
  const baseY = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 160 : 180
  const characters = freshProject.drama.characters || []
  const scenes = freshProject.drama.scenes || []
  const characterNames = (shot.characterIds || [])
    .map(cid => characters.find(c => c.id === cid))
    .filter(Boolean)
    .map(c => c.name)
    .join('、')
  const sceneObj = scenes.find(s => s.id === shot.sceneId)
  const sceneName = sceneObj?.name || shot.location || ''

  const nodeId = addLinkedNode('dramaShot', { x: 300, y: baseY }, {
    label: shot.title,
    shotId: shot.id,
    shotIndex: shot.index,
    shotTitle: shot.title,
    shotType: shot.shotType,
    angle: shot.angle,
    movement: shot.movement,
    sceneName,
    characterNames,
    description: shot.description,
    dialogue: shot.dialogue,
    status: 'idle',
    firstFrameStatus: 'idle',
    videoStatus: 'idle'
  })
  shot.nodeIds = { text: nodeId }

  updateProject(freshProject.id, { drama: { ...freshProject.drama } })
  persistCurrentCanvas(freshProject.id)
  return ok('镜头已添加', { shotId: shot.id, nodeIds: [nodeId] })
}

export function validateRemoveDramaShot(params = {}) {
  if (!params?.shotId || typeof params.shotId !== 'string') return fail('shotId 必须是非空字符串')
  return null
}

export function executeRemoveDramaShot(params = {}) {
  const project = getCurrentProject()
  if (!project?.drama?.shots) return fail('当前项目没有短剧数据')
  const shot = project.drama.shots.find(s => s.id === params.shotId)
  if (!shot) return fail(`镜头不存在: ${params.shotId}`)

  // Remove associated nodes
  const nodeIdsToRemove = []
  if (shot.nodeIds?.text) nodeIdsToRemove.push(shot.nodeIds.text)
  if (shot.firstFrameNodeId && !nodeIdsToRemove.includes(shot.firstFrameNodeId)) nodeIdsToRemove.push(shot.firstFrameNodeId)
  if (shot.videoNodeId && !nodeIdsToRemove.includes(shot.videoNodeId)) nodeIdsToRemove.push(shot.videoNodeId)
  nodeIdsToRemove.forEach(nid => removeNode(nid))

  removeShot(project, params.shotId)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('镜头已删除', { shotId: params.shotId, removedNodeIds: nodeIdsToRemove })
}

export function validateDuplicateDramaShot(params = {}) {
  if (!params?.shotId || typeof params.shotId !== 'string') return fail('shotId 必须是非空字符串')
  return null
}

export function executeDuplicateDramaShot(params = {}) {
  const project = getCurrentProject()
  if (!project?.drama?.shots) return fail('当前项目没有短剧数据')
  const newShot = duplicateShot(project, params.shotId)
  if (!newShot) return fail(`复制镜头失败: ${params.shotId}`)

  // Create DramaShotNode for the duplicate
  const baseY = nodes.value.length ? Math.max(...nodes.value.map(n => Number(n.position?.y) || 0)) + 160 : 180
  const characters = project.drama.characters || []
  const scenes = project.drama.scenes || []
  const characterNames = (newShot.characterIds || [])
    .map(cid => characters.find(c => c.id === cid))
    .filter(Boolean)
    .map(c => c.name)
    .join('、')
  const sceneObj = scenes.find(s => s.id === newShot.sceneId)
  const sceneName = sceneObj?.name || newShot.location || ''

  const nodeId = addLinkedNode('dramaShot', { x: 300, y: baseY }, {
    label: newShot.title,
    shotId: newShot.id,
    shotIndex: newShot.index,
    shotTitle: newShot.title,
    shotType: newShot.shotType,
    angle: newShot.angle,
    movement: newShot.movement,
    sceneName,
    characterNames,
    description: newShot.description,
    dialogue: newShot.dialogue,
    status: 'idle',
    firstFrameStatus: 'idle',
    videoStatus: 'idle'
  })
  newShot.nodeIds = { text: nodeId }

  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('镜头已复制', { shotId: newShot.id, nodeIds: [nodeId] })
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
  if (!node.data?.model) return fail('请先在云端工作流节点中选择图片模型')
  return null
}

export function executeRunCloudImageWorkflow(params = {}) {
  const err = validateRunCloudImageWorkflow(params)
  if (err) return err
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return fail('当前环境无法触发云端工作流运行')
  }
  // Verify the node still exists at execution time
  const node = getNodeById(params.nodeId)
  if (!node) return fail(`节点已不存在: ${params.nodeId}`)
  window.dispatchEvent(new CustomEvent('yufeng:run-cloud-image-workflow', { detail: { nodeId: params.nodeId } }))
  return ok('云端工作流运行请求已提交，等待节点响应', { nodeIds: [params.nodeId], submitted: true })
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

// --- Drama CRUD Commands (character / scene / episode / premise / cloud update) ---

export function validateUpdateDramaPremise(params = {}) {
  if (!params?.premise || typeof params.premise !== 'string') return fail('premise 必须是非空字符串')
  return null
}
export function executeUpdateDramaPremise(params = {}) {
  const err = validateUpdateDramaPremise(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  updateProject(project.id, { drama: { ...project.drama, premise: params.premise } })
  persistCurrentCanvas(project.id)
  return ok('故事前提已更新')
}

export function validateCreateCharacter(params = {}) {
  if (!params?.name || typeof params.name !== 'string') return fail('name 必须是非空字符串')
  return null
}
export function executeCreateCharacter(params = {}) {
  const err = validateCreateCharacter(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  const char = addCharacter(project, { name: params.name, role: params.role, appearance: params.appearance, personality: params.personality, voiceStyle: params.voiceStyle })
  if (!char) return fail('创建角色失败')
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok(`角色「${char.name}」已创建`, { characterId: char.id })
}

export function validateUpdateCharacter(params = {}) {
  if (!params?.characterId || typeof params.characterId !== 'string') return fail('characterId 必须是非空字符串')
  if (!params?.patch || typeof params.patch !== 'object') return fail('patch 必须是对象')
  return null
}
export function executeUpdateCharacter(params = {}) {
  const err = validateUpdateCharacter(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!updateDramaCharacter(project, params.characterId, params.patch)) return fail(`角色不存在: ${params.characterId}`)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('角色已更新', { characterId: params.characterId })
}

export function validateRemoveCharacter(params = {}) {
  if (!params?.characterId || typeof params.characterId !== 'string') return fail('characterId 必须是非空字符串')
  return null
}
export function executeRemoveCharacter(params = {}) {
  const err = validateRemoveCharacter(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!removeDramaCharacter(project, params.characterId)) return fail(`角色不存在: ${params.characterId}`)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('角色已删除', { characterId: params.characterId })
}

export function validateCreateScene(params = {}) {
  if (!params?.name || typeof params.name !== 'string') return fail('name 必须是非空字符串')
  return null
}
export function executeCreateScene(params = {}) {
  const err = validateCreateScene(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  const scene = addScene(project, { name: params.name, location: params.location, time: params.time, prompt: params.prompt })
  if (!scene) return fail('创建场景失败')
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok(`场景「${scene.name}」已创建`, { sceneId: scene.id })
}

export function validateUpdateScene(params = {}) {
  if (!params?.sceneId || typeof params.sceneId !== 'string') return fail('sceneId 必须是非空字符串')
  if (!params?.patch || typeof params.patch !== 'object') return fail('patch 必须是对象')
  return null
}
export function executeUpdateScene(params = {}) {
  const err = validateUpdateScene(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!updateDramaScene(project, params.sceneId, params.patch)) return fail(`场景不存在: ${params.sceneId}`)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('场景已更新', { sceneId: params.sceneId })
}

export function validateRemoveScene(params = {}) {
  if (!params?.sceneId || typeof params.sceneId !== 'string') return fail('sceneId 必须是非空字符串')
  return null
}
export function executeRemoveScene(params = {}) {
  const err = validateRemoveScene(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!removeDramaScene(project, params.sceneId)) return fail(`场景不存在: ${params.sceneId}`)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('场景已删除', { sceneId: params.sceneId })
}

export function validateCreateEpisode(params = {}) { return null }
export function executeCreateEpisode(params = {}) {
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!project.drama) updateProject(project.id, { type: PROJECT_TYPES.DRAMA, drama: { ...createEmptyProjectStructure(PROJECT_TYPES.DRAMA).drama } })
  const freshProject = getCurrentProject()
  const ep = addEpisode(freshProject, { title: params.title, summary: params.summary })
  if (!ep) return fail('创建分集失败')
  updateProject(freshProject.id, { drama: { ...freshProject.drama } })
  persistCurrentCanvas(freshProject.id)
  return ok(`分集「${ep.title}」已创建`, { episodeId: ep.id })
}

export function validateUpdateEpisode(params = {}) {
  if (!params?.episodeId || typeof params.episodeId !== 'string') return fail('episodeId 必须是非空字符串')
  if (!params?.patch || typeof params.patch !== 'object') return fail('patch 必须是对象')
  return null
}
export function executeUpdateEpisode(params = {}) {
  const err = validateUpdateEpisode(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!updateDramaEpisode(project, params.episodeId, params.patch)) return fail(`分集不存在: ${params.episodeId}`)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('分集已更新', { episodeId: params.episodeId })
}

export function validateRemoveEpisode(params = {}) {
  if (!params?.episodeId || typeof params.episodeId !== 'string') return fail('episodeId 必须是非空字符串')
  return null
}
export function executeRemoveEpisode(params = {}) {
  const err = validateRemoveEpisode(params)
  if (err) return err
  const project = getCurrentProject()
  if (!project) return fail('没有当前项目')
  if (!removeDramaEpisode(project, params.episodeId)) return fail(`分集不存在: ${params.episodeId}`)
  updateProject(project.id, { drama: { ...project.drama } })
  persistCurrentCanvas(project.id)
  return ok('分集已删除', { episodeId: params.episodeId })
}

export function validateUpdateCloudImageWorkflow(params = {}) {
  if (!params?.nodeId || typeof params.nodeId !== 'string') return fail('nodeId 必须是非空字符串')
  const node = getNodeById(params.nodeId)
  if (!node) return fail(`节点不存在: ${params.nodeId}`)
  if (node.type !== 'cloudImageWorkflow') return fail('该节点不是云端专业工作流节点')
  if (params.data && typeof params.data !== 'object') return fail('data 必须是对象')
  return null
}
export function executeUpdateCloudImageWorkflow(params = {}) {
  const err = validateUpdateCloudImageWorkflow(params)
  if (err) return err
  const cleaned = sanitizeNodeData('cloudImageWorkflow', params.data || {})
  updateNode(params.nodeId, { ...cleaned, updatedAt: Date.now() })
  persistCurrentCanvas()
  return ok('云端工作流参数已更新', { nodeIds: [params.nodeId] })
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
  updateDramaShot: { validate: validateUpdateDramaShot, execute: executeUpdateDramaShot },
  locateDramaShot: { validate: validateLocateDramaShot, execute: executeLocateDramaShot },
  addDramaShot: { validate: validateAddDramaShot, execute: executeAddDramaShot },
  removeDramaShot: { validate: validateRemoveDramaShot, execute: executeRemoveDramaShot },
  duplicateDramaShot: { validate: validateDuplicateDramaShot, execute: executeDuplicateDramaShot },
  fixWorkflowError: { validate: validateFixWorkflowError, execute: executeFixWorkflowError },
  saveAsset: { validate: validateSaveAsset, execute: executeSaveAsset },
  updateDramaPremise: { validate: validateUpdateDramaPremise, execute: executeUpdateDramaPremise },
  createCharacter: { validate: validateCreateCharacter, execute: executeCreateCharacter },
  updateCharacter: { validate: validateUpdateCharacter, execute: executeUpdateCharacter },
  removeCharacter: { validate: validateRemoveCharacter, execute: executeRemoveCharacter },
  createScene: { validate: validateCreateScene, execute: executeCreateScene },
  updateScene: { validate: validateUpdateScene, execute: executeUpdateScene },
  removeScene: { validate: validateRemoveScene, execute: executeRemoveScene },
  createEpisode: { validate: validateCreateEpisode, execute: executeCreateEpisode },
  updateEpisode: { validate: validateUpdateEpisode, execute: executeUpdateEpisode },
  removeEpisode: { validate: validateRemoveEpisode, execute: executeRemoveEpisode },
  updateCloudImageWorkflow: { validate: validateUpdateCloudImageWorkflow, execute: executeUpdateCloudImageWorkflow }
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

// --- Command metadata registry ---
export const COMMAND_REGISTRY = {
  createProject: { description: '创建新项目', risk: 'safe' },
  addNode: { description: '在画布上添加节点', risk: 'safe' },
  updateNode: { description: '更新节点数据', risk: 'safe' },
  removeNode: { description: '删除画布节点', risk: 'destructive' },
  connectNodes: { description: '连接两个节点', risk: 'safe' },
  importComfyWorkflow: { description: '导入 Comfy 工作流（高级本地功能）', risk: 'safe' },
  importComfyWorkflowTemplate: { description: '导入 Comfy 工作流模板', risk: 'safe' },
  createComfyWrapper: { description: '创建 Comfy 包装节点', risk: 'safe' },
  runComfyWorkflow: { description: '运行本地 Comfy 工作流', risk: 'execution' },
  createDramaProject: { description: '创建或升级为短剧项目', risk: 'safe' },
  createCharacterBible: { description: '创建角色库和一致性节点', risk: 'safe' },
  createSceneBible: { description: '创建场景库节点', risk: 'safe' },
  createEpisodeOutline: { description: '创建分集大纲', risk: 'safe' },
  createShotList: { description: '创建镜头列表和 DramaShot 节点', risk: 'safe' },
  createFirstFrameWorkflow: { description: '为首帧创建图片生成工作流', risk: 'safe' },
  createVideoWorkflow: { description: '为镜头创建视频生成工作流', risk: 'safe' },
  createCloudImageWorkflow: { description: '创建云端专业图片工作流节点', risk: 'safe' },
  runCloudImageWorkflow: { description: '执行云端图片生成（消耗 API 额度）', risk: 'execution' },
  updateCloudImageWorkflow: { description: '更新云端工作流参数', risk: 'safe' },
  updateDramaPremise: { description: '更新短剧故事前提', risk: 'safe' },
  updateDramaShot: { description: '更新镜头数据', risk: 'safe' },
  locateDramaShot: { description: '定位镜头到画布中心', risk: 'safe' },
  addDramaShot: { description: '添加新镜头', risk: 'safe' },
  removeDramaShot: { description: '删除镜头及其关联节点', risk: 'destructive' },
  duplicateDramaShot: { description: '复制镜头', risk: 'safe' },
  createCharacter: { description: '创建新角色', risk: 'safe' },
  updateCharacter: { description: '更新角色信息', risk: 'safe' },
  removeCharacter: { description: '删除角色', risk: 'destructive' },
  createScene: { description: '创建新场景', risk: 'safe' },
  updateScene: { description: '更新场景信息', risk: 'safe' },
  removeScene: { description: '删除场景', risk: 'destructive' },
  createEpisode: { description: '创建新分集', risk: 'safe' },
  updateEpisode: { description: '更新分集信息', risk: 'safe' },
  removeEpisode: { description: '删除分集', risk: 'destructive' },
  fixWorkflowError: { description: '生成工作流修复建议', risk: 'safe' },
  saveAsset: { description: '保存资产', risk: 'safe' }
}

export function dryRunCommandBatch(commands) {
  const descriptions = []
  let hasDestructive = false
  let hasExecution = false
  for (const cmd of commands) {
    const meta = COMMAND_REGISTRY[cmd.name]
    const risk = meta?.risk || 'safe'
    if (risk === 'destructive') hasDestructive = true
    if (risk === 'execution') hasExecution = true
    descriptions.push(meta?.description || cmd.name)
  }
  return { ok: true, descriptions, hasDestructive, hasExecution, commandCount: commands.length }
}
