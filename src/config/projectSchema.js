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
      characters: [],
      locations: [],
      episodes: [],
      scenes: [],
      shots: []
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
    drama: { ...base.drama, ...(project.drama || {}) },
    workflows: { ...base.workflows, ...(project.workflows || {}) },
    engines: { ...base.engines, ...(project.engines || {}) }
  }
}
