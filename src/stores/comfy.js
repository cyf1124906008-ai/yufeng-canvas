import { ref, computed } from 'vue'
import {
  comfyGetStatus, comfySetConfig, comfyInstall, comfyStart,
  comfyStop, comfyTestConnection, comfyGetLogs, comfyOpenFolder
} from '@/integrations/comfy/client'

const state = ref(null)
const loading = ref(false)
const connectionResult = ref(null)
const logs = ref([])

const isDesktop = computed(() => !!window.desktopApp?.comfy)

function isState(obj) {
  return obj && typeof obj === 'object' && 'installed' in obj
}

export async function refreshStatus() {
  if (!isDesktop.value) return
  loading.value = true
  try {
    const s = await comfyGetStatus()
    if (isState(s)) state.value = s
  } finally {
    loading.value = false
  }
}

export async function updateConfig(config) {
  if (!isDesktop.value) return
  const s = await comfySetConfig(config)
  if (isState(s)) state.value = s
}

export async function doInstall() {
  if (!isDesktop.value) return
  loading.value = true
  try {
    const s = await comfyInstall()
    if (isState(s)) state.value = s
  } finally {
    loading.value = false
  }
}

export async function doStart() {
  if (!isDesktop.value) return
  return await comfyStart()
}

export async function doStop() {
  if (!isDesktop.value) return
  return await comfyStop()
}

export async function doTestConnection(baseUrl) {
  if (!isDesktop.value) return
  connectionResult.value = null
  const result = await comfyTestConnection(baseUrl)
  connectionResult.value = result
  if (result?.ok) {
    await refreshStatus()
  }
  return result
}

export async function refreshLogs() {
  if (!isDesktop.value) return
  const l = await comfyGetLogs()
  if (Array.isArray(l)) logs.value = l
}

export async function openFolder(key = 'root') {
  if (!isDesktop.value) return
  return await comfyOpenFolder(key)
}

export function useComfyStore() {
  return {
    state,
    loading,
    connectionResult,
    logs,
    isDesktop,
    refreshStatus,
    updateConfig,
    doInstall,
    doStart,
    doStop,
    doTestConnection,
    refreshLogs,
    openFolder
  }
}
