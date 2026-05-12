<template>
  <div class="image-expert-shell">
    <AppHeader class="expert-header">
      <template #left>
        <button class="icon-button" @click="goHome">
          <n-icon :size="20"><ChevronBackOutline /></n-icon>
        </button>
        <div>
          <p class="eyebrow">IMAGE EXPERT</p>
          <h1>生图专家模式</h1>
        </div>
      </template>
      <template #right>
        <button class="ghost-action" @click="showApiSettings = true">
          <n-icon :size="18"><SettingsOutline /></n-icon>
          模型配置
        </button>
        <button class="primary-action" :disabled="isGenerating" @click="generateExpertImage">
          <n-spin v-if="isGenerating" :size="16" />
          <n-icon v-else :size="18"><SparklesOutline /></n-icon>
          生成图片
        </button>
      </template>
    </AppHeader>

    <main class="expert-main">
      <section class="expert-left">
        <article class="expert-card demand-card">
          <div class="section-title">
            <div>
              <span>01</span>
              <h2>描述需求</h2>
            </div>
            <button class="link-button" @click="randomTemplate">随机模板</button>
          </div>
          <textarea
            v-model="demand"
            class="demand-input"
            placeholder="例如：给一个新茶饮品牌生成 3 张广告主视觉，清爽、年轻、真实摄影感，适合小红书和门店海报。"
          ></textarea>
          <div class="template-list">
            <button v-for="item in quickTemplates" :key="item.title" @click="applyTemplate(item)">
              {{ item.title }}
            </button>
          </div>
          <div class="demand-actions">
            <button class="ghost-action" :disabled="promptLoading || !demand.trim()" @click="optimizePrompt">
              <n-spin v-if="promptLoading" :size="14" />
              <n-icon v-else :size="16"><CreateOutline /></n-icon>
              优化 Prompt
            </button>
            <button class="ghost-action" @click="fillPromptFromDemand">
              直接作为 Prompt
            </button>
          </div>
        </article>

        <article class="expert-card prompt-card">
          <div class="section-title">
            <div>
              <span>02</span>
              <h2>Prompt 工作区</h2>
            </div>
            <button class="link-button" @click="copyPrompt">复制 Prompt</button>
          </div>
          <label>
            <span>优化后的 Prompt</span>
            <textarea
              v-model="prompt"
              class="prompt-textarea"
              placeholder="这里会放优化后的生图提示词，也可以手动编辑。"
            ></textarea>
          </label>
          <label>
            <span>Negative Prompt</span>
            <textarea
              v-model="negativePrompt"
              class="negative-textarea"
              placeholder="例如：低清晰度、畸形手指、过曝、文字水印、重复主体。"
            ></textarea>
          </label>
        </article>

        <article class="expert-card reference-card">
          <div class="section-title">
            <div>
              <span>03</span>
              <h2>参考图</h2>
            </div>
            <button class="link-button" @click="referenceInputRef?.click()">上传</button>
          </div>
          <input
            ref="referenceInputRef"
            class="hidden-input"
            type="file"
            accept="image/*"
            multiple
            @change="handleReferenceFiles"
          />
          <div v-if="referenceImages.length" class="reference-grid">
            <figure v-for="image in referenceImages" :key="image.id">
              <img :src="image.url" :alt="image.name" />
              <figcaption>{{ image.name }}</figcaption>
              <button @click="removeReference(image.id)">移除</button>
            </figure>
          </div>
          <div v-else class="empty-reference" @click="referenceInputRef?.click()">
            <n-icon :size="28"><ImageOutline /></n-icon>
            <p>拖入或上传参考图，支持图生图和风格参考。</p>
          </div>
        </article>
      </section>

      <section class="expert-right">
        <article class="expert-card params-card">
          <div class="section-title">
            <div>
              <span>04</span>
              <h2>生成参数</h2>
            </div>
            <span class="status-pill" :class="{ ready: isImageReady }">
              {{ isImageReady ? '图片模型已就绪' : '请先配置图片模型' }}
            </span>
          </div>

          <div class="param-grid">
            <label>
              <span>模型</span>
              <select v-model="params.model">
                <option value="">选择图片模型</option>
                <option v-for="model in imageModelOptions" :key="model.key" :value="model.key">
                  {{ model.label || model.key }}
                </option>
              </select>
            </label>
            <label>
              <span>图片比例 / 尺寸</span>
              <select v-model="params.size">
                <option v-for="size in sizeOptions" :key="size.key" :value="size.key">
                  {{ size.label || size.key }}
                </option>
              </select>
            </label>
            <label>
              <span>生成数量</span>
              <select v-model.number="params.count">
                <option :value="1">1 张</option>
                <option :value="2">2 张</option>
                <option :value="3">3 张</option>
                <option :value="4">4 张</option>
              </select>
            </label>
            <label>
              <span>Seed</span>
              <input v-model="params.seed" placeholder="可留空随机" />
            </label>
          </div>

          <div class="style-presets">
            <span>风格预设</span>
            <button
              v-for="style in stylePresets"
              :key="style.name"
              :class="{ active: params.style === style.name }"
              @click="params.style = style.name"
            >
              {{ style.name }}
            </button>
          </div>

          <details class="advanced-box">
            <summary>高级参数</summary>
            <div class="param-grid">
              <label>
                <span>质量</span>
                <select v-model="params.quality">
                  <option value="">自动</option>
                  <option v-for="quality in qualityOptions" :key="quality.key" :value="quality.key">
                    {{ quality.label || quality.key }}
                  </option>
                </select>
              </label>
              <label>
                <span>创意强度</span>
                <input v-model="params.creativity" placeholder="例如 0.7，可选" />
              </label>
            </div>
          </details>
        </article>

        <article class="expert-card result-card">
          <div class="section-title">
            <div>
              <span>05</span>
              <h2>生成结果</h2>
            </div>
            <button class="link-button" :disabled="!results.length" @click="placeAllResultsIntoCanvas">
              全部放入画布
            </button>
          </div>

          <div v-if="isGenerating" class="result-state">
            <n-spin :size="28" />
            <p>正在生成图片，请稍等...</p>
          </div>
          <div v-else-if="generateError" class="result-state is-error">
            <strong>生成失败</strong>
            <p>{{ generateError }}</p>
          </div>
          <div v-else-if="!results.length" class="result-state">
            <n-icon :size="32"><ImagesOutline /></n-icon>
            <p>生成结果会显示在这里。先填写需求和参数，然后点击生成图片。</p>
          </div>
          <div v-else class="result-grid">
            <article v-for="(result, index) in results" :key="result.id" class="result-item">
              <img :src="result.url" :alt="`生成结果 ${index + 1}`" />
              <div class="result-actions">
                <button @click="regenerateFrom(result)">重新生成</button>
                <button @click="varyResult(result)">变化</button>
                <button @click="upscaleResult(result)">放大</button>
                <button @click="copyText(result.prompt)">复制 Prompt</button>
                <button @click="placeResultIntoCanvas(result)">放入画布</button>
                <button @click="saveResultProject(result)">保存项目</button>
              </div>
            </article>
          </div>
        </article>

        <article class="expert-card history-card">
          <div class="section-title">
            <div>
              <span>06</span>
              <h2>最近生成</h2>
            </div>
            <button class="link-button" :disabled="!history.length" @click="clearHistory">清空</button>
          </div>
          <div v-if="!history.length" class="history-empty">暂无历史。每次生成都会保存参数快照。</div>
          <button
            v-for="item in history"
            :key="item.id"
            class="history-item"
            @click="restoreHistory(item)"
          >
            <strong>{{ item.title }}</strong>
            <span>{{ item.model || '未选模型' }} · {{ item.size }} · {{ item.count }} 张</span>
          </button>
        </article>
      </section>
    </main>

    <ApiSettings v-model:show="showApiSettings" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, NSpin } from 'naive-ui'
import {
  ChevronBackOutline,
  CreateOutline,
  ImageOutline,
  ImagesOutline,
  SettingsOutline,
  SparklesOutline
} from '@vicons/ionicons5'
import AppHeader from '../components/AppHeader.vue'
import ApiSettings from '../components/ApiSettings.vue'
import { useChat, useImageGeneration } from '../hooks'
import { useModelStore } from '../stores/pinia'
import { getModelQualityOptions, getModelSizeOptions } from '../stores/models'
import { createProject, initProjectsStore, updateProjectCanvas } from '../stores/projects'

const router = useRouter()
const route = useRoute()
const modelStore = useModelStore()
const showApiSettings = ref(false)
const referenceInputRef = ref(null)

const demand = ref('')
const prompt = ref('')
const negativePrompt = ref('低清晰度、畸形、重复肢体、文字水印、过曝、压缩噪点')
const referenceImages = ref([])
const results = ref([])
const generateError = ref('')
const history = ref([])

const params = ref({
  model: '',
  size: '1024x1024',
  count: 1,
  seed: '',
  style: '真实摄影',
  quality: '',
  creativity: ''
})

const quickTemplates = [
  {
    title: '产品主视觉',
    demand: '为一款新茶饮品牌生成电商主图，清爽夏日、真实摄影、玻璃杯冷凝水、自然光、适合小红书封面。'
  },
  {
    title: '角色设定',
    demand: '生成一个原创国风少女角色设定图，正面半身，服装细节丰富，干净背景，适合后续做多角度分镜。'
  },
  {
    title: '电影海报',
    demand: '生成一张未来城市雨夜电影海报，霓虹灯、湿润街道反射、孤独主角、强烈纵深和高级色彩。'
  },
  {
    title: '社媒海报',
    demand: '生成一张适合朋友圈和小红书发布的活动海报，主体清晰、留白充足、真实材质、带高级商业摄影感。'
  }
]

const stylePresets = [
  { name: '真实摄影', prompt: '真实商业摄影，高级光影，真实材质，清晰主体' },
  { name: '电影感', prompt: '电影级构图，戏剧化光线，浅景深，高级调色' },
  { name: '国潮插画', prompt: '国潮视觉，精致插画，东方纹样，现代设计感' },
  { name: '产品棚拍', prompt: '干净棚拍布光，产品细节清晰，电商广告质感' },
  { name: '儿童绘本', prompt: '温暖儿童绘本插画，柔和色彩，友好角色设计' }
]

const imageModelOptions = computed(() => modelStore.imageModelOptions)
const isImageReady = computed(() => !!modelStore.currentImageApiKey && !!params.value.model)
const qualityOptions = computed(() => getModelQualityOptions(params.value.model))
const sizeOptions = computed(() => getModelSizeOptions(params.value.model, params.value.quality || 'standard'))

const {
  loading: imageLoading,
  error: imageError,
  generate
} = useImageGeneration()

const { loading: promptLoading, send: sendChat } = useChat({
  systemPrompt: '你是 YUFENG Canvas 的生图 Prompt 专家。把用户的中文需求整理成适合 AI 生图的高质量中文 Prompt，保留中文，不要翻译成英文。输出包含主体、场景、构图、光线、材质、风格、比例建议。只输出 Prompt 本文。'
})

const isGenerating = computed(() => imageLoading.value)

const loadHistory = () => {
  try {
    history.value = JSON.parse(localStorage.getItem('yufeng-image-expert-history') || '[]')
  } catch {
    history.value = []
  }
}

const saveHistory = () => {
  localStorage.setItem('yufeng-image-expert-history', JSON.stringify(history.value.slice(0, 12)))
}

const syncRoutePrompt = () => {
  const routePrompt = String(route.query.prompt || '').trim()
  if (routePrompt) {
    demand.value = routePrompt
    prompt.value = routePrompt
  }
}

const goHome = () => {
  router.push('/')
}

const applyTemplate = (item) => {
  demand.value = item.demand
  prompt.value = buildLocalPrompt(item.demand)
}

const randomTemplate = () => {
  const item = quickTemplates[Math.floor(Math.random() * quickTemplates.length)]
  applyTemplate(item)
}

const buildLocalPrompt = (value = demand.value) => {
  const style = stylePresets.find((item) => item.name === params.value.style)?.prompt || ''
  return [
    value.trim(),
    style,
    params.value.size ? `画面比例/尺寸：${params.value.size}` : '',
    '主体明确，构图稳定，细节丰富，画质清晰。'
  ].filter(Boolean).join('，')
}

const fillPromptFromDemand = () => {
  prompt.value = buildLocalPrompt()
}

const optimizePrompt = async () => {
  if (!demand.value.trim()) return

  if (!modelStore.currentChatApiKey || !modelStore.selectedChatModel) {
    prompt.value = buildLocalPrompt()
    window.$message?.info('未配置文本模型，已使用本地 Prompt 模板')
    return
  }

  try {
    const reply = await sendChat(`需求：${demand.value}\n风格：${params.value.style}\n尺寸：${params.value.size}`, true, {
      model: modelStore.selectedChatModel
    })
    prompt.value = reply || buildLocalPrompt()
  } catch (err) {
    prompt.value = buildLocalPrompt()
    window.$message?.warning(err.message || 'Prompt 优化失败，已使用本地模板')
  }
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = reject
  reader.readAsDataURL(file)
})

const handleReferenceFiles = async (event) => {
  const files = Array.from(event.target.files || [])
  const items = await Promise.all(files.map(async (file) => ({
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: file.name,
    url: await fileToDataUrl(file)
  })))
  referenceImages.value = [...referenceImages.value, ...items].slice(0, 6)
  event.target.value = ''
}

const removeReference = (id) => {
  referenceImages.value = referenceImages.value.filter((image) => image.id !== id)
}

const buildFinalPrompt = (base = prompt.value) => {
  return [
    base.trim() || buildLocalPrompt(),
    negativePrompt.value.trim() ? `Negative prompt: ${negativePrompt.value.trim()}` : '',
    params.value.seed ? `Seed: ${params.value.seed}` : ''
  ].filter(Boolean).join('\n')
}

const normalizeResultUrl = (item) => item?.url || item?.b64_json || item?.base64 || ''

const snapshotParams = () => ({
  ...params.value,
  prompt: prompt.value,
  negativePrompt: negativePrompt.value,
  demand: demand.value,
  references: referenceImages.value.map((image) => ({ id: image.id, name: image.name }))
})

const pushHistory = () => {
  const item = {
    id: `history_${Date.now()}`,
    title: (demand.value || prompt.value || '未命名生图任务').slice(0, 32),
    model: params.value.model,
    size: params.value.size,
    count: params.value.count,
    snapshot: snapshotParams(),
    createdAt: new Date().toISOString()
  }
  history.value = [item, ...history.value].slice(0, 12)
  saveHistory()
}

const generateExpertImage = async () => {
  if (!params.value.model) {
    showApiSettings.value = true
    window.$message?.warning('请先选择图片模型')
    return
  }

  generateError.value = ''
  if (!prompt.value.trim()) {
    fillPromptFromDemand()
  }

  try {
    const finalPrompt = buildFinalPrompt()
    const generated = await generate({
      model: params.value.model,
      prompt: finalPrompt,
      size: params.value.size,
      n: params.value.count,
      quality: params.value.quality || undefined,
      image: referenceImages.value.map((image) => image.url)
    })
    results.value = generated.map((item, index) => ({
      id: `result_${Date.now()}_${index}`,
      url: normalizeResultUrl(item),
      raw: item,
      prompt: finalPrompt,
      params: snapshotParams()
    })).filter((item) => item.url)
    pushHistory()
  } catch (err) {
    generateError.value = err.message || imageError.value?.message || '图片生成失败'
  }
}

const copyText = async (text) => {
  try {
    await navigator.clipboard?.writeText(text || '')
    window.$message?.success('已复制')
  } catch {
    window.$message?.info(text || '')
  }
}

const copyPrompt = () => copyText(prompt.value)

const regenerateFrom = async (result) => {
  prompt.value = result.prompt
  await generateExpertImage()
}

const varyResult = (result) => {
  referenceImages.value = [{
    id: `ref_${Date.now()}`,
    name: '上一张结果',
    url: result.url
  }]
  prompt.value = `${result.prompt}\n请基于参考图做一个构图和细节变化版本，保持主体一致。`
  window.$message?.success('已把结果作为参考图，可继续生成变化版本')
}

const upscaleResult = (result) => {
  referenceImages.value = [{
    id: `ref_${Date.now()}`,
    name: '待放大结果',
    url: result.url
  }]
  prompt.value = `${result.prompt}\n请放大并增强细节，保持原图构图、主体和风格。`
  params.value.quality = params.value.quality || 'hd'
  window.$message?.success('已进入放大配置，可继续生成')
}

const buildCanvasData = (resultList = results.value) => {
  const now = Date.now()
  const textId = `expert_text_${now}`
  const configId = `expert_config_${now}`
  const imageNodes = resultList.map((result, index) => ({
    id: `expert_image_${now}_${index}`,
    type: 'image',
    position: { x: 760, y: 120 + index * 320 },
    data: {
      label: `生成结果 ${index + 1}`,
      url: result.url,
      prompt: result.prompt,
      model: params.value.model,
      size: params.value.size,
      status: 'success',
      createdAt: now,
      updatedAt: now,
      publicProps: { name: `生成图 ${index + 1}` }
    }
  }))

  return {
    nodes: [
      {
        id: textId,
        type: 'text',
        position: { x: 120, y: 140 },
        data: { label: '需求 / Prompt', content: buildFinalPrompt(), status: 'success', createdAt: now, updatedAt: now }
      },
      {
        id: configId,
        type: 'imageConfig',
        position: { x: 430, y: 140 },
        data: {
          label: '生图专家配置',
          prompt: buildFinalPrompt(),
          negativePrompt: negativePrompt.value,
          model: params.value.model,
          size: params.value.size,
          count: params.value.count,
          seed: params.value.seed,
          status: 'success',
          createdAt: now,
          updatedAt: now
        }
      },
      ...imageNodes
    ],
    edges: [
      { id: `edge_${textId}_${configId}`, source: textId, target: configId, sourceHandle: 'right', targetHandle: 'left', type: 'promptOrder', data: { promptOrder: 1 } },
      ...imageNodes.map((node) => ({
        id: `edge_${configId}_${node.id}`,
        source: configId,
        target: node.id,
        sourceHandle: 'right',
        targetHandle: 'left'
      }))
    ],
    viewport: { x: 80, y: 50, zoom: 0.82 }
  }
}

const saveResultProject = (result) => {
  initProjectsStore()
  const id = createProject((demand.value || '生图专家项目').slice(0, 24))
  updateProjectCanvas(id, buildCanvasData([result]))
  window.$message?.success('已保存到项目')
}

const placeResultIntoCanvas = (result) => {
  initProjectsStore()
  const id = createProject((demand.value || '生图专家画布').slice(0, 24))
  updateProjectCanvas(id, buildCanvasData([result]))
  router.push(`/canvas/${id}`)
}

const placeAllResultsIntoCanvas = () => {
  if (!results.value.length) return
  initProjectsStore()
  const id = createProject((demand.value || '生图专家画布').slice(0, 24))
  updateProjectCanvas(id, buildCanvasData(results.value))
  router.push(`/canvas/${id}`)
}

const restoreHistory = (item) => {
  const snapshot = item.snapshot || {}
  demand.value = snapshot.demand || ''
  prompt.value = snapshot.prompt || ''
  negativePrompt.value = snapshot.negativePrompt || ''
  params.value = {
    ...params.value,
    model: snapshot.model || params.value.model,
    size: snapshot.size || params.value.size,
    count: snapshot.count || params.value.count,
    seed: snapshot.seed || '',
    style: snapshot.style || params.value.style,
    quality: snapshot.quality || '',
    creativity: snapshot.creativity || ''
  }
  window.$message?.success('已恢复这次生成配置')
}

const clearHistory = () => {
  history.value = []
  saveHistory()
}

watch(() => params.value.model, (model) => {
  const sizes = getModelSizeOptions(model, params.value.quality || 'standard')
  if (sizes.length && !sizes.some((item) => item.key === params.value.size)) {
    params.value.size = sizes[0].key
  }
})

onMounted(() => {
  initProjectsStore()
  loadHistory()
  params.value.model = modelStore.selectedImageModel || modelStore.availableImageModels[0]?.key || ''
  const sizes = getModelSizeOptions(params.value.model)
  params.value.size = sizes[0]?.key || '1024x1024'
  syncRoutePrompt()
})
</script>

<style scoped>
.image-expert-shell {
  min-height: 100vh;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 14% 18%, rgba(45, 212, 191, 0.18), transparent 28%),
    radial-gradient(circle at 88% 8%, rgba(56, 189, 248, 0.16), transparent 26%),
    linear-gradient(135deg, rgba(240, 253, 250, 0.94), rgba(248, 250, 252, 0.98));
}

.dark .image-expert-shell {
  background:
    radial-gradient(circle at 14% 18%, rgba(45, 212, 191, 0.18), transparent 28%),
    radial-gradient(circle at 88% 8%, rgba(56, 189, 248, 0.12), transparent 26%),
    linear-gradient(135deg, #020617, #052e2b 55%, #031b2c);
}

.expert-header {
  margin: 16px;
  border-radius: 28px;
}

.expert-header h1 {
  margin: 0;
  font-size: 22px;
}

.eyebrow {
  margin: 0;
  color: #14b8a6;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.expert-main {
  display: grid;
  grid-template-columns: minmax(360px, 0.92fr) minmax(460px, 1.08fr);
  gap: 18px;
  padding: 0 18px 28px;
}

.expert-left,
.expert-right {
  display: grid;
  gap: 16px;
  align-content: start;
}

.expert-card {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 28px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 20px 70px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.dark .expert-card {
  background: rgba(15, 23, 42, 0.58);
  border-color: rgba(148, 163, 184, 0.18);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-title span:first-child {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: #0f766e;
  background: rgba(20, 184, 166, 0.16);
  font-weight: 800;
  font-size: 12px;
}

.section-title h2 {
  margin: 0;
  font-size: 18px;
}

textarea,
input,
select {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  padding: 12px 14px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.68);
  outline: none;
}

.dark textarea,
.dark input,
.dark select {
  background: rgba(15, 23, 42, 0.52);
}

textarea:focus,
input:focus,
select:focus {
  border-color: rgba(20, 184, 166, 0.75);
  box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.14);
}

label > span,
.style-presets > span {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.demand-input {
  min-height: 150px;
}

.prompt-textarea {
  min-height: 170px;
}

.negative-textarea {
  min-height: 88px;
}

.template-list,
.demand-actions,
.style-presets,
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

button {
  border: 0;
  cursor: pointer;
}

.icon-button,
.ghost-action,
.primary-action,
.link-button,
.template-list button,
.style-presets button,
.result-actions button,
.history-item {
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 999px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.58);
  /* transition removed for static rendering */
}

.icon-button {
  width: 42px;
  height: 42px;
}

.ghost-action,
.primary-action,
.link-button,
.template-list button,
.style-presets button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
}

.primary-action {
  color: white;
  background: linear-gradient(135deg, #10b981, #06b6d4);
  box-shadow: 0 14px 32px rgba(6, 182, 212, 0.24);
}

.link-button {
  padding: 8px 12px;
  color: #0f766e;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(20, 184, 166, 0.7);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.style-presets button.active {
  color: #064e3b;
  border-color: rgba(20, 184, 166, 0.75);
  background: rgba(45, 212, 191, 0.22);
}

.advanced-box {
  margin-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  padding-top: 12px;
}

.advanced-box summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: 700;
}

.hidden-input {
  display: none;
}

.reference-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.reference-grid figure {
  margin: 0;
  position: relative;
}

.reference-grid img,
.result-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 18px;
}

.reference-grid figcaption {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reference-grid figure button {
  position: absolute;
  right: 8px;
  top: 8px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: white;
  font-size: 11px;
}

.empty-reference,
.result-state,
.history-empty {
  min-height: 150px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--text-secondary);
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 22px;
  padding: 18px;
}

.status-pill {
  padding: 6px 10px;
  border-radius: 999px;
  color: #b45309;
  background: rgba(251, 191, 36, 0.18);
  font-size: 12px;
}

.status-pill.ready {
  color: #047857;
  background: rgba(16, 185, 129, 0.16);
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.result-item {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 22px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.04);
}

.result-actions button {
  padding: 7px 9px;
  font-size: 12px;
}

.result-state.is-error {
  color: #dc2626;
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(254, 226, 226, 0.22);
}

.history-card {
  max-height: 300px;
  overflow: auto;
}

.history-item {
  width: 100%;
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  margin-top: 8px;
  text-align: left;
  border-radius: 18px;
}

.history-item span {
  color: var(--text-secondary);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .expert-main {
    grid-template-columns: 1fr;
  }

  .param-grid,
  .result-grid {
    grid-template-columns: 1fr;
  }
}
</style>
