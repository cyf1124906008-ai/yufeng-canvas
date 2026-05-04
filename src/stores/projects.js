/**
 * Projects store | 项目状态管理
 * Manages projects with localStorage persistence
 */
import { ref, computed, watch } from 'vue'
import { PROJECT_TYPES, createEmptyProjectStructure, normalizeProjectStructure } from '../config/projectSchema'

// Storage key | 存储键
const STORAGE_KEY = 'ai-canvas-projects'
const TRASH_STORAGE_KEY = 'ai-canvas-deleted-projects'
const TRASH_RETENTION_DAYS = 30
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
const RUNTIME_NODE_FIELDS = ['loading', 'progress', 'attempt', 'isPolling']
const MEDIA_URL_FIELDS = [
  'thumbnail',
  'cover',
  'coverUrl',
  'preview',
  'previewUrl',
  'imageUrl',
  'url',
  'output',
  'result'
]

// Generate unique ID | 生成唯一ID
const generateId = () => `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Projects list | 项目列表
export const projects = ref([])

// Deleted projects list | 最近删除项目列表
export const deletedProjects = ref([])

// Current project ID | 当前项目ID
export const currentProjectId = ref(null)

// Current project | 当前项目
export const currentProject = computed(() => {
  return projects.value.find(p => p.id === currentProjectId.value) || null
})

const reviveProjectDates = (project) => ({
  ...normalizeProjectStructure(project),
  createdAt: project?.createdAt ? new Date(project.createdAt) : new Date(),
  updatedAt: project?.updatedAt ? new Date(project.updatedAt) : new Date(),
  deletedAt: project?.deletedAt ? new Date(project.deletedAt) : undefined
})

const getTrashExpiryTime = (project) => {
  const deletedAt = new Date(project?.deletedAt || 0).getTime()
  return deletedAt + TRASH_RETENTION_MS
}

export const getTrashRemainingDays = (project) => {
  const remainingMs = getTrashExpiryTime(project) - Date.now()
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
}

const isUsableMediaUrl = (value) => {
  if (!value || typeof value !== 'string') return false
  const url = value.trim()
  if (!url) return false

  return /^(https?:|data:image\/|data:video\/|blob:|file:)/i.test(url)
}

const normalizeMediaUrl = (value) => {
  if (!value) return ''

  if (typeof value === 'string') {
    return isUsableMediaUrl(value) ? value.trim() : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = normalizeMediaUrl(item)
      if (url) return url
    }
    return ''
  }

  if (typeof value === 'object') {
    for (const field of MEDIA_URL_FIELDS) {
      const url = normalizeMediaUrl(value[field])
      if (url) return url
    }

    if (typeof value.b64_json === 'string' && value.b64_json.trim()) {
      return `data:image/png;base64,${value.b64_json.trim()}`
    }
  }

  return ''
}

const getNodeTimestamp = (node) => {
  const data = node?.data || {}
  return Number(data.finishedAt || data.updatedAt || data.createdAt || 0)
}

const getNodeMediaUrl = (node) => {
  const data = node?.data || {}
  for (const field of MEDIA_URL_FIELDS) {
    const url = normalizeMediaUrl(data[field])
    if (url) return url
  }

  return normalizeMediaUrl(data.images || data.outputs || data.results)
}

export const deriveProjectThumbnail = (project, { preferExisting = true } = {}) => {
  const explicitThumbnail = normalizeMediaUrl(project?.thumbnail)
  if (preferExisting && explicitThumbnail) return explicitThumbnail

  const nodes = project?.canvasData?.nodes || []
  const mediaNodes = [...nodes]
    .map(node => ({ url: getNodeMediaUrl(node), time: getNodeTimestamp(node) }))
    .filter(item => item.url)
    .sort((a, b) => b.time - a.time)

  return mediaNodes[0]?.url || ''
}

/**
 * Load projects from localStorage | 从 localStorage 加载项目
 */
export const loadProjects = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) {
      projects.value = []
      return false
    }

    if (!stored) {
      projects.value = []
      return true
    }

    const parsed = JSON.parse(stored)
    let recoveredThumbnail = false
    projects.value = Array.isArray(parsed) ? parsed.map(p => {
      const project = reviveProjectDates(p)
      const thumbnail = deriveProjectThumbnail(project)
      if (!project.thumbnail && thumbnail) {
        project.thumbnail = thumbnail
        recoveredThumbnail = true
      }
      return project
    }) : []

    if (recoveredThumbnail) {
      saveProjects()
    }

    return true
  } catch (err) {
    console.error('Failed to load projects:', err)
    projects.value = []
    return true
  }
}

export const saveDeletedProjects = () => {
  const cleanedDeletedProjects = deletedProjects.value.map(project => cleanProjectForStorage({
    ...project,
    deletedAt: project.deletedAt || new Date()
  }))

  try {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(cleanedDeletedProjects))
  } catch (err) {
    console.error('Failed to save deleted projects:', err)
    window.$message?.warning('回收站保存失败，存储空间可能不足')
  }
}

export const purgeExpiredDeletedProjects = () => {
  const beforeCount = deletedProjects.value.length
  const now = Date.now()
  deletedProjects.value = deletedProjects.value.filter(project => getTrashExpiryTime(project) > now)

  if (deletedProjects.value.length !== beforeCount) {
    saveDeletedProjects()
  }
}

export const loadDeletedProjects = () => {
  try {
    const stored = localStorage.getItem(TRASH_STORAGE_KEY)
    if (!stored) {
      deletedProjects.value = []
      return
    }

    const parsed = JSON.parse(stored)
    deletedProjects.value = Array.isArray(parsed)
      ? parsed.map(reviveProjectDates).filter(project => project.deletedAt)
      : []
    purgeExpiredDeletedProjects()
  } catch (err) {
    console.error('Failed to load deleted projects:', err)
    deletedProjects.value = []
  }
}

/**
 * Clean node data for storage | 清理节点数据用于存储
 * Keep node url fields intact so generated images do not disappear after reload.
 * 大多数图片接口会返回 data:image 或临时 URL；如果这里把 url 清掉，画布重开后图片节点会变空。
 */
const cleanNodeForStorage = (node) => {
  if (!node.data) return node
  
  const cleanedData = { ...node.data }
  RUNTIME_NODE_FIELDS.forEach(field => {
    delete cleanedData[field]
  })
  
  // Remove base64 data | 移除 base64 数据
  if (cleanedData.base64) {
    delete cleanedData.base64
  }
  
  // Remove mask data | 移除蒙版数据
  if (cleanedData.maskData) {
    delete cleanedData.maskData
  }
  
  return { ...node, data: cleanedData }
}

/**
 * Clean project for storage | 清理项目用于存储
 */
const cleanProjectForStorage = (project) => {
  return {
    ...project,
    canvasData: project.canvasData ? {
      ...project.canvasData,
      nodes: project.canvasData.nodes?.map(cleanNodeForStorage) || []
    } : project.canvasData,
    // Remove base64 thumbnails | 移除 base64 缩略图
    thumbnail: project.thumbnail?.startsWith?.('data:') ? '' : project.thumbnail
  }
}

/**
 * Save projects to localStorage | 保存项目到 localStorage
 * Handles QuotaExceededError by compressing data | 通过压缩数据处理配额超限错误
 */
export const saveProjects = () => {
  // Always clean data before saving | 保存前始终清理数据
  const cleanedProjects = projects.value.map(cleanProjectForStorage)
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedProjects))
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, attempting aggressive cleanup...')
      
      // Remove thumbnails and limit old projects | 移除缩略图并限制旧项目
      const minimalProjects = cleanedProjects.map((project, index) => ({
        ...project,
        thumbnail: '', // Remove all thumbnails | 移除所有缩略图
        // Keep only essential canvas data for older projects | 旧项目只保留基本画布数据
        canvasData: index > 10 ? { nodes: [], edges: [], viewport: project.canvasData?.viewport } : project.canvasData
      }))
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalProjects))
        console.log('Saved with aggressive cleanup')
        window.$message?.warning('存储空间不足，已自动清理部分数据')
      } catch (retryErr) {
        console.error('Still failed after aggressive cleanup:', retryErr)
        // Last resort: only keep first 5 projects | 最后手段：只保留前5个项目
        try {
          const essentialProjects = minimalProjects.slice(0, 5)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(essentialProjects))
          projects.value = projects.value.slice(0, 5)
          window.$message?.warning('存储空间严重不足，已保留最近 5 个项目')
        } catch (finalErr) {
          console.error('Cannot save even minimal data:', finalErr)
          window.$message?.error('存储失败，请清理浏览器存储空间')
        }
      }
    } else {
      console.error('Failed to save projects:', err)
    }
  }
}

/**
 * Create a new project | 创建新项目
 * @param {string} name - Project name | 项目名称
 * @returns {string} - New project ID | 新项目ID
 */
export const createProject = (name = '未命名项目', type = PROJECT_TYPES.MIXED) => {
  const id = generateId()
  const now = new Date()
  
  const newProject = {
    ...createEmptyProjectStructure(type),
    id,
    name,
    thumbnail: '',
    createdAt: now,
    updatedAt: now,
    // Canvas data | 画布数据
    canvasData: {
      nodes: [],
      edges: [],
      viewport: { x: 100, y: 50, zoom: 0.8 }
    }
  }
  
  projects.value = [newProject, ...projects.value]
  saveProjects()
  
  return id
}

/**
 * Update project | 更新项目
 * @param {string} id - Project ID | 项目ID
 * @param {object} data - Update data | 更新数据
 */
export const updateProject = (id, data) => {
  const index = projects.value.findIndex(p => p.id === id)
  if (index === -1) return false
  
  projects.value[index] = {
    ...projects.value[index],
    ...data,
    updatedAt: new Date()
  }
  
  // Move to top of list | 移动到列表顶部
  const [updated] = projects.value.splice(index, 1)
  projects.value = [updated, ...projects.value]
  
  saveProjects()
  return true
}

/**
 * Update project canvas data | 更新项目画布数据
 * @param {string} id - Project ID | 项目ID
 * @param {object} canvasData - Canvas data (nodes, edges, viewport) | 画布数据
 */
export const updateProjectCanvas = (id, canvasData) => {
  const project = projects.value.find(p => p.id === id)
  if (!project) return false
  
  project.canvasData = {
    ...project.canvasData,
    ...canvasData
  }
  project.updatedAt = new Date()
  
  // Auto-update thumbnail from the latest generated media node.
  if (canvasData.nodes) {
    project.thumbnail = deriveProjectThumbnail(project, { preferExisting: false })
  }
  
  saveProjects()
  return true
}

/**
 * Get project canvas data | 获取项目画布数据
 * @param {string} id - Project ID | 项目ID
 * @returns {object|null} - Canvas data or null | 画布数据或空
 */
export const getProjectCanvas = (id) => {
  const project = projects.value.find(p => p.id === id)
  return project?.canvasData || null
}

/**
 * Delete project | 删除项目
 * @param {string} id - Project ID | 项目ID
 */
export const deleteProject = (id) => {
  const index = projects.value.findIndex(p => p.id === id)
  if (index === -1) return false

  const [project] = projects.value.splice(index, 1)
  const deletedProject = {
    ...project,
    deletedAt: new Date()
  }

  deletedProjects.value = [
    deletedProject,
    ...deletedProjects.value.filter(item => item.id !== id)
  ]

  if (currentProjectId.value === id) {
    currentProjectId.value = null
  }

  saveProjects()
  saveDeletedProjects()
  return true
}

export const restoreProject = (id) => {
  const index = deletedProjects.value.findIndex(p => p.id === id)
  if (index === -1) return false

  const [project] = deletedProjects.value.splice(index, 1)
  const restoredProject = {
    ...project,
    deletedAt: undefined,
    updatedAt: new Date()
  }
  delete restoredProject.deletedAt

  projects.value = [
    restoredProject,
    ...projects.value.filter(item => item.id !== id)
  ]

  saveProjects()
  saveDeletedProjects()
  return true
}

export const permanentlyDeleteProject = (id) => {
  const beforeCount = deletedProjects.value.length
  deletedProjects.value = deletedProjects.value.filter(p => p.id !== id)
  saveDeletedProjects()
  return deletedProjects.value.length !== beforeCount
}

export const emptyDeletedProjects = () => {
  if (!deletedProjects.value.length) return false
  deletedProjects.value = []
  saveDeletedProjects()
  return true
}

/**
 * Duplicate project | 复制项目
 * @param {string} id - Source project ID | 源项目ID
 * @returns {string|null} - New project ID or null | 新项目ID或空
 */
export const duplicateProject = (id) => {
  const source = projects.value.find(p => p.id === id)
  if (!source) return null
  
  const newId = generateId()
  const now = new Date()
  
  const newProject = {
    ...JSON.parse(JSON.stringify(source)), // Deep clone | 深拷贝
    id: newId,
    name: `${source.name} (副本)`,
    createdAt: now,
    updatedAt: now
  }
  
  projects.value = [newProject, ...projects.value]
  saveProjects()
  
  return newId
}

/**
 * Rename project | 重命名项目
 * @param {string} id - Project ID | 项目ID
 * @param {string} name - New name | 新名称
 */
export const renameProject = (id, name) => {
  return updateProject(id, { name })
}

/**
 * Update project thumbnail | 更新项目缩略图
 * @param {string} id - Project ID | 项目ID
 * @param {string} thumbnail - Thumbnail URL (base64 or URL) | 缩略图URL
 */
export const updateProjectThumbnail = (id, thumbnail) => {
  return updateProject(id, { thumbnail })
}

/**
 * Get sorted projects | 获取排序后的项目列表
 * @param {string} sortBy - Sort field (updatedAt, createdAt, name) | 排序字段
 * @param {string} order - Sort order (asc, desc) | 排序顺序
 */
export const getSortedProjects = (sortBy = 'updatedAt', order = 'desc') => {
  return computed(() => {
    const sorted = [...projects.value]
    sorted.sort((a, b) => {
      let valueA = a[sortBy]
      let valueB = b[sortBy]
      
      if (valueA instanceof Date) {
        valueA = valueA.getTime()
        valueB = valueB.getTime()
      }
      
      if (typeof valueA === 'string') {
        valueA = valueA.toLowerCase()
        valueB = valueB.toLowerCase()
      }
      
      if (order === 'asc') {
        return valueA > valueB ? 1 : -1
      } else {
        return valueA < valueB ? 1 : -1
      }
    })
    return sorted
  })
}

/**
 * Initialize projects store | 初始化项目存储
 */
export const initProjectsStore = () => {
  const hasStoredProjects = loadProjects()
  loadDeletedProjects()
  
  // Create sample project only on first launch | 仅首次启动时创建示例项目
  if (!hasStoredProjects && projects.value.length === 0) {
    const id = createProject('示例项目')
    const project = projects.value.find(p => p.id === id)
    if (project) {
      project.canvasData = {
        nodes: [
          {
            id: 'node_0',
            type: 'text',
            position: { x: 150, y: 150 },
            data: {
              content: '一只金毛寻回犬在草地上奔跑，摇着尾巴，脸上带着快乐的表情。它的毛发在阳光下闪耀，眼神充满了对自由的渴望，全身散发着阳光、友善的气息。',
              label: '文本输入'
            }
          },
          {
            id: 'node_1',
            type: 'imageConfig',
            position: { x: 500, y: 150 },
            data: {
              prompt: '',
              size: '512x512',
              label: '文生图'
            }
          }
        ],
        edges: [
          {
            id: 'edge_node_0_node_1',
            source: 'node_0',
            target: 'node_1',
            sourceHandle: 'right',
            targetHandle: 'left'
          }
        ],
        viewport: { x: 100, y: 50, zoom: 0.8 }
      }
      saveProjects()
    }
  }
}

// Export for debugging | 导出用于调试
if (typeof window !== 'undefined') {
  window.__aiCanvasProjects = {
    projects,
    loadProjects,
    saveProjects,
    createProject,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    emptyDeletedProjects,
    deletedProjects
  }
}
