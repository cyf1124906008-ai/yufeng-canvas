/**
 * Huobao Drama core absorbed into YUFENG Canvas.
 * This maps the original huobao-drama domain model
 * (dramas / episodes / characters / scenes / storyboards / image/video generations)
 * into YUFENG local project schema and canvas nodes.
 */

export const HUOBAO_DRAMA_TABLES = [
  'dramas', 'episodes', 'characters', 'scenes', 'storyboards',
  'image_generations', 'video_generations', 'ai_service_configs', 'ai_voices'
]

export const HUOBAO_AGENT_SKILLS = {
  scriptRewriter: {
    name: 'script_rewriter',
    title: '小说/创意改写成短剧剧本',
    output: ['premise', 'episodes', 'characters', 'scenes']
  },
  extractor: {
    name: 'extractor',
    title: '角色与场景抽取去重',
    output: ['characters', 'locations']
  },
  storyboardBreaker: {
    name: 'storyboard_breaker',
    title: '剧本拆分镜',
    output: ['shots', 'imagePrompt', 'videoPrompt', 'bgmPrompt', 'soundEffect']
  },
  voiceAssigner: {
    name: 'voice_assigner',
    title: '角色配音分配',
    output: ['voiceStyle', 'ttsTasks']
  },
  gridPromptGenerator: {
    name: 'grid_prompt_generator',
    title: '宫格图/角色/场景提示词生成',
    output: ['gridPrompts', 'referenceFrames']
  }
}

export const HUOBAO_SHOT_FIELDS = [
  'title', 'shotType', 'angle', 'movement', 'location', 'time', 'action', 'dialogue',
  'description', 'result', 'atmosphere', 'imagePrompt', 'videoPrompt', 'bgmPrompt',
  'soundEffect', 'duration', 'characterIds', 'sceneId'
]

export function createHuobaoDramaProjectSeed(idea = '短剧项目', settings = {}) {
  const now = Date.now()
  const charCount = Math.min(12, Math.max(1, Number(settings.characterCount) || 2))
  const sceneCount = Math.min(12, Math.max(1, Number(settings.sceneCount) || 3))
  const epCount = Math.min(24, Math.max(1, Number(settings.episodeCount) || 1))

  const roleLabels = ['主角', '配角', '配角', '群众', '群众']
  const characters = Array.from({ length: charCount }, (_, i) => ({
    id: `char_${now}_${i}`,
    name: i === 0 ? '女主' : i === 1 ? '男主' : `角色${i + 1}`,
    role: roleLabels[Math.min(i, roleLabels.length - 1)],
    appearance: '',
    personality: '',
    voiceStyle: '',
    seedValue: null,
    referenceImages: [],
    imageUrl: '',
    description: ''
  }))

  const timeLabels = ['清晨', '白天', '傍晚', '夜晚', '深夜']
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({
    id: `scene_${now}_${i}`,
    name: i === 0 ? '主场景' : `场景${i + 1}`,
    location: i === 0 ? '主场景' : `场景${i + 1}`,
    time: timeLabels[i % timeLabels.length],
    prompt: '',
    imageUrl: '',
    status: 'idle'
  }))

  const episodes = Array.from({ length: epCount }, (_, i) => ({
    id: `ep_${now}_${i}`,
    index: i + 1,
    title: `第${i + 1}集`,
    summary: '',
    status: 'draft'
  }))

  return {
    premise: idea,
    genre: '',
    style: settings.style || 'realistic',
    characters,
    scenes,
    episodes,
    shots: [],
    dramaGenerationSettings: {
      episodeCount: epCount,
      shotCount: Math.min(24, Math.max(3, Number(settings.shotCount) || 8)),
      characterCount: charCount,
      sceneCount,
      targetDurationSec: Number(settings.targetDurationSec) || 60,
      aspectRatio: settings.aspectRatio || '9:16',
      style: settings.style || '短剧',
      tone: settings.tone || '',
      firstFrameModel: settings.firstFrameModel || '',
      videoModel: settings.videoModel || ''
    }
  }
}

export function createHuobaoStoryboards(idea = '短剧项目', count = 8, characters = [], scenes = []) {
  const safeCount = Math.min(24, Math.max(1, Number(count || 8)))
  const now = Date.now()
  const shotTypes = ['远景', '全景', '中景', '近景', '特写']
  const movements = ['固定镜头', '缓慢推进', '跟拍', '横移', '轻微摇镜']
  const angles = ['平视', '轻微俯视', '仰视', '俯视']
  return Array.from({ length: safeCount }, (_, index) => {
    const n = index + 1
    const shotType = shotTypes[index % shotTypes.length]
    const movement = movements[index % movements.length]
    const angle = angles[index % angles.length]
    const scene = scenes[index % Math.max(1, scenes.length)]
    const char1 = characters[0]
    const char2 = characters[Math.min(1, characters.length - 1)]
    const title = `镜头 ${n}`
    const description = `${idea}。${title}，${shotType}，${angle}，${movement}，明确人物、场景、情绪和叙事信息。`
    const imagePrompt = `${description} 电影感短剧首帧，主体清晰，构图明确，角色一致，场景连续，光影统一，高质量剧照。`
    const videoPrompt = `${idea}，${shotType}，${movement}，角色进入情绪状态，动作连贯，画面稳定。`
    return {
      id: `shot_${now}_${n}`,
      index: n,
      storyboardNumber: n,
      title,
      shotType,
      angle,
      movement,
      sceneId: scene?.id || '',
      location: scene?.name || scene?.location || '主场景',
      time: scene?.time || '夜晚',
      characterIds: characters.length > 0
        ? (index % 2 === 0 && char1 ? [char1.id] : char2 ? [char2.id] : []).filter(Boolean)
        : [],
      action: '单一动作推进剧情',
      dialogue: '',
      description,
      result: '形成清晰的视觉结果并推动下一镜头',
      atmosphere: '电影感、情绪明确、光影统一',
      imagePrompt,
      prompt: imagePrompt,
      firstFramePrompt: imagePrompt,
      videoPrompt,
      bgmPrompt: '悬念感、节奏克制、适合短剧推进',
      soundEffect: '环境声、脚步声、轻微转场音效',
      duration: 9,
      status: 'idle',
      firstFrameStatus: 'idle',
      videoStatus: 'idle',
      nodeIds: {},
      firstFrameNodeId: '',
      videoNodeId: '',
      assetIds: [],
      createdAt: now,
      updatedAt: now
    }
  })
}

export function normalizeHuobaoShotToYufengShot(shot) {
  return {
    ...shot,
    prompt: shot.prompt || shot.imagePrompt || shot.description || '',
    imagePrompt: shot.imagePrompt || shot.prompt || shot.description || '',
    videoPrompt: shot.videoPrompt || shot.description || '',
    status: shot.status || 'pending'
  }
}

export function updateShotStatus(project, shotId, status) {
  if (!project?.drama?.shots) return
  const shot = project.drama.shots.find(s => s.id === shotId)
  if (shot) shot.status = status
}

export function getShotNodeIds(project, shotId) {
  const shot = project?.drama?.shots?.find(s => s.id === shotId)
  return shot?.nodeIds || {}
}

// --- CRUD helpers ---

function uid(prefix = 'id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

export function addShot(project, shotData = {}) {
  if (!project?.drama?.shots) return null
  const shots = project.drama.shots
  const index = shots.length + 1
  const shot = {
    id: uid('shot'),
    index,
    storyboardNumber: index,
    title: `镜头 ${index}`,
    shotType: '', angle: '', movement: '',
    sceneId: '', location: '', time: '',
    characterIds: [],
    action: '', dialogue: '', description: '',
    result: '', atmosphere: '',
    imagePrompt: '', prompt: '', firstFramePrompt: '', videoPrompt: '',
    bgmPrompt: '', soundEffect: '',
    duration: 5,
    status: 'idle', firstFrameStatus: 'idle', videoStatus: 'idle',
    nodeIds: {}, firstFrameNodeId: '', videoNodeId: '', assetIds: [],
    episodeId: '',
    ...shotData,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  shots.push(shot)
  return shot
}

export function removeShot(project, shotId) {
  if (!project?.drama?.shots) return false
  const idx = project.drama.shots.findIndex(s => s.id === shotId)
  if (idx === -1) return false
  project.drama.shots.splice(idx, 1)
  project.drama.shots.forEach((s, i) => { s.index = i + 1; s.storyboardNumber = i + 1 })
  return true
}

export function duplicateShot(project, shotId) {
  if (!project?.drama?.shots) return null
  const source = project.drama.shots.find(s => s.id === shotId)
  if (!source) return null
  const { id, index, storyboardNumber, createdAt, nodeIds, firstFrameNodeId, videoNodeId, assetIds, firstFrameStatus, videoStatus, status, ...rest } = source
  return addShot(project, { ...rest, status: 'idle', firstFrameStatus: 'idle', videoStatus: 'idle', nodeIds: {}, assetIds: [] })
}

export function addCharacter(project, charData = {}) {
  if (!project?.drama?.characters) return null
  const char = {
    id: uid('char'),
    name: '', role: '配角',
    appearance: '', personality: '', voiceStyle: '',
    seedValue: null, referenceImages: [], imageUrl: '', description: '',
    ...charData
  }
  project.drama.characters.push(char)
  return char
}

export function removeCharacter(project, charId) {
  if (!project?.drama?.characters) return false
  const idx = project.drama.characters.findIndex(c => c.id === charId)
  if (idx === -1) return false
  project.drama.characters.splice(idx, 1)
  return true
}

export function updateCharacter(project, charId, patch = {}) {
  if (!project?.drama?.characters) return false
  const char = project.drama.characters.find(c => c.id === charId)
  if (!char) return false
  Object.assign(char, patch, { updatedAt: Date.now() })
  return true
}

export function addScene(project, sceneData = {}) {
  if (!project?.drama?.scenes) return null
  const scene = {
    id: uid('scene'),
    name: '', location: '', time: '白天',
    prompt: '', imageUrl: '', status: 'idle',
    ...sceneData
  }
  project.drama.scenes.push(scene)
  return scene
}

export function removeScene(project, sceneId) {
  if (!project?.drama?.scenes) return false
  const idx = project.drama.scenes.findIndex(s => s.id === sceneId)
  if (idx === -1) return false
  project.drama.scenes.splice(idx, 1)
  return true
}

export function updateScene(project, sceneId, patch = {}) {
  if (!project?.drama?.scenes) return false
  const scene = project.drama.scenes.find(s => s.id === sceneId)
  if (!scene) return false
  Object.assign(scene, patch, { updatedAt: Date.now() })
  return true
}

export function addEpisode(project, epData = {}) {
  if (!project?.drama?.episodes) return null
  const idx = project.drama.episodes.length + 1
  const ep = {
    id: uid('ep'),
    index: idx, title: `第${idx}集`, summary: '', status: 'draft',
    ...epData, index: idx
  }
  project.drama.episodes.push(ep)
  return ep
}

export function removeEpisode(project, epId) {
  if (!project?.drama?.episodes) return false
  const idx = project.drama.episodes.findIndex(e => e.id === epId)
  if (idx === -1) return false
  project.drama.episodes.splice(idx, 1)
  project.drama.episodes.forEach((e, i) => { e.index = i + 1 })
  return true
}

export function updateEpisode(project, epId, patch = {}) {
  if (!project?.drama?.episodes) return false
  const ep = project.drama.episodes.find(e => e.id === epId)
  if (!ep) return false
  Object.assign(ep, patch, { updatedAt: Date.now() })
  return true
}
