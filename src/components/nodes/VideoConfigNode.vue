<template>
  <!-- Video config node wrapper | 视频配置节点包裹层 -->
  <div class="video-config-node-wrapper relative" @mouseenter="showHandleMenu = true" @mouseleave="showHandleMenu = false">
    <!-- Video config node | 视频配置节点 -->
    <div class="video-config-node bg-[var(--bg-secondary)] rounded-xl border min-w-[300px] transition-all duration-200"
      :class="data.selected ? 'border-1 border-blue-500 shadow-lg shadow-blue-500/20' : 'border border-[var(--border-color)]'">
      <!-- Header | 头部 -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
        <span
          v-if="!isEditingLabel"
          @dblclick="startEditLabel"
          class="text-sm font-medium text-[var(--text-secondary)] cursor-text hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors"
          title="双击编辑名称"
        >{{ data.label || '视频生成' }}</span>
        <input
          v-else
          ref="labelInputRef"
          v-model="editingLabelValue"
          @blur="finishEditLabel"
          @keydown.enter="finishEditLabel"
          @keydown.escape="cancelEditLabel"
          class="text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-1 rounded outline-none border border-blue-500"
        />
        <div class="flex items-center gap-1">
          <button @click="handleDuplicate" class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors" title="复制节点">
            <n-icon :size="14">
              <CopyOutline />
            </n-icon>
          </button>
          <button @click="handleDelete" class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors" title="删除节点">
            <n-icon :size="14">
              <TrashOutline />
            </n-icon>
          </button>
        </div>
      </div>

      <!-- Config options | 配置选项 -->
      <div class="p-3 space-y-3">
        <!-- Model selector | 模型选择 -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-[var(--text-secondary)]">模型</span>
          <n-dropdown :options="modelOptions" @select="handleModelSelect">
            <button class="flex items-center gap-1 text-sm text-[var(--text-primary)] hover:text-[var(--accent-color)]">
              {{ displayModelName }}
              <n-icon :size="12"><ChevronDownOutline /></n-icon>
            </button>
          </n-dropdown>
        </div>

        <!-- Aspect ratio selector | 宽高比选择 -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-[var(--text-secondary)]">比例</span>
          <n-dropdown :options="ratioOptions" @select="handleRatioSelect">
            <button class="flex items-center gap-1 text-sm text-[var(--text-primary)] hover:text-[var(--accent-color)]">
              {{ localRatio }}
              <n-icon :size="12">
                <ChevronForwardOutline />
              </n-icon>
            </button>
          </n-dropdown>
        </div>

        <!-- Duration selector | 时长选择 -->
        <div class="flex items-center justify-between">
          <span class="text-xs text-[var(--text-secondary)]">时长</span>
          <n-dropdown :options="durationOptions" @select="handleDurationSelect">
            <button class="flex items-center gap-1 text-sm text-[var(--text-primary)] hover:text-[var(--accent-color)]">
              {{ localDuration }}s
              <n-icon :size="12">
                <ChevronForwardOutline />
              </n-icon>
            </button>
          </n-dropdown>
        </div>

        <!-- Resolution selector | 清晰度选择 -->
        <div v-if="hasResolutionOptions" class="flex items-center justify-between">
          <span class="text-xs text-[var(--text-secondary)]">清晰度</span>
          <n-dropdown :options="resolutionOptions" @select="handleResolutionSelect">
            <button class="flex items-center gap-1 text-sm text-[var(--text-primary)] hover:text-[var(--accent-color)]">
              {{ displayResolution }}
              <n-icon :size="12">
                <ChevronForwardOutline />
              </n-icon>
            </button>
          </n-dropdown>
        </div>

        <div class="advanced-params">
          <button class="advanced-toggle" @click="showAdvancedParams = !showAdvancedParams">
            高级参数
            <span>{{ showAdvancedParams ? '收起' : '展开' }}</span>
          </button>
          <div v-if="showAdvancedParams" class="advanced-grid">
            <label>
              <span>Seed</span>
              <input v-model="localSeed" placeholder="可选，固定随机种子" @change="updateAdvancedParams" />
            </label>
            <label>
              <span>负面词</span>
              <input v-model="localNegativePrompt" placeholder="可选，不想出现的内容" @change="updateAdvancedParams" />
            </label>
            <label>
              <span>镜头运动</span>
              <input v-model="localCameraMotion" placeholder="可选，如 dolly in / pan left" @change="updateAdvancedParams" />
            </label>
          </div>
        </div>

        <!-- Connected inputs indicator | 连接输入指示 -->
        <div
          class="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-1 border-t border-[var(--border-color)]">
          <span class="px-2 py-0.5 rounded-full"
            :class="connectedPrompt ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'">
            提示词 {{ connectedPrompt ? '✓' : '○' }}
          </span>
          <span class="px-2 py-0.5 rounded-full"
            :class="imagesByRole.firstFrame ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'">
            首帧 {{ imagesByRole.firstFrame ? '✓' : '○' }}
          </span>
          <span class="px-2 py-0.5 rounded-full"
            :class="imagesByRole.lastFrame ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'">
            尾帧 {{ imagesByRole.lastFrame ? '✓' : '○' }}
          </span>
          <span class="px-2 py-0.5 rounded-full"
            :class="imagesByRole.referenceImages.length > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'">
            参考图 {{ imagesByRole.referenceImages.length > 0 ? `✓ ${imagesByRole.referenceImages.length}` : '○' }}
          </span>
        </div>

        <!-- Progress bar | 进度条 -->
        <!-- <div v-if="status === 'polling'" class="space-y-1">
        <div class="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>生成中...</span>
          <span>{{ progress.percentage }}%</span>
        </div>
        <n-progress type="line" :percentage="progress.percentage" :show-indicator="false" :height="4" />
      </div> -->

        <!-- Generate button | 生成按钮 -->
        <button @click="handleGenerate" :disabled="isGenerating || !canGenerate"
          class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <n-spin v-if="isGenerating" :size="14" />
          <template v-else>
            <n-icon :size="16">
              <VideocamOutline />
            </n-icon>
            生成视频
          </template>
        </button>

        <!-- Error message | 错误信息 -->
        <div v-if="error" class="text-xs text-red-500 mt-2">
          {{ error.message || '生成失败' }}
        </div>

        <!-- Generated video preview | 生成视频预览 -->
        <!-- <div v-if="generatedVideo?.url" class="mt-3 space-y-2">
        <div class="text-xs text-[var(--text-secondary)]">生成结果:</div>
        <div class="aspect-video rounded-lg overflow-hidden bg-black">
          <video :src="generatedVideo.url" controls class="w-full h-full object-contain" />
        </div>
      </div> -->
      </div>

      <!-- Handles | 连接点 -->
      <Handle type="target" :position="Position.Left" id="left" class="!bg-[var(--accent-color)]" />
      <NodeHandleMenu :nodeId="id" nodeType="videoConfig" :visible="showHandleMenu" :operations="[]" />
    </div>

  </div>
</template>

<script setup>
/**
 * Video config node component | 视频配置节点组件
 * Configuration panel for video generation with API integration
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { NIcon, NDropdown, NSpin } from 'naive-ui'
import { ChevronForwardOutline, ChevronDownOutline, TrashOutline, VideocamOutline, CopyOutline, CreateOutline } from '@vicons/ionicons5'
import { useVideoGeneration } from '../../hooks'
import { updateNode, removeNode, duplicateNode, addNode, addEdge, nodes, edges } from '../../stores/canvas'
import NodeHandleMenu from './NodeHandleMenu.vue'
import { useModelStore } from '../../stores/pinia'
import { getCapabilityLabel, getModelCapabilityConflict } from '../../utils/modelCapability'
import {
  getModelRatioOptions,
  getModelDurationOptions,
  getModelResolutionOptions,
  getModelConfig
} from '../../stores/models'

// 使用 Pinia store 获取模型选项（根据渠道过滤）
const modelStore = useModelStore()

const props = defineProps({
  id: String,
  data: Object
})

// Vue Flow instance | Vue Flow 实例
const { updateNodeInternals } = useVueFlow()

// API config state | API 配置状态
const isConfigured = computed(() => !!modelStore.currentVideoApiKey)

// Video generation hook | 视频生成 hook
const { loading, error, status, video: generatedVideo, progress, createVideoTaskOnly } = useVideoGeneration()

// Local state | 本地状态
const showHandleMenu = ref(false)
const isGenerating = ref(false)  // 任务创建中状态
const localModel = ref(props.data?.model || modelStore.selectedVideoModel || '')
const localRatio = ref(props.data?.ratio || '16:9')
const localDuration = ref(props.data?.dur || 5)
const localResolution = ref(props.data?.resolution || '720p')
const localSeed = ref(props.data?.seed || '')
const localNegativePrompt = ref(props.data?.negative_prompt || '')
const localCameraMotion = ref(props.data?.camera_motion || '')
const showAdvancedParams = ref(false)

// Label editing state | Label 编辑状态
const isEditingLabel = ref(false)
const editingLabelValue = ref('')
const labelInputRef = ref(null)

// Get connected images with roles | 获取连接的图片及其角色
const connectedImages = computed(() => {
  const connectedEdges = edges.value.filter(e => e.target === props.id)
  const images = []

  for (const edge of connectedEdges) {
    const sourceNode = nodes.value.find(n => n.id === edge.source)
    if (sourceNode?.type === 'image' && sourceNode.data?.url) {
      images.push({
        nodeId: sourceNode.id,
        edgeId: edge.id,
        url: sourceNode.data.url,
        base64: sourceNode.data.base64,
        role: edge.data?.imageRole || 'first_frame_image' // Default to first frame | 默认首帧
      })
    }
  }

  return images
})

// Get images by role | 按角色获取图片
const imagesByRole = computed(() => {
  const firstFrame = connectedImages.value.find(img => img.role === 'first_frame_image')
  const lastFrame = connectedImages.value.find(img => img.role === 'last_frame_image')
  const referenceImages = connectedImages.value.filter(img => img.role === 'input_reference')

  return {
    firstFrame,
    lastFrame,
    referenceImages
  }
})

// Get current model config | 获取当前模型配置
const currentModelConfig = computed(() => getModelConfig(localModel.value))

// Model options from Pinia store (filtered by provider) | 从 Pinia store 获取模型选项（根据渠道过滤）
const modelOptions = computed(() => modelStore.videoModelOptions)

// Display model name | 显示模型名称
const displayModelName = computed(() => {
  if (modelCapabilityConflict.value) {
    return '选择视频模型'
  }

  const model = modelOptions.value.find(m => m.key === localModel.value)
  // 如果当前模型不在选项中，尝试从 allVideoModels 找到
  if (!model) {
    const allModel = modelStore.allVideoModels.find(m => m.key === localModel.value)
    return allModel?.label || localModel.value || '选择模型'
  }
  return model?.label || localModel.value || '选择模型'
})

// Ratio options based on model | 基于模型的比例选项
const ratioOptions = computed(() => {
  return getModelRatioOptions(localModel.value)
})

// Duration options based on model | 基于模型的时长选项
const durationOptions = computed(() => {
  return getModelDurationOptions(localModel.value)
})

const resolutionOptions = computed(() => {
  return getModelResolutionOptions(localModel.value)
})

const hasResolutionOptions = computed(() => {
  return Array.isArray(currentModelConfig.value?.resolutions) && currentModelConfig.value.resolutions.length > 0
})

const displayResolution = computed(() => {
  const option = resolutionOptions.value.find((item) => item.key === localResolution.value)
  return option?.label || localResolution.value
})

const selectedVideoModel = computed(() =>
  modelStore.availableVideoModels.find((model) => model.key === localModel.value)
)

const modelCapabilityConflict = computed(() => getModelCapabilityConflict(localModel.value, 'video'))

const canGenerate = computed(() =>
  isConfigured.value &&
  !!localModel.value &&
  !!selectedVideoModel.value &&
  !modelCapabilityConflict.value
)

// Handle model selection | 处理模型选择
const handleModelSelect = (key) => {
  localModel.value = key
  // Update ratio and duration to model's default | 更新为模型默认比例和时长
  const config = getModelConfig(key)
  const updates = { model: key }
  if (config?.defaultParams?.ratio) {
    localRatio.value = config.defaultParams.ratio
    updates.ratio = config.defaultParams.ratio
  }
  if (config?.defaultParams?.duration) {
    localDuration.value = config.defaultParams.duration
    updates.dur = config.defaultParams.duration
  }
  if (config?.defaultParams?.resolution || config?.defaultResolution) {
    localResolution.value = config?.defaultParams?.resolution || config?.defaultResolution
    updates.resolution = localResolution.value
  }
  updateNode(props.id, updates)
}

// Handle duplicate | 处理复制
const handleDuplicate = () => {
  const newNodeId = duplicateNode(props.id)
  window.$message?.success('节点已复制')
  if (newNodeId) {
    setTimeout(() => {
      updateNodeInternals(newNodeId)
    }, 50)
  }
}

// Handle ratio selection | 处理比例选择
const handleRatioSelect = (key) => {
  localRatio.value = key
  updateNode(props.id, { ratio: key })
}

// Handle duration selection | 处理时长选择
const handleDurationSelect = (key) => {
  localDuration.value = key
  updateNode(props.id, { dur: key })
}

const handleResolutionSelect = (key) => {
  localResolution.value = key
  updateNode(props.id, { resolution: key })
}

const updateAdvancedParams = () => {
  updateNode(props.id, {
    seed: String(localSeed.value || '').trim(),
    negative_prompt: String(localNegativePrompt.value || '').trim(),
    camera_motion: String(localCameraMotion.value || '').trim()
  })
}

// Get connected inputs by role | 根据角色获取连接的输入
const getConnectedInputs = () => {
  const connectedEdges = edges.value.filter(e => e.target === props.id)

  let prompt = ''
  let first_frame_image = ''
  let last_frame_image = ''
  const images = [] // input_reference images | 参考图

  for (const edge of connectedEdges) {
    const sourceNode = nodes.value.find(n => n.id === edge.source)
    if (!sourceNode) continue

    if (sourceNode.type === 'text') {
      prompt = sourceNode.data?.content || ''
    } else if (sourceNode.type === 'llmConfig') {
      // LLM node output as prompt | LLM 节点输出作为提示词
      const content = sourceNode.data?.outputContent || ''
      if (content) prompt = content
    } else if (sourceNode.type === 'image' && sourceNode.data?.url) {
      const imageData = sourceNode.data.base64 || sourceNode.data.url
      const role = edge.data?.imageRole || 'first_frame_image'

      if (role === 'first_frame_image') {
        first_frame_image = imageData
      } else if (role === 'last_frame_image') {
        last_frame_image = imageData
      } else if (role === 'input_reference') {
        images.push(imageData)
      }
    }
  }

  return { prompt, first_frame_image, last_frame_image, images }
}

// Computed connected prompt | 计算连接的提示词
const connectedPrompt = computed(() => {
  return getConnectedInputs().prompt
})

// Created video node ID | 创建的视频节点 ID
const createdVideoNodeId = ref(null)

// Handle generate action | 处理生成操作
const handleGenerate = async () => {
  // 设置生成中状态
  isGenerating.value = true

  if (!localModel.value) {
    window.$message?.warning('请先在 API 设置的模型配置里添加视频模型')
    isGenerating.value = false
    return
  }

  if (modelCapabilityConflict.value) {
    window.$message?.warning(
      `当前选择的是${getCapabilityLabel(modelCapabilityConflict.value)}模型，请在视频模型里填写真正的视频模型，例如 kling-v2-5-turbo。`
    )
    isGenerating.value = false
    return
  }

  if (!selectedVideoModel.value) {
    window.$message?.warning('当前模型不在视频模型列表中，请先配置正确的视频模型')
    isGenerating.value = false
    return
  }

  const { prompt, first_frame_image, last_frame_image, images } = getConnectedInputs()

  const hasInput = prompt || first_frame_image || last_frame_image || images.length > 0
  if (!hasInput) {
    window.$message?.warning('请先连接文本节点或图片节点')
    isGenerating.value = false
    return
  }

  if (!isConfigured.value) {
    window.$message?.warning('请先配置 API Key')
    isGenerating.value = false
    return
  }

  // Get current node position | 获取当前节点位置
  const currentNode = nodes.value.find(n => n.id === props.id)
  const nodeX = currentNode?.position?.x || 0
  const nodeY = currentNode?.position?.y || 0

  // Create video node with loading state | 创建带加载状态的视频节点
  const videoNodeId = addNode('video', { x: nodeX + 350, y: nodeY }, {
    url: '',
    loading: true,
    error: '',
    startedAt: Date.now(),
    label: '视频生成中...'
  })
  createdVideoNodeId.value = videoNodeId

  // Auto-connect videoConfig → video | 自动连接 视频配置 → 视频
  addEdge({
    source: props.id,
    target: videoNodeId,
    sourceHandle: 'right',
    targetHandle: 'left'
  })

  // Force Vue Flow to recalculate node dimensions | 强制 Vue Flow 重新计算节点尺寸
  setTimeout(() => {
    updateNodeInternals(videoNodeId)
  }, 50)

  try {
    // Build request params (raw form data) | 构建请求参数（原始表单数据）
    // These will be transformed by inputTransform | 这些会被 inputTransform 转换
    const params = {
      model: localModel.value
    }

    // Add prompt if provided | 如果有提示词则添加
    if (prompt) {
      params.prompt = prompt
    }

    // Add first frame image | 添加首帧图片
    if (first_frame_image) {
      params.first_frame_image = first_frame_image
    }

    // Add last frame image | 添加尾帧图片
    if (last_frame_image) {
      params.last_frame_image = last_frame_image
    }

    // Add reference images (input_reference) | 添加参考图
    if (images.length > 0) {
      params.images = images
    }

    // Add ratio/size | 添加比例参数
    if (localRatio.value) {
      params.ratio = localRatio.value
    }

    // Add duration | 添加时长
    if (localDuration.value) {
      params.dur = localDuration.value
    }

    if (hasResolutionOptions.value && localResolution.value) {
      params.resolution = localResolution.value
    }

    if (String(localSeed.value || '').trim()) {
      params.seed = String(localSeed.value).trim()
    }

    if (String(localNegativePrompt.value || '').trim()) {
      params.negative_prompt = String(localNegativePrompt.value).trim()
    }

    if (String(localCameraMotion.value || '').trim()) {
      params.camera_motion = String(localCameraMotion.value).trim()
    }

    // 只创建任务，获取 taskId，不在这里轮询
    const { taskId: newTaskId, url } = await createVideoTaskOnly(params)

    // 如果有直接 URL，更新视频节点
    if (url) {
      updateNode(videoNodeId, {
        url: url,
        loading: false,
        error: '',
        label: '视频生成',
        model: localModel.value,
        finishedAt: Date.now(),
        updatedAt: Date.now()
      })
      window.$message?.success('视频生成成功')
      // Mark this config node as executed | 标记配置节点已执行
      updateNode(props.id, { executed: true, outputNodeId: videoNodeId })
    } else if (newTaskId) {
      // 需要轮询，传递 taskId 给 VideoNode
      updateNode(videoNodeId, {
        taskId: newTaskId,
        loading: true,
        error: '',
        startedAt: Date.now(),
        label: '视频生成中...',
        model: localModel.value,
        updatedAt: Date.now()
      })
      window.$message?.success('视频任务已创建')
      // Mark this config node as executed | 标记配置节点已执行
      updateNode(props.id, { executed: true, outputNodeId: videoNodeId })
    }
  } catch (err) {
    // Update node to show error | 更新节点显示错误
    updateNode(videoNodeId, {
      loading: false,
      error: err.message || '生成失败',
      label: '生成失败',
      finishedAt: Date.now(),
      updatedAt: Date.now()
    })
    window.$message?.error(err.message || '视频生成失败')
  } finally {
    isGenerating.value = false
  }
}

// Start editing label | 开始编辑 label
const startEditLabel = () => {
  editingLabelValue.value = props.data?.label || '视频生成'
  isEditingLabel.value = true
  nextTick(() => {
    labelInputRef.value?.focus()
    labelInputRef.value?.select()
  })
}

// Finish editing label | 完成编辑 label
const finishEditLabel = () => {
  const newLabel = editingLabelValue.value.trim()
  if (newLabel && newLabel !== props.data?.label) {
    updateNode(props.id, { label: newLabel })
  }
  isEditingLabel.value = false
}

// Cancel editing label | 取消编辑 label
const cancelEditLabel = () => {
  isEditingLabel.value = false
}

// Handle delete | 处理删除
const handleDelete = () => {
  removeNode(props.id)
}

// Initialize on mount | 挂载时初始化
onMounted(() => {
  // 检查当前模型是否在可用模型列表中
  const availableModels = modelStore.availableVideoModels
  const isModelAvailable = availableModels.some(m => m.key === localModel.value)

  if (!localModel.value || !isModelAvailable) {
    // 只允许从视频模型列表里选择，避免把图片模型误发到视频接口产生扣费。
    localModel.value = availableModels[0]?.key || ''
    if (localModel.value) {
      updateNode(props.id, { model: localModel.value })
    } else if (props.data?.model) {
      updateNode(props.id, { model: '' })
    }
  }

  const config = getModelConfig(localModel.value)
  if (config?.defaultParams?.resolution || config?.defaultResolution) {
    localResolution.value = props.data?.resolution || config?.defaultParams?.resolution || config?.defaultResolution
    updateNode(props.id, { resolution: localResolution.value })
  }
})

// Watch for model changes from props | 监听 props 中模型变化
watch(() => props.data?.model, (newModel) => {
  if (newModel && newModel !== localModel.value) {
    localModel.value = newModel
  }
})

watch(() => props.data?.resolution, (newResolution) => {
  if (newResolution && newResolution !== localResolution.value) {
    localResolution.value = newResolution
  }
})

watch(() => props.data?.seed, (value) => {
  if ((value || '') !== localSeed.value) {
    localSeed.value = value || ''
  }
})

watch(() => props.data?.negative_prompt, (value) => {
  if ((value || '') !== localNegativePrompt.value) {
    localNegativePrompt.value = value || ''
  }
})

watch(() => props.data?.camera_motion, (value) => {
  if ((value || '') !== localCameraMotion.value) {
    localCameraMotion.value = value || ''
  }
})

// 修复 Vue Flow visibility: hidden 问题
// 当节点数据变化时，强制更新内部状态
watch(() => props.data, () => {
  nextTick(() => {
    updateNodeInternals(props.id)
  })
}, { deep: true })

// Watch for auto-execute flag | 监听自动执行标志
watch(
  () => props.data?.autoExecute,
  (shouldExecute) => {
    if (shouldExecute && !loading.value) {
      // Clear the flag first to prevent re-triggering | 先清除标志防止重复触发
      updateNode(props.id, { autoExecute: false })
      // Delay to ensure node connections are established | 延迟确保节点连接已建立
      setTimeout(() => {
        handleGenerate()
      }, 100)
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.video-config-node-wrapper {
  position: relative;
  padding-top: 20px;
}

.video-config-node {
  cursor: default;
  position: relative;
}

.advanced-params {
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

.advanced-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border-radius: 9px;
  padding: 6px 8px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.advanced-toggle span {
  color: var(--accent-color);
  font-size: 11px;
}

.advanced-grid {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.advanced-grid label {
  display: grid;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 11px;
}

.advanced-grid input {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 6px 8px;
  outline: none;
  color: var(--text-primary);
  background: var(--bg-secondary);
  font-size: 12px;
}

.advanced-grid input:focus {
  border-color: var(--accent-color);
}
</style>
