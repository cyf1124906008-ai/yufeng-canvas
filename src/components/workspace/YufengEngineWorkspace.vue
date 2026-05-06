<template>
  <aside class="engine-workspace-panel absolute right-4 top-20 z-20 w-[340px] max-h-[calc(100vh-12rem)] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/[0.88] text-white shadow-2xl backdrop-blur-xl">
    <div class="border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-emerald-500/10 to-transparent p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-[0.22em] text-emerald-100/60">YUFENG Cloud Creative Workspace</p>
          <h3 class="text-sm font-semibold">云端模型工作流 + 短剧工作区</h3>
          <span class="text-[11px] text-white/55">用 API 模型直接创建节点、项目结构、镜头表和可执行工作流。</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span class="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-100">v1.0.1</span>
          <button class="rounded-full border border-white/10 bg-white/[0.08] px-2 py-1 text-[10px] text-white/70 hover:bg-white/[0.14]" @click="$emit('close')">收起</button>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          class="rounded-2xl px-3 py-2 text-xs font-semibold transition-colors"
          :class="activeTab === 'comfy' ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'"
          @click="activeTab = 'comfy'"
        >
          云端专业工作流
        </button>
        <button
          class="rounded-2xl px-3 py-2 text-xs font-semibold transition-colors"
          :class="activeTab === 'drama' ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'"
          @click="activeTab = 'drama'"
        >
          短剧 Drama
        </button>
      </div>
    </div>

    <div class="max-h-[calc(100vh-18rem)] overflow-y-auto p-3">
      <section v-if="activeTab === 'comfy'" class="space-y-3">
        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">云端工作流执行</strong>
            <span class="rounded-full bg-emerald-300/15 px-2 py-0.5 text-[10px] text-emerald-100">API 优先</span>
          </div>
          <p class="text-[11px] leading-relaxed text-white/62">
            使用你配置的云端图片/视频模型执行专业参数工作流。在设置中配置 API Key 和 Base URL 即可开始。
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="shell-action" @click="$emit('action', 'openCloudModelSettings')">模型 API 设置</button>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">画布节点</strong>
            <span class="text-[10px] text-white/45">{{ assetNodes.length }} 个</span>
          </div>
          <div v-if="!assetNodes.length" class="rounded-xl bg-black/20 p-3 text-[11px] text-white/55">
            还没有图片或视频节点。使用 AI 控制台或拖拽创建节点后，生成结果会显示在这里。
          </div>
          <div v-else class="space-y-2">
            <div v-for="node in assetNodes.slice(0, 10)" :key="node.id" class="rounded-xl bg-black/20 p-2">
              <div class="flex items-center justify-between gap-2">
                <b class="truncate text-xs text-white">{{ node.data?.label || node.id }}</b>
                <span class="rounded-full px-2 py-0.5 text-[10px]" :class="node.data?.status === 'success' ? 'bg-emerald-300/15 text-emerald-100' : node.data?.status === 'error' ? 'bg-red-300/15 text-red-100' : 'bg-white/[0.08] text-white/55'">
                  {{ node.data?.status || 'idle' }}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="mini-action" @click="$emit('action', 'focusNode', node.id)">定位</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="space-y-3">
        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">Drama 项目状态</strong>
            <span class="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">{{ projectTypeLabel }}</span>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center text-[11px]">
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.characterCount }}</b><span class="text-white/45">角色</span></div>
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.locationCount }}</b><span class="text-white/45">场景</span></div>
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.episodeCount }}</b><span class="text-white/45">分集</span></div>
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.shotCount }}</b><span class="text-white/45">镜头</span></div>
          </div>
          <p class="mt-2 line-clamp-2 text-[11px] text-white/55">{{ dramaSummary.premise || '还没有短剧设定。点击下方按钮会创建真实项目结构和画布节点。' }}</p>
          <!-- Pipeline progress -->
          <div class="mt-3 flex items-center gap-1">
            <div
              v-for="(stage, i) in pipelineStages"
              :key="stage.id"
              class="flex-1 flex flex-col items-center gap-1"
            >
              <div
                class="w-full h-1.5 rounded-full transition-colors"
                :class="stage.completed ? 'bg-emerald-400' : 'bg-white/10'"
                :title="stage.title"
              ></div>
              <span class="text-[9px] text-white/40 truncate w-full text-center">{{ stage.title }}</span>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="shell-action primary" @click="$emit('action', 'createDramaWorkspace')">创建短剧工作区</button>
            <button class="shell-action" @click="$emit('action', 'createDramaShots')">生成 8 分镜</button>
            <button class="shell-action" @click="$emit('action', 'createCharacterBible')">角色一致性</button>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">镜头表（与画布同步）</strong>
            <span class="text-[10px] text-white/45">{{ shotList.length }} 条</span>
          </div>
          <div v-if="!shotList.length" class="rounded-xl bg-black/20 p-3 text-[11px] text-white/55">
            还没有镜头。点击“生成 8 分镜”会创建 drama.shots，并在画布生成镜头描述、首帧、视频三个节点链路。
          </div>
          <div v-else class="space-y-2">
            <div v-for="shot in shotList" :key="shot.id" class="rounded-xl bg-black/20 p-2">
              <div class="flex items-center justify-between gap-2">
                <b class="truncate text-xs text-white">{{ shot.index }}. {{ shot.title }}</b>
                <select class="status-select" :value="shot.status" @change="updateShotStatus(shot, $event.target.value)">
                  <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <p class="mt-1 line-clamp-2 text-[11px] text-white/48">{{ shot.description || shot.prompt }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="mini-action" @click="focusShot(shot, 'text')">定位描述</button>
                <button class="mini-action" @click="focusShot(shot, 'firstFrame')">定位首帧</button>
                <button class="mini-action" @click="focusShot(shot, 'video')">定位视频</button>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">项目资产节点</strong>
            <span class="text-[10px] text-white/45">{{ assetNodes.length }} 个</span>
          </div>
          <div v-if="!assetNodes.length" class="rounded-xl bg-black/20 p-3 text-[11px] text-white/55">生成图片或视频后会在这里列出，可直接定位到画布。</div>
          <div v-else class="space-y-1">
            <button v-for="node in assetNodes.slice(0, 8)" :key="node.id" class="w-full rounded-xl bg-black/20 px-2 py-1.5 text-left text-[11px] text-white/65 hover:bg-white/[0.08]" @click="$emit('action', 'focusNode', node.id)">
              {{ node.data?.label || node.id }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { currentProject } from '@/stores/projects'
import { nodes } from '@/stores/canvas'
import { DRAMA_STATUS_LABELS, summarizeDramaProject, DRAMA_PIPELINE_STAGES } from '@/integrations/drama/dramaWorkspace'

const emit = defineEmits(['action', 'close'])

const activeTab = ref('comfy')

const assetNodes = computed(() => nodes.value.filter(node => ['image', 'video', 'imageConfig', 'videoConfig'].includes(node.type)))
const dramaSummary = computed(() => summarizeDramaProject(currentProject.value))
const shotList = computed(() => Array.isArray(currentProject.value?.drama?.shots) ? currentProject.value.drama.shots : [])
const statusOptions = computed(() => Object.entries(DRAMA_STATUS_LABELS).map(([value, label]) => ({ value, label })))
const projectTypeLabel = computed(() => currentProject.value?.type === 'drama' ? '短剧项目' : '可升级为短剧')

const pipelineStages = computed(() => {
  const s = dramaSummary.value
  return DRAMA_PIPELINE_STAGES.map((stage) => {
    let completed = false
    if (stage.id === 'idea') completed = !!s.premise
    else if (stage.id === 'bible') completed = s.characterCount > 0
    else if (stage.id === 'episode') completed = s.episodeCount > 0
    else if (stage.id === 'shotlist') completed = s.shotCount > 0
    else if (stage.id === 'firstframes') completed = s.readyShotCount > 0
    else if (stage.id === 'videos') completed = s.shotCount > 0 && shotList.value.some(sh => sh.status === 'videoReady')
    return { ...stage, completed }
  })
})

function updateShotStatus(shot, status) {
  emit('action', 'updateDramaShotStatus', { shotId: shot.id, status })
}

function focusShot(shot, kind) {
  const nodeId = shot.nodeIds?.[kind] || shot.nodeIds?.text || shot.nodeIds?.firstFrame || shot.nodeIds?.video
  if (nodeId) emit('action', 'focusNode', nodeId)
}
</script>

<style scoped>
.shell-action {
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.78);
  font-size: 11px;
  line-height: 1;
  padding: 8px 10px;
  transition: border-color .16s ease, background .16s ease, color .16s ease;
}
.shell-action:hover {
  border-color: rgba(110, 231, 183, 0.45);
  background: rgba(255,255,255,0.12);
  color: white;
}
.shell-action.primary,
.mini-action.primary {
  border-color: transparent;
  background: #34d399;
  color: #020617;
  font-weight: 700;
}
.mini-action {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.72);
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
}
.mini-action:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.status-select {
  max-width: 104px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.95);
  color: rgba(255,255,255,0.78);
  font-size: 10px;
  padding: 3px 6px;
  outline: none;
}
</style>
