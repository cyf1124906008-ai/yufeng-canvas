<template>
  <div class="comfy-engine-panel">
    <n-alert v-if="!isDesktop" type="warning" class="mb-4">
      Comfy 内置引擎管理只在桌面版可用。
    </n-alert>

    <template v-else>
      <div class="flex items-center gap-3 mb-4">
        <span class="text-sm text-[var(--text-secondary)]">状态</span>
        <n-tag :type="statusTagType" size="small" round>{{ statusLabel }}</n-tag>
        <n-spin v-if="loading" :size="14" />
      </div>

      <n-alert type="info" class="mb-4">
        这是高级用户可选的本地 ComfyUI 连接/运行页。普通用户不需要部署本地模型，只需在前面的模型配置页填写云端 API Key、Base URL 和模型名。
      </n-alert>

      <template v-if="!state?.installed">
        <n-button type="primary" :loading="loading" @click="handleInstall">
          装载本地 ComfyUI（高级）
        </n-button>
      </template>

      <template v-else>
        <n-form label-placement="left" label-width="96" class="mb-4">
          <n-form-item label="引擎目录">
            <div class="flex items-center gap-2 w-full">
              <n-input :value="state.installPath" readonly size="small" />
              <n-button size="small" @click="openFolder('root')">打开</n-button>
            </div>
          </n-form-item>
          <n-form-item label="模型目录">
            <div class="flex items-center gap-2 w-full">
              <n-input :value="state.modelsPath" readonly size="small" />
              <n-button size="small" @click="openFolder('models')">打开</n-button>
            </div>
          </n-form-item>
          <n-form-item label="服务地址">
            <n-input v-model:value="baseUrlInput" size="small" placeholder="http://127.0.0.1:8188" @blur="saveBaseUrl" />
          </n-form-item>
        </n-form>

        <div class="flex flex-wrap gap-2 mb-4">
          <n-button type="primary" @click="handleStart" :disabled="state.running">启动本地 ComfyUI</n-button>
          <n-button @click="handleStop" :disabled="!state.running">停止</n-button>
          <n-button @click="handleInstallDependencies">安装 Python 依赖</n-button>
          <n-button @click="handleScanModels">扫描模型</n-button>
          <n-button @click="handleTestConnection" :loading="testing">测试连接</n-button>
          <n-button @click="openFolder('outputs')">输出目录</n-button>
        </div>

        <n-alert v-if="state.objectInfoCount > 0 && !state.error" type="success" class="mb-4">
          已连接本地 ComfyUI，检测到 {{ state.objectInfoCount }} 个节点类型。
        </n-alert>
        <n-alert v-if="state.error" type="error" class="mb-4">{{ state.error }}</n-alert>

        <n-alert v-if="modelScan?.missing?.length" type="warning" class="mb-4">
          <div v-for="item in modelScan.missing" :key="item">{{ item }}</div>
        </n-alert>
        <div v-if="modelScan" class="model-scan mb-4">
          <div>Checkpoints：{{ modelScan.counts.checkpoints }}</div>
          <div>Diffusion Models：{{ modelScan.counts.diffusionModels }}</div>
          <div>LoRA：{{ modelScan.counts.loras }}</div>
          <div>ControlNet：{{ modelScan.counts.controlnet }}</div>
          <div>VAE：{{ modelScan.counts.vae }}</div>
        </div>

        <n-divider title-placement="left" class="!my-3">
          <span class="text-xs text-[var(--text-secondary)]">运行日志</span>
        </n-divider>
        <div class="comfy-logs">
          <div v-if="logs.length === 0" class="text-xs text-[var(--text-secondary)]">暂无日志</div>
          <div v-for="(log, i) in logs.slice(-30)" :key="i" class="comfy-log-item">
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
import { NAlert, NButton, NDivider, NForm, NFormItem, NInput, NSpin, NTag } from 'naive-ui'
import { useComfyStore } from '@/stores/comfy'

const {
  state, loading, logs, modelScan, isDesktop,
  refreshStatus, updateConfig, doInstall, doInstallDependencies,
  doStart, doStop, doTestConnection, refreshLogs, openFolder, scanModels
} = useComfyStore()

const baseUrlInput = ref('http://127.0.0.1:8188')
const testing = ref(false)

const statusLabel = computed(() => {
  if (!state.value) return '未知'
  if (state.value.error) return '出错'
  if (state.value.running) return '运行中'
  if (state.value.installed) return '已装载'
  return '未装载'
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
  await refreshLogs()
  await handleScanModels()
}

async function handleInstallDependencies() {
  await doInstallDependencies()
  await refreshStatus()
  await refreshLogs()
}

async function handleScanModels() {
  await scanModels()
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
  if (url) await updateConfig({ baseUrl: url, port: extractPort(url) })
}

function extractPort(url) {
  try { return new URL(url).port || 8188 } catch { return 8188 }
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function logLevelClass(level) {
  return level === 'error' ? 'text-red-400' : level === 'warn' ? 'text-yellow-400' : 'text-[var(--text-secondary)]'
}

onMounted(async () => {
  await refreshStatus()
  await refreshLogs()
  await scanModels()
  if (state.value?.baseUrl) baseUrlInput.value = state.value.baseUrl
})
</script>

<style scoped>
.comfy-engine-panel { padding: 4px 0; }
.comfy-logs {
  max-height: 240px;
  overflow-y: auto;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
}
.comfy-log-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.model-scan {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
