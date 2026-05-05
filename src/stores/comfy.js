import { ref, computed } from 'vue'
import {
  comfyGetStatus, comfySetConfig, comfyInstall, comfyStart,
  comfyStop, comfyTestConnection, comfyGetLogs, comfyOpenFolder,
  comfyInstallDependencies, comfyScanModels
} from '@/integrations/comfy/client'

const state = ref(null)
const loading = ref(false)
const logs = ref([])
const modelScan = ref(null)

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

export async function doInstallDependencies() {
  if (!isDesktop.value) return
  return await comfyInstallDependencies()
}

export async function scanModels() {
  if (!isDesktop.value) return null
  const result = await comfyScanModels()
  if (result?.ok) modelScan.value = result
  return result
}

export async function doStart() {
  if (!isDesktop.value) return
  await comfyStart()
}

export async function doStop() {
  if (!isDesktop.value) return
  await comfyStop()
}

export async function doTestConnection(baseUrl) {
  if (!isDesktop.value) return
  return await comfyTestConnection(baseUrl)
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
    logs,
    modelScan,
    isDesktop,
    refreshStatus,
    updateConfig,
    doInstall,
    doInstallDependencies,
    scanModels,
    doStart,
    doStop,
    doTestConnection,
    refreshLogs,
    openFolder
  }
}
