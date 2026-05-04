<template>
  <div class="comfy-engine-panel">
    <n-alert v-if="!isDesktop" type="warning" class="mb-4">
      Comfy 引擎管理仅在桌面端可用。请在 Electron 版本中打开此面板。
    </n-alert>

    <template v-else>
      <!-- Status bar -->
      <div class="flex items-center gap-3 mb-4">
        <span class="text-sm text-[var(--text-secondary)]">状态</span>
        <n-tag :type="statusTagType" size="small" round>{{ statusLabel }}</n-tag>
        <n-spin v-if="loading" :size="14" />
      </div>

      <!-- Not installed -->
      <template v-if="!state?.installed">
        <n-alert type="info" class="mb-4">
          本地 Comfy 引擎尚未安装。点击下方按钮创建引擎目录，后续版本将支持自动下载 ComfyUI。
        </n-alert>
        <n-button type="primary" :loading="loading" @click="handleInstall">
          创建引擎目录
        </n-button>
      </template>

      <!-- Installed -->
      <template v-else>
        <n-form label-placement="left" label-width="96" class="mb-4">
          <n-form-item label="安装目录">
            <div class="flex items-center gap-2 w-full">
              <n-input :value="state.installPath" readonly size="small" />
              <n-button size="small" @click="openFolder('root')">打开</n-button>
            </div>
          </n-form-item>

          <n-form-item label="服务地址">
            <n-input
              v-model:value="baseUrlInput"
              size="small"
              placeholder="http://127.0.0.1:8188"
              @blur="saveBaseUrl"
            />
          </n-form-item>
        </n-form>

        <!-- Action buttons -->
        <div class="flex flex-wrap gap-2 mb-4">
          <n-button @click="handleTestConnection" :loading="testing">
            测试连接
          </n-button>
          <n-button @click="handleStart" :disabled="state.running">
            启动
          </n-button>
          <n-button @click="handleStop" :disabled="!state.running">
            停止
          </n-button>
          <n-button @click="openFolder('models')">模型目录</n-button>
          <n-button @click="openFolder('outputs')">输出目录</n-button>
        </div>

        <!-- Connection result -->
        <n-alert v-if="state.objectInfoCount > 0 && !state.error" type="success" class="mb-4">
          已连接，检测到 {{ state.objectInfoCount }} 个节点。
        </n-alert>

        <!-- Error -->
        <n-alert v-if="state.error" type="error" class="mb-4">
          {{ state.error }}
        </n-alert>

        <!-- Logs -->
        <n-divider title-placement="left" class="!my-3">
          <span class="text-xs text-[var(--text-secondary)]">最近日志</span>
        </n-divider>
        <div class="comfy-logs">
          <div v-if="logs.length === 0" class="text-xs text-[var(--text-secondary)]">暂无日志</div>
          <div
            v-for="(log, i) in logs.slice(-20)"
            :key="i"
            class="comfy-log-item"
          >
            <span class="text-[var(--text-tertiary)]">{{ formatTime(log.time) }}</span>
            <span :class="logLevelClass(log.level)">{{ log.message }}</span>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  NAlert, NButton, NDivider, NForm, NFormItem, NInput, NSpin, NTag
} from 'naive-ui'
import { useComfyStore } from '@/stores/comfy'

const {
  state, loading, logs, isDesktop,
  refreshStatus, updateConfig, doInstall, doStart, doStop,
  doTestConnection, refreshLogs, openFolder
} = useComfyStore()

const baseUrlInput = ref('http://127.0.0.1:8188')
const testing = ref(false)

const statusLabel = computed(() => {
  if (!state.value) return '未知'
  if (state.value.error) return '出错'
  if (state.value.running) return '运行中'
  if (state.value.installed) return '已安装'
  return '未安装'
})

const statusTagType = computed(() => {
  if (!state.value) return 'default'
  if (state.value.error) return 'error'
  if (state.value.running) return 'success'
  if (state.value.installed) return 'info'
  return 'default'
})

async function handleInstall() {
  await doInstall()
}

async function handleStart() {
  await doStart()
  await refreshStatus()
  await refreshLogs()
}

async function handleStop() {
  await doStop()
  await refreshStatus()
  await refreshLogs()
}

async function handleTestConnection() {
  testing.value = true
  try {
    await doTestConnection(baseUrlInput.value)
    await refreshStatus()
    await refreshLogs()
  } finally {
    testing.value = false
  }
}

async function saveBaseUrl() {
  const url = baseUrlInput.value.trim()
  if (url) {
    await updateConfig({ baseUrl: url, port: extractPort(url) })
  }
}

function extractPort(url) {
  try { return new URL(url).port || 8188 } catch { return 8188 }
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

function logLevelClass(level) {
  return level === 'error' ? 'text-red-400' : level === 'warn' ? 'text-yellow-400' : 'text-[var(--text-secondary)]'
}

onMounted(async () => {
  await refreshStatus()
  await refreshLogs()
  if (state.value?.baseUrl) baseUrlInput.value = state.value.baseUrl
})
</script>

<style scoped>
.comfy-engine-panel { padding: 4px 0; }
.comfy-logs {
  max-height: 200px;
  overflow-y: auto;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
}
.comfy-log-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
</style>
