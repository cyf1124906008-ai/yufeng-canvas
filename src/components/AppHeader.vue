<template>
  <header class="flex items-center justify-between px-4 md:px-8 py-4 border-b border-[var(--border-color)]">
    <div class="flex items-center gap-2">
      <slot name="left"></slot>
    </div>

    <div class="flex items-center gap-4">
      <slot name="center"></slot>

      <div class="update-widget">
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

        <Transition name="update-panel">
          <div v-if="showUpdateProgress" class="update-progress-card">
            <div class="update-progress-head">
              <span>{{ updateProgressTitle }}</span>
              <b>{{ progressPercent }}%</b>
            </div>
            <div class="update-progress-track">
              <div class="update-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
            </div>
            <div class="update-progress-foot">
              <span>{{ progressSizeText }}</span>
              <span>{{ updateStatus.updateSource || '更新源' }}</span>
            </div>
          </div>
        </Transition>
      </div>

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
        @click="showSupport = true"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] hover:text-[var(--accent-color)]"
        title="联系作者 / 使用支持"
      >
        <n-icon :size="20"><ChatbubbleOutline /></n-icon>
      </button>

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

  <SupportModal v-model:show="showSupport" />
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { NIcon, NSpin, useDialog } from 'naive-ui'
import {
  SunnyOutline,
  MoonOutline,
  LogoGithub,
  CloudDownloadOutline,
  ChatbubbleOutline
} from '@vicons/ionicons5'
import { isDark, toggleTheme } from '../stores/theme'
import { getGithubUrl } from '../config/distribution'
import SupportModal from './SupportModal.vue'

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
const showSupport = ref(false)
let stopUpdateListener = null

const isBusy = computed(() =>
  updateStatus.value.status === 'checking' ||
  updateStatus.value.status === 'downloading'
)

const hasPendingUpdate = computed(() =>
  updateStatus.value.status === 'available' ||
  updateStatus.value.status === 'downloaded'
)

const showUpdateProgress = computed(() =>
  updateStatus.value.status === 'downloading' ||
  updateStatus.value.status === 'downloaded'
)

const progressPercent = computed(() => {
  if (updateStatus.value.status === 'downloaded') return 100
  return Math.max(0, Math.min(100, Math.round(updateStatus.value.progress?.percent || 0)))
})

const updateProgressTitle = computed(() => {
  if (updateStatus.value.status === 'downloaded') return '更新包已准备好'
  return `正在后台下载 ${updateStatus.value.latestVersion ? `v${updateStatus.value.latestVersion}` : '新版本'}`
})

const formatBytes = (bytes = 0) => {
  const value = Number(bytes) || 0
  if (value <= 0) return ''
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const progressSizeText = computed(() => {
  if (updateStatus.value.status === 'downloaded') return '下载完成，等待重启安装'

  const progress = updateStatus.value.progress || {}
  const transferred = formatBytes(progress.transferred)
  const total = formatBytes(progress.total)
  const speed = formatBytes(progress.bytesPerSecond)

  if (transferred && total && speed) return `${transferred} / ${total} · ${speed}/s`
  if (transferred && total) return `${transferred} / ${total}`
  return '正在连接更新源'
})

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
    content: `新版本 ${status.latestVersion || ''} 已准备好。点击后应用会自动关闭并静默安装，不再弹安装向导；如果选择稍后，退出应用时也会自动安装。`,
    positiveText: '重启并安装',
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
.update-widget {
  position: relative;
  display: inline-flex;
  align-items: center;
}

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

.update-progress-card {
  position: absolute;
  right: -8px;
  top: calc(100% + 14px);
  width: 286px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 22px;
  background:
    radial-gradient(circle at 12% 0%, rgba(85, 245, 182, 0.22), transparent 36%),
    radial-gradient(circle at 86% 12%, rgba(56, 189, 248, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(236, 253, 245, 0.68));
  box-shadow: 0 26px 72px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px) saturate(1.35);
  z-index: 200;
}

:global(.dark) .update-progress-card {
  border-color: rgba(203, 255, 239, 0.14);
  background:
    radial-gradient(circle at 12% 0%, rgba(85, 245, 182, 0.14), transparent 36%),
    radial-gradient(circle at 86% 12%, rgba(56, 189, 248, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.92), rgba(7, 34, 36, 0.78));
  box-shadow: 0 28px 76px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.update-progress-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 0 34%, rgba(255, 255, 255, 0.36) 45%, transparent 58%);
  animation: updateShine 4.6s ease-in-out infinite;
}

.update-progress-head,
.update-progress-foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.update-progress-head {
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
}

.update-progress-head b {
  color: var(--accent-color);
  font-size: 16px;
}

.update-progress-track {
  position: relative;
  z-index: 1;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.16);
}

:global(.dark) .update-progress-track {
  background: rgba(255, 255, 255, 0.08);
}

.update-progress-fill {
  height: 100%;
  min-width: 10px;
  border-radius: inherit;
  background:
    linear-gradient(90deg, #55f5b6, #11d8c5 45%, #38bdf8),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.22) 0 8px, transparent 8px 16px);
  box-shadow: 0 0 22px rgba(85, 245, 182, 0.48);
  transition: width 0.28s ease;
}

.update-progress-foot {
  margin-top: 9px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.update-panel-enter-active,
.update-panel-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.update-panel-enter-from,
.update-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@keyframes updateShine {
  0% {
    opacity: 0;
    transform: translateX(-55%);
  }
  42% {
    opacity: 0;
  }
  62% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(70%);
  }
}
</style>
