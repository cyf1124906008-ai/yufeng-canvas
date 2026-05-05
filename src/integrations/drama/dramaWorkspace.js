export const DRAMA_WORKSPACE_SECTIONS = [
  {
    id: 'premise',
    title: '故事设定',
    description: '题材、世界观、核心冲突、目标受众和风格基调。'
  },
  {
    id: 'characters',
    title: '角色库',
    description: '角色人设、外观、服装、性格、关系和一致性参考。'
  },
  {
    id: 'locations',
    title: '场景库',
    description: '主要地点、时代背景、灯光氛围、镜头可复用场景。'
  },
  {
    id: 'episodes',
    title: '分集大纲',
    description: '每集目标、反转、结尾钩子和生成进度。'
  },
  {
    id: 'shots',
    title: '镜头表',
    description: '镜头编号、画面描述、首帧 Prompt、视频 Prompt、状态。'
  },
  {
    id: 'deliverables',
    title: '成片交付',
    description: '首帧、视频片段、配音、字幕、封面、导出清单。'
  }
]

export const DRAMA_PIPELINE_STAGES = [
  { id: 'idea', title: '一句话创意', status: 'ready' },
  { id: 'bible', title: '角色/世界观 Bible', status: 'ready' },
  { id: 'episode', title: '分集大纲', status: 'ready' },
  { id: 'shotlist', title: '镜头表', status: 'ready' },
  { id: 'firstframes', title: '首帧生成', status: 'waiting' },
  { id: 'videos', title: '视频生成', status: 'waiting' },
  { id: 'review', title: '质检与重做', status: 'waiting' },
  { id: 'export', title: '成片导出规划', status: 'waiting' }
]

export const DRAMA_STATUS_LABELS = {
  pending: '未生成',
  firstFrameReady: '首帧完成',
  videoRunning: '视频生成中',
  videoReady: '视频完成',
  redo: '需要重做',
  locked: '已锁定'
}

export function createDramaShotSeed(premise = '短剧项目', count = 8) {
  return Array.from({ length: count }, (_, index) => ({
    id: `shot_seed_${Date.now()}_${index + 1}`,
    index: index + 1,
    title: `镜头 ${index + 1}`,
    description: `${premise} - 第 ${index + 1} 个镜头，明确主体、动作、景别和情绪。`,
    prompt: `${premise}，镜头 ${index + 1}，电影感短剧首帧，主体清晰，构图明确，角色一致，光影统一`,
    videoPrompt: `${premise}，镜头 ${index + 1}，自然镜头运动，动作连贯，画面稳定`,
    duration: 5,
    status: 'pending'
  }))
}

export function summarizeDramaProject(project) {
  const drama = project?.drama || {}
  return {
    premise: drama.premise || '',
    characterCount: Array.isArray(drama.characters) ? drama.characters.length : 0,
    locationCount: Array.isArray(drama.locations) ? drama.locations.length : 0,
    episodeCount: Array.isArray(drama.episodes) ? drama.episodes.length : 0,
    shotCount: Array.isArray(drama.shots) ? drama.shots.length : 0,
    readyShotCount: Array.isArray(drama.shots) ? drama.shots.filter(shot => ['firstFrameReady', 'videoReady', 'locked'].includes(shot.status)).length : 0
  }
}
