<template>
  <!-- LLM Config node wrapper | LLM配置节点包裹层 -->
  <div class="llm-node-wrapper" @mouseenter="showHandleMenu = true" @mouseleave="showHandleMenu = false">
    <!-- LLM Config node | LLM配置节点 -->
    <div
      class="llm-node bg-[var(--bg-secondary)] rounded-xl border min-w-[320px] max-w-[400px] relative transition-all duration-200"
      :class="data.selected ? 'border-1 border-purple-500 shadow-lg shadow-purple-500/20' : 'border border-[var(--border-color)]'">
      <!-- Header | 头部 -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)] bg-gradient-to-r from-purple-500/10 to-transparent">
        <div class="flex items-center gap-2">
          <n-icon :size="16" class="text-purple-500">
            <ChatbubbleOutline />
          </n-icon>
          <span class="text-sm font-medium text-[var(--text-secondary)]">{{ data.label || 'LLM 文本生成' }}</span>
        </div>
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

      <!-- Config content | 配置内容 -->
      <div class="p-3 space-y-3">
        <!-- System prompt | 系统提示词 -->
        <div>
          <label class="text-xs text-[var(--text-secondary)] mb-1 block">系统提示词</label>
          <textarea 
            v-model="systemPrompt" 
            @blur="updateConfig"
            @wheel.stop 
            @mousedown.stop
            class="w-full bg-[var(--bg-tertiary)] rounded-lg p-2 resize-none outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] min-h-[60px] max-h-[120px] overflow-y-auto border border-[var(--border-color)] focus:border-purple-500 transition-colors"
            placeholder="设定 AI 的角色和行为规则..." 
          />
        </div>

        <!-- Model selection | 模型选择 -->
        <div>
          <label class="text-xs text-[var(--text-secondary)] mb-1 block">模型</label>
          <n-select
            v-model:value="model"
            :options="modelOptions"
            size="small"
            @update:value="updateConfig"
          />
        </div>

        <!-- Output format | 输出格式 -->
        <div>
          <label class="text-xs text-[var(--text-secondary)] mb-1 block">输出格式</label>
          <n-select
            v-model:value="outputFormat"
            :options="formatOptions"
            size="small"
            @update:value="updateConfig"
          />
        </div>

        <!-- Generate button | 生成按钮 -->
        <button 
          @click="handleGenerate"
          :disabled="isGenerating"
          class="w-full px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <n-spin v-if="isGenerating" :size="14" />
          <n-icon v-else :size="14"><SparklesOutline /></n-icon>
          {{ isGenerating ? '生成中...' : '执行生成' }}
        </button>

        <!-- Output preview | 输出预览 -->
        <div v-if="outputContent" class="mt-2">
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-[var(--text-secondary)]">生成结果</label>
            <button 
              @click="handleCopyOutput"
              class="text-xs text-[var(--text-secondary)] hover:text-purple-500 flex items-center gap-1 transition-colors"
            >
              <n-icon :size="12"><CopyOutline /></n-icon>
              复制
            </button>
          </div>
          <div 
            @wheel.stop 
            @mousedown.stop
            class="bg-[var(--bg-tertiary)] rounded-lg p-2 text-xs text-[var(--text-primary)] max-h-[150px] overflow-y-auto border border-[var(--border-color)]"
          >
            <pre class="whitespace-pre-wrap">{{ outputContent }}</pre>
          </div>

          <!-- Split actions | 拆分操作 -->
          <div class="mt-2 flex gap-2">
            <button
              @click="handleSplitToPictureBookPages"
              :disabled="isSplitting"
              class="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-400 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <n-spin v-if="isSplitting" :size="12" />
              <n-icon v-else :size="12"><GridOutline /></n-icon>
              {{ isSplitting ? '拆分中...' : '拆分为绘本页' }}
            </button>
            <button
              @click="handleSplitToCharacterImages"
              :disabled="isSplitting"
              class="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-400 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <n-spin v-if="isSplitting" :size="12" />
              <n-icon v-else :size="12"><PeopleOutline /></n-icon>
              {{ isSplitting ? '拆分中...' : '拆分为角色图' }}
            </button>
          </div>
          <div v-if="splitMessage" class="mt-1 text-xs text-green-600 dark:text-green-400">{{ splitMessage }}</div>
        </div>
      </div>

      <!-- Handles | 连接点 -->
      <Handle type="target" :position="Position.Left" id="left" class="!bg-purple-500" />
      <NodeHandleMenu :nodeId="id" nodeType="llmConfig" dotColor="#a855f7" :visible="showHandleMenu" />
    </div>
  </div>
</template>

<script setup>
/**
 * LLM Config node component | LLM配置节点组件
 * For text generation tasks like story segmentation
 */
import { ref, watch, computed } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { NIcon, NSpin, NSelect } from 'naive-ui'
import { TrashOutline, CopyOutline, ChatbubbleOutline, SparklesOutline, GridOutline, PeopleOutline } from '@vicons/ionicons5'
import { updateNode, removeNode, duplicateNode, addNodes, addEdges, nodes, edges, startBatchOperation, endBatchOperation } from '../../stores/canvas'
import NodeHandleMenu from './NodeHandleMenu.vue'
import { useChat, useApiConfig } from '../../hooks'

const props = defineProps({
  id: String,
  data: Object
})

// Vue Flow instance | Vue Flow 实例
const { updateNodeInternals } = useVueFlow()

// API config hook | API 配置 hook
const { isConfigured: isApiConfigured } = useApiConfig()

// Local state | 本地状态
const showHandleMenu = ref(false)
const systemPrompt = ref(props.data?.systemPrompt || '')
const model = ref(props.data?.model || 'gpt-4o-mini')
const outputFormat = ref(props.data?.outputFormat || 'text')
const outputContent = ref(props.data?.outputContent || '')
const isGenerating = ref(false)
const isSplitting = ref(false)
const splitMessage = ref('')

// Model options | 模型选项
const modelOptions = [
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { label: 'DeepSeek V3', value: 'deepseek-chat' }
]

// Format options | 格式选项
const formatOptions = [
  { label: '纯文本', value: 'text' },
  { label: 'JSON 结构', value: 'json' },
  { label: 'Markdown', value: 'markdown' }
]

// Chat hook | Chat hook
const chatHook = computed(() => {
  return useChat({
    systemPrompt: systemPrompt.value,
    model: model.value
  })
})

// Watch for external data changes | 监听外部数据变化
watch(() => props.data, (newData) => {
  if (newData?.systemPrompt !== undefined) systemPrompt.value = newData.systemPrompt
  if (newData?.model !== undefined) model.value = newData.model
  if (newData?.outputFormat !== undefined) outputFormat.value = newData.outputFormat
  if (newData?.outputContent !== undefined) outputContent.value = newData.outputContent
}, { deep: true })

// Update config in store | 更新存储中的配置
const updateConfig = () => {
  updateNode(props.id, { 
    systemPrompt: systemPrompt.value,
    model: model.value,
    outputFormat: outputFormat.value,
    outputContent: outputContent.value
  })
}

// Get input from connected nodes | 获取连接节点的输入
const getInputFromConnections = () => {
  const incomingEdges = edges.value.filter(e => e.target === props.id)
  const inputs = []
  
  for (const edge of incomingEdges) {
    const sourceNode = nodes.value.find(n => n.id === edge.source)
    if (sourceNode) {
      if (sourceNode.type === 'text' && sourceNode.data?.content) {
        inputs.push(sourceNode.data.content)
      } else if (sourceNode.type === 'llmConfig' && sourceNode.data?.outputContent) {
        inputs.push(sourceNode.data.outputContent)
      }
    }
  }
  
  return inputs.join('\n\n')
}

// Handle generate | 处理生成
const handleGenerate = async () => {
  if (!isApiConfigured.value) {
    window.$message?.warning('请先配置 API Key')
    return
  }

  const input = getInputFromConnections()
  if (!input && !systemPrompt.value) {
    window.$message?.warning('请连接输入节点或设置系统提示词')
    return
  }

  isGenerating.value = true

  try {
    const { send } = useChat({
      systemPrompt: systemPrompt.value,
      model: model.value
    })

    const result = await send(input || '请根据系统提示词生成内容', true)
    
    if (result) {
      outputContent.value = result
      updateNode(props.id, { outputContent: result, executed: true })
      window.$message?.success('生成完成')
    }
  } catch (err) {
    updateNode(props.id, { error: err.message || '生成失败' })
    window.$message?.error(err.message || '生成失败')
  } finally {
    isGenerating.value = false
  }
}

// Watch for auto-execute flag | 监听自动执行标志
watch(
  () => props.data?.autoExecute,
  (shouldExecute) => {
    if (shouldExecute && !isGenerating.value) {
      updateNode(props.id, { autoExecute: false })
      setTimeout(() => handleGenerate(), 100)
    }
  },
  { immediate: true }
)

// Handle delete | 处理删除
const handleDelete = () => {
  removeNode(props.id)
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

// Handle copy output | 处理复制输出
const handleCopyOutput = async () => {
  if (!outputContent.value) return
  try {
    await navigator.clipboard.writeText(outputContent.value)
    window.$message?.success('已复制到剪贴板')
  } catch (err) {
    window.$message?.error('复制失败')
  }
}

/**
 * Find character reference image node from sibling workflow nodes
 * 从工作流中查找角色参考图节点
 */
const findCharacterReferenceImage = () => {
  // Strategy: find image nodes that have labels like '角色参考图', '主角参考图', '角色图结果' with a valid url
  const imageNodes = nodes.value.filter(n => 
    n.type === 'image' && 
    n.data?.url && 
    n.data.url !== '' &&
    (n.data?.label?.includes('角色') || n.data?.label?.includes('参考图'))
  )
  if (imageNodes.length > 0) return imageNodes[0]

  // Fallback: find any image node connected to an imageConfig with '角色' or '参考' label
  const charConfigs = nodes.value.filter(n => 
    n.type === 'imageConfig' && 
    (n.data?.label?.includes('角色') || n.data?.label?.includes('参考'))
  )
  for (const config of charConfigs) {
    const outEdges = edges.value.filter(e => e.source === config.id)
    for (const edge of outEdges) {
      const target = nodes.value.find(n => n.id === edge.target && n.type === 'image' && n.data?.url)
      if (target) return target
    }
  }

  return null
}

/**
 * Parse picture book pages from LLM output
 * 解析 LLM 输出的绘本页面
 * Supports formats:
 *   第N页：[故事配文] | [插画描述]
 *   第N页：[故事配文] | [插画描述]
 */
const parsePictureBookPages = (text) => {
  const pages = []
  const lines = text.split('\n').filter(l => l.trim())

  for (const line of lines) {
    // Match: 第N页： or 第N页: followed by content
    const pageMatch = line.match(/第\s*(\d+)\s*页[\uff1a:](.*)/)
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1])
      const rest = pageMatch[2].trim()

      // Split by | separator
      const parts = rest.split('|').map(s => s.trim())
      const storyText = parts[0] || ''
      const illustrationPrompt = parts.slice(1).join('|').trim() || storyText

      pages.push({
        pageNumber: pageNum,
        storyText,
        illustrationPrompt
      })
    }
  }

  return pages
}

/**
 * Parse character designs from LLM output
 * 解析 LLM 输出的角色设计
 * Supports formats:
 *   角色名
 *   角色提示词
 *   ---
 *   角色名2
 *   角色提示词2
 *   ---
 */
const parseCharacterDesigns = (text) => {
  const characters = []
  // Split by "---" separator
  const blocks = text.split(/---+/).map(b => b.trim()).filter(b => b)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l)
    if (lines.length >= 2) {
      // First line is character name, rest is the prompt
      const charName = lines[0]
      const charPrompt = lines.slice(1).join(' ')

      characters.push({
        name: charName,
        prompt: charPrompt
      })
    } else if (lines.length === 1) {
      // Only one line, treat as prompt without name
      characters.push({
        name: `角色${characters.length + 1}`,
        prompt: lines[0]
      })
    }
  }

  return characters
}

/**
 * Split output into picture book page nodes
 * 拆分输出为绘本页节点（故事文字 + 插画描述 + imageConfig + 角色参考图连接）
 */
const handleSplitToPictureBookPages = () => {
  if (!outputContent.value) return

  const pages = parsePictureBookPages(outputContent.value)
  if (pages.length === 0) {
    window.$message?.warning('无法解析绘本页面，请检查 LLM 输出格式（期望“第N页：[文字] | [插画描述]”）')
    return
  }

  isSplitting.value = true
  splitMessage.value = ''

  try {
    // Find character reference image
    const charImageNode = findCharacterReferenceImage()

    // Get current node position
    const currentNode = nodes.value.find(n => n.id === props.id)
    const baseX = (currentNode?.position?.x || 0) + 450
    const baseY = (currentNode?.position?.y || 0) - 100
    const rowSpacing = 240
    const colSpacing = 420

    // Start batch operation manually | 手动开始批量操作
    startBatchOperation()

    // Prepare node specs for batch creation | 准备批量创建的节点规格
    const nodeSpecs = []
    const edgeSpecs = []

    for (const page of pages) {
      const pageY = baseY + (page.pageNumber - 1) * rowSpacing

      // Create illustration prompt node spec | 创建插画描述节点规格
      const illustrationSpec = {
        type: 'text',
        position: { x: baseX, y: pageY },
        data: {
          content: page.illustrationPrompt,
          label: `第${page.pageNumber}页 插画描述`
        }
      }
      nodeSpecs.push(illustrationSpec)

      // Create imageConfig node spec | 创建图片配置节点规格
      const imageConfigSpec = {
        type: 'imageConfig',
        position: { x: baseX + colSpacing, y: pageY },
        data: {
          label: `绘本第${page.pageNumber}页`,
          model: 'doubao-seedream-4-5-251128',
          size: '2048x2048'
        }
      }
      nodeSpecs.push(imageConfigSpec)
    }

    // Batch create nodes (autoBatch=false) | 批量创建节点（autoBatch=false）
    const createdIds = addNodes(nodeSpecs, false)

    // Create edge specs | 创建边规格
    for (let i = 0; i < pages.length; i++) {
      const illustrationId = createdIds[i * 2]
      const imageConfigId = createdIds[i * 2 + 1]

      // Connect illustration prompt → imageConfig
      edgeSpecs.push({
        source: illustrationId,
        target: imageConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })

      // Connect character reference image → imageConfig (if found)
      if (charImageNode) {
        edgeSpecs.push({
          source: charImageNode.id,
          target: imageConfigId,
          type: 'imageOrder',
          data: { imageOrder: 1 },
          sourceHandle: 'right',
          targetHandle: 'left'
        })
      }
    }

    // Batch create edges (autoBatch=false) | 批量创建边（autoBatch=false）
    addEdges(edgeSpecs, false)

    // End batch operation and save to history | 结束批量操作并保存到历史
    endBatchOperation()

    const createdCount = pages.length
    const charMsg = charImageNode ? '，已关联角色参考图' : '，未找到角色参考图（请手动连接）'
    splitMessage.value = `已拆分 ${createdCount} 页${charMsg}`
    window.$message?.success(`已拆分为 ${createdCount} 个绘本页${charMsg}`)
  } catch (err) {
    window.$message?.error(`拆分失败: ${err.message}`)
  } finally {
    isSplitting.value = false
  }
}

/**
 * Split output into character image nodes
 * 拆分输出为角色图节点（角色名 + imageConfig）
 */
const handleSplitToCharacterImages = () => {
  if (!outputContent.value) return

  const characters = parseCharacterDesigns(outputContent.value)
  if (characters.length === 0) {
    window.$message?.warning('无法解析角色设计，请检查 LLM 输出格式（使用"---"分隔每个角色）')
    return
  }

  isSplitting.value = true
  splitMessage.value = ''

  try {
    // Get current node position
    const currentNode = nodes.value.find(n => n.id === props.id)
    const baseX = (currentNode?.position?.x || 0) + 450
    const baseY = (currentNode?.position?.y || 0)
    const rowSpacing = 200
    const colSpacing = 350

    // Start batch operation manually
    startBatchOperation()

    // Prepare node specs for batch creation
    const nodeSpecs = []
    const edgeSpecs = []

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i]
      const charY = baseY + i * rowSpacing

      // Create text node for character prompt
      const promptSpec = {
        type: 'text',
        position: { x: baseX, y: charY },
        data: {
          content: char.prompt,
          label: char.name
        }
      }
      nodeSpecs.push(promptSpec)

      // Create imageConfig node for character
      const imageConfigSpec = {
        type: 'imageConfig',
        position: { x: baseX + colSpacing, y: charY },
        data: {
          label: `${char.name}参考图`,
          model: 'doubao-seedream-4-5-251128',
          size: '2048x2048'
        }
      }
      nodeSpecs.push(imageConfigSpec)
    }

    // Batch create nodes
    const createdIds = addNodes(nodeSpecs, false)

    // Create edges
    for (let i = 0; i < characters.length; i++) {
      const promptId = createdIds[i * 2]
      const imageConfigId = createdIds[i * 2 + 1]

      // Connect prompt → imageConfig
      edgeSpecs.push({
        source: promptId,
        target: imageConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })

      // Connect from LLM node to prompt
      edgeSpecs.push({
        source: props.id,
        target: promptId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
    }

    // Batch create edges
    addEdges(edgeSpecs, false)

    // End batch operation
    endBatchOperation()

    splitMessage.value = `已拆分 ${characters.length} 个角色`
    window.$message?.success(`已拆分为 ${characters.length} 个角色图节点`)
  } catch (err) {
    window.$message?.error(`拆分失败: ${err.message}`)
  } finally {
    isSplitting.value = false
  }
}
</script>

<style scoped>
.llm-node-wrapper {
  padding-right: 50px;
  padding-top: 20px;
  position: relative;
}

.llm-node {
  cursor: default;
  position: relative;
}

.llm-node textarea {
  cursor: text;
}

.llm-node pre {
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}
</style>
