<template>
  <header class="flex items-center justify-between px-4 md:px-8 py-4 border-b border-[var(--border-color)]">
    <div class="flex items-center gap-2">
      <slot name="left"></slot>
    </div>

    <div class="flex items-center gap-4">
      <slot name="center"></slot>

      <button
        @click="handleUpdateClick"
        :disabled="isBusy"
        class="relative p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] hover:text-[var(--accent-color)] disabled:opacity-70"
        :class="{ 'text-[var(--accent-color)]': hasPendingUpdate }"
        :title="updateTitle"
      >
        <n-spin v-if="isBusy" :size="18" />
        <n-icon v-else :size="20"><CloudDownloadOutline /></n-icon>
        <span v-if="hasPendingUpdate" class="update-dot"></span>
      </button>

      <a
        :href="githubUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] hover:text-[var(--accent-color)]"
        title="GitHub"
      >
        <n-icon :size="20"><LogoGithub /></n-icon>
      </a>

      <button
        @click="toggleTheme"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
        title="切换主题"
      >
        <n-icon :size="20">
          <SunnyOutline v-if="isDark" />
          <MoonOutline v-else />
        </n-icon>
      </button>

      <slot name="right"></slot>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { NIcon, NSpin, useDialog } from 'naive-ui'
import {
  SunnyOutline,
  MoonOutline,
  LogoGithub,
  CloudDownloadOutline
} from '@vicons/ionicons5'
import { isDark, toggleTheme } from '../stores/theme'
import { getGithubUrl } from '../config/distribution'

defineProps({
  githubUrl: {
    type: String,
    default: getGithubUrl()
  }
})

const dialog = useDialog()
const updateStatus = ref({ status: 'idle' })
const userInitiatedCheck = ref(false)
const downloadedPromptedVersion = ref('')
let lastProgressToastAt = 0
let stopUpdateListener = null

const isBusy = computed(() =>
  updateStatus.value.status === 'checking' ||
  updateStatus.value.status === 'downloading'
)

const hasPendingUpdate = computed(() =>
  updateStatus.value.status === 'available' ||
  updateStatus.value.status === 'downloaded'
)

const updateTitle = computed(() => {
  const status = updateStatus.value.status
  const percent = updateStatus.value.progress?.percent

  if (status === 'checking') return '正在检查更新'
  if (status === 'downloading') return `正在下载更新${percent ? ` ${percent}%` : ''}`
  if (status === 'available') return '发现新版本，点击下载'
  if (status === 'downloaded') return '更新已下载，点击重启安装'
  if (status === 'error') return '更新失败，点击重试'
  return '检查更新'
})

const releaseUrl = computed(() =>
  updateStatus.value.releaseUrl || `${getGithubUrl().replace(/\/$/, '')}/releases`
)

const handleUpdateStatus = (status) => {
  updateStatus.value = status || { status: 'idle' }

  if (status?.status === 'downloading') {
    const percent = status.progress?.percent
    const now = Date.now()
    if (percent && (userInitiatedCheck.value || status.initiatedBy === 'manual') && now - lastProgressToastAt > 5000) {
      lastProgressToastAt = now
      window.$message?.loading(`正在下载更新 ${percent}%`, { duration: 1200 })
    }
    return
  }

  if (status?.status === 'available') {
    if (status.silent && status.initiatedBy === 'auto') {
      return
    }
    showAvailableDialog(status)
    return
  }

  if (status?.status === 'downloaded') {
    showDownloadedDialog(status)
    return
  }

  if (status?.status === 'not-available' && userInitiatedCheck.value) {
    dialog.success({
      title: '已经是最新版本',
      content: `当前版本 ${status.currentVersion || '未知'}，无需更新。`,
      positiveText: '知道了'
    })
    userInitiatedCheck.value = false
    return
  }

  if (status?.status === 'error' && userInitiatedCheck.value) {
    dialog.warning({
      title: '更新失败',
      content: `${status.error || '网络请求失败'}。如果一直失败，可以打开 GitHub Release 手动下载。`,
      positiveText: '打开 Release',
      negativeText: '取消',
      onPositiveClick: () => window.desktopApp?.openExternal?.(releaseUrl.value)
    })
    userInitiatedCheck.value = false
  }
}

const showAvailableDialog = (status) => {
  userInitiatedCheck.value = false

  if (status.manual) {
    dialog.info({
      title: `发现新版本 ${status.latestVersion}`,
      content: '当前运行环境只能打开下载页。安装 0.1.17 或更新版本后，后续版本可在客户端内直接下载并重启安装。',
      positiveText: '打开下载页',
      negativeText: '稍后',
      onPositiveClick: () => window.desktopApp?.openExternal?.(status.downloadUrl || releaseUrl.value)
    })
    return
  }

  dialog.info({
    title: `发现新版本 ${status.latestVersion}`,
    content: `当前版本 ${status.currentVersion}。客户端会在后台下载更新，下载完成后提示重启安装。`,
    positiveText: '后台下载',
    negativeText: '稍后',
    onPositiveClick: () => downloadUpdate()
  })
}

const showDownloadedDialog = (status) => {
  userInitiatedCheck.value = false
  const version = status.latestVersion || 'unknown'
  if (downloadedPromptedVersion.value === version) return
  downloadedPromptedVersion.value = version

  dialog.success({
    title: '更新已下载完成',
    content: `新版本 ${status.latestVersion || ''} 已准备好。点击重启安装后，应用会自动关闭并完成更新；如果选择稍后，退出应用时也会自动安装。`,
    positiveText: '重启安装',
    negativeText: '稍后',
    onPositiveClick: () => installUpdate()
  })
}

const checkUpdate = async () => {
  const desktopApp = window.desktopApp
  if (!desktopApp?.checkUpdate) {
    dialog.info({
      title: '当前环境不支持客户端更新',
      content: '请打开 GitHub Release 下载最新版安装包。',
      positiveText: '打开 Release',
      negativeText: '取消',
      onPositiveClick: () => window.open(releaseUrl.value, '_blank')
    })
    return
  }

  userInitiatedCheck.value = true
  updateStatus.value = { ...updateStatus.value, status: 'checking' }
  window.$message?.loading('正在检查更新...', { duration: 1200 })

  try {
    const status = await desktopApp.checkUpdate()
    if (status?.manual) handleUpdateStatus(status)
  } catch (err) {
    handleUpdateStatus({
      status: 'error',
      error: err.message || '检查更新失败',
      currentVersion: updateStatus.value.currentVersion
    })
  }
}

const downloadUpdate = async () => {
  const desktopApp = window.desktopApp
  if (!desktopApp?.downloadUpdate) {
    window.desktopApp?.openExternal?.(updateStatus.value.downloadUrl || releaseUrl.value)
    return
  }

  updateStatus.value = { ...updateStatus.value, status: 'downloading' }
  window.$message?.loading('开始下载更新...', { duration: 1200 })

  try {
    const status = await desktopApp.downloadUpdate()
    if (status?.manual) handleUpdateStatus(status)
  } catch (err) {
    handleUpdateStatus({
      status: 'error',
      error: err.message || '下载更新失败',
      currentVersion: updateStatus.value.currentVersion
    })
  }
}

const installUpdate = async () => {
  try {
    await window.desktopApp?.installUpdate?.()
  } catch (err) {
    dialog.warning({
      title: '安装更新失败',
      content: err.message || '请稍后重试，或从 GitHub Release 手动下载安装。',
      positiveText: '知道了'
    })
  }
}

const handleUpdateClick = () => {
  if (updateStatus.value.status === 'available') {
    downloadUpdate()
    return
  }

  if (updateStatus.value.status === 'downloaded') {
    installUpdate()
    return
  }

  checkUpdate()
}

onMounted(async () => {
  const desktopApp = window.desktopApp
  stopUpdateListener = desktopApp?.onUpdateStatus?.(handleUpdateStatus) || null

  try {
    const status = await desktopApp?.getUpdateStatus?.()
    if (status?.status) {
      updateStatus.value = status
      if (status.status === 'downloaded') handleUpdateStatus(status)
    }
  } catch {
    // Ignore status bootstrap failures. The button can still retry manually.
  }
})

onUnmounted(() => {
  stopUpdateListener?.()
})
</script>

<style scoped>
.update-dot {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #55f5b6;
  box-shadow: 0 0 0 3px rgba(85, 245, 182, 0.18);
}
</style>
