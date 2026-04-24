<template>
  <!-- App Header | 应用头部 -->
  <header class="flex items-center justify-between px-4 md:px-8 py-4 border-b border-[var(--border-color)]">
    <!-- Left slot | 左侧插槽 -->
    <div class="flex items-center gap-2">
      <slot name="left">
        <!-- Default: empty or logo -->
      </slot>
    </div>
    
    <!-- Right section | 右侧区域 -->
    <div class="flex items-center gap-4">
      <!-- Center slot | 中间插槽 -->
      <slot name="center"></slot>

      <button
        @click="handleCheckUpdate"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] hover:text-[var(--accent-color)]"
        title="检查更新"
      >
        <n-icon :size="20"><CloudDownloadOutline /></n-icon>
      </button>
      
      <!-- GitHub link | GitHub 链接 -->
      <a 
        :href="githubUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] hover:text-[var(--accent-color)]"
        title="GitHub"
      >
        <n-icon :size="20"><LogoGithub /></n-icon>
      </a>
      
      <!-- Theme toggle | 主题切换 -->
      <button 
        @click="toggleTheme"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <n-icon :size="20">
          <SunnyOutline v-if="isDark" />
          <MoonOutline v-else />
        </n-icon>
      </button>
      
      <!-- Right slot | 右侧插槽 -->
      <slot name="right"></slot>
    </div>
  </header>
</template>

<script setup>
/**
 * App Header component | 应用头部组件
 * Reusable header with slots for customization
 */
import { NIcon } from 'naive-ui'
import { 
  SunnyOutline, 
  MoonOutline,
  LogoGithub,
  CloudDownloadOutline
} from '@vicons/ionicons5'
import { useDialog } from 'naive-ui'
import { isDark, toggleTheme } from '../stores/theme'
import { getGithubUrl } from '../config/distribution'
import { compareVersions } from '../utils/version'

// Props | 属性
defineProps({
  githubUrl: {
    type: String,
    default: getGithubUrl()
  }
})

const dialog = useDialog()

const handleCheckUpdate = async () => {
  const desktopApp = window.desktopApp
  if (!desktopApp?.checkUpdate) {
    window.$message?.info('网页版请前往 GitHub Release 获取最新版本')
    return
  }

  try {
    const update = await desktopApp.checkUpdate()
    const hasUpdate = compareVersions(update.latestVersion, update.currentVersion) > 0

    if (!hasUpdate) {
      window.$message?.success(`当前已是最新版本 ${update.currentVersion}`)
      return
    }

    dialog.info({
      title: `发现新版本 ${update.latestVersion}`,
      content: `当前版本 ${update.currentVersion}。点击下载会打开 GitHub Release，下载安装包后可覆盖安装，不需要卸载旧版本。`,
      positiveText: '打开下载页',
      negativeText: '稍后',
      onPositiveClick: () => {
        desktopApp.openExternal?.(update.downloadUrl || update.releaseUrl)
      }
    })
  } catch (err) {
    window.$message?.error(err.message || '检查更新失败')
  }
}
</script>
