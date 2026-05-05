import { ref, computed } from 'vue'

const STORAGE_KEY = 'ai-canvas-background-tasks'

const tasks = ref([])

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) tasks.value = JSON.parse(raw)
  } catch {
    tasks.value = []
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.value))
  } catch {
    // quota exceeded — purge completed tasks and retry
    tasks.value = tasks.value.filter((t) => t.status === 'running')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.value))
    } catch { /* give up */ }
  }
}

export function registerTask(task) {
  const entry = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: task.type || 'image',
    nodeId: task.nodeId || '',
    projectId: task.projectId || '',
    status: 'running',
    progress: 0,
    startedAt: Date.now(),
    completedAt: null,
    result: null,
    error: '',
    // Video-specific recovery fields
    taskId: task.taskId || '',
    taskEndpoint: task.taskEndpoint || '',
    videoProtocol: task.videoProtocol || '',
    // Comfy-specific recovery fields
    promptId: task.promptId || '',
    baseUrl: task.baseUrl || '',
    // Image-specific recovery fields
    outputNodeId: task.outputNodeId || ''
  }
  tasks.value.push(entry)
  saveTasks()
  return entry.id
}

export function updateTask(id, patch) {
  const idx = tasks.value.findIndex((t) => t.id === id)
  if (idx === -1) return
  const task = tasks.value[idx]
  Object.assign(task, patch)
  if (patch.status === 'completed' || patch.status === 'failed') {
    task.completedAt = Date.now()
  }
  saveTasks()
}

export function removeTask(id) {
  tasks.value = tasks.value.filter((t) => t.id !== id)
  saveTasks()
}

export function getTaskByNodeId(nodeId) {
  return computed(() => tasks.value.find((t) => t.nodeId === nodeId && t.status === 'running'))
}

export function getTaskById(id) {
  return tasks.value.find((t) => t.id === id) || null
}

export function cleanCompletedTasks(maxAge = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAge
  tasks.value = tasks.value.filter(
    (t) => t.status === 'running' || (t.completedAt && t.completedAt > cutoff)
  )
  saveTasks()
}

export function getRunningTasks() {
  return computed(() => tasks.value.filter((t) => t.status === 'running'))
}

export function initTaskStore() {
  loadTasks()
  cleanCompletedTasks()
}

export function useTaskStore() {
  return {
    tasks,
    registerTask,
    updateTask,
    removeTask,
    getTaskByNodeId,
    getTaskById,
    cleanCompletedTasks,
    getRunningTasks,
    initTaskStore
  }
}
