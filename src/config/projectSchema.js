export const PROJECT_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  DRAMA: 'drama',
  LONG_VIDEO: 'long-video',
  MIXED: 'mixed'
}

export function createEmptyProjectStructure(type = PROJECT_TYPES.MIXED) {
  return {
    type,
    assets: {
      images: [],
      videos: [],
      audio: [],
      references: []
    },
    aiWorkspace: {
      chats: [],
      plans: [],
      tasks: [],
      revisions: []
    },
    drama: {
      premise: '',
      genre: '',
      style: 'realistic',
      characters: [],
      scenes: [],
      episodes: [],
      shots: [],
      dramaGenerationSettings: {
        episodeCount: 1,
        shotCount: 8,
        characterCount: 2,
        sceneCount: 3,
        targetDurationSec: 60,
        aspectRatio: '9:16',
        style: '短剧',
        tone: '',
        firstFrameModel: '',
        videoModel: ''
      }
    },
    workflows: {
      yufeng: [],
      comfy: [],
      drama: [],
      agent: []
    },
    engines: {
      api: {},
      comfy: {}
    }
  }
}

export function normalizeProjectStructure(project = {}) {
  const base = createEmptyProjectStructure(project.type || PROJECT_TYPES.MIXED)
  return {
    ...project,
    type: project.type || base.type,
    assets: { ...base.assets, ...(project.assets || {}) },
    aiWorkspace: { ...base.aiWorkspace, ...(project.aiWorkspace || {}) },
    drama: {
      ...base.drama,
      ...(project.drama || {}),
      scenes: Array.isArray(project.drama?.scenes) && project.drama.scenes.length > 0
        ? project.drama.scenes
        : Array.isArray(project.drama?.locations) ? project.drama.locations : [],
      dramaGenerationSettings: { ...base.drama.dramaGenerationSettings, ...(project.drama?.dramaGenerationSettings || {}) }
    },
    workflows: { ...base.workflows, ...(project.workflows || {}) },
    engines: { ...base.engines, ...(project.engines || {}) }
  }
}
