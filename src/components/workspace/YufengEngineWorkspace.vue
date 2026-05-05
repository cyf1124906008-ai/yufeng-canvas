<template>
  <aside class="engine-workspace-panel absolute right-4 top-20 z-20 w-[380px] max-h-[calc(100vh-8rem)] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/[0.88] text-white shadow-2xl backdrop-blur-xl">
    <div class="border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-emerald-500/10 to-transparent p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-[0.22em] text-emerald-100/60">YUFENG Integrated Workspace</p>
          <h3 class="text-sm font-semibold">ComfyUI + Drama 原生工作区</h3>
          <span class="text-[11px] text-white/55">这里的按钮会直接创建节点、项目结构、镜头表或执行工作流。</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span class="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-100">v0.1.47</span>
          <button class="rounded-full border border-white/10 bg-white/[0.08] px-2 py-1 text-[10px] text-white/70 hover:bg-white/[0.14]" @click="$emit('close')">收起</button>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          class="rounded-2xl px-3 py-2 text-xs font-semibold transition-colors"
          :class="activeTab === 'comfy' ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'"
          @click="activeTab = 'comfy'"
        >
          Comfy 本地引擎
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

    <div class="max-h-[calc(100vh-15rem)] overflow-y-auto p-3">
      <section v-if="activeTab === 'comfy'" class="space-y-3">
        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">Comfy 引擎状态</strong>
            <span class="rounded-full px-2 py-0.5 text-[10px]" :class="comfySummary.connected ? 'bg-emerald-300/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100'">
              {{ comfySummary.statusLabel }}
            </span>
          </div>
          <dl class="grid grid-cols-2 gap-2 text-[11px] text-white/62">
            <div><dt>API</dt><dd class="truncate text-white">{{ comfySummary.baseUrl }}</dd></div>
            <div><dt>节点类型</dt><dd class="text-white">{{ comfySummary.objectInfoCount }}</dd></div>
          </dl>
          <p v-if="comfySummary.error" class="mt-2 rounded-xl bg-red-500/10 px-2 py-1 text-[11px] text-red-100">{{ comfySummary.error }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="shell-action primary" @click="$emit('action', 'openComfySettings')">安装/启动/连接</button>
            <button class="shell-action" @click="$emit('action', 'openWorkflowImport')">导入 API workflow</button>
            <button class="shell-action" @click="$emit('action', 'createComfyWrapper')">生成包装节点</button>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">画布里的 Comfy 工作流</strong>
            <span class="text-[10px] text-white/45">{{ comfyNodes.length }} 个</span>
          </div>
          <div v-if="!comfyNodes.length" class="rounded-xl bg-black/20 p-3 text-[11px] text-white/55">
            还没有 Comfy 节点。导入 API workflow 会生成可编辑、可运行的中文表单节点。
          </div>
          <div v-else class="space-y-2">
            <div v-for="node in comfyNodes" :key="node.id" class="rounded-xl bg-black/20 p-2">
              <div class="flex items-center justify-between gap-2">
                <b class="truncate text-xs text-white">{{ node.data?.label || node.id }}</b>
                <span class="rounded-full px-2 py-0.5 text-[10px]" :class="node.data?.status === 'success' ? 'bg-emerald-300/15 text-emerald-100' : node.data?.status === 'error' ? 'bg-red-300/15 text-red-100' : 'bg-white/[0.08] text-white/55'">
                  {{ node.data?.status || 'idle' }}
                </span>
              </div>
              <p class="mt-1 line-clamp-2 text-[11px] text-white/45">{{ node.data?.error || node.data?.prompt || '已绑定 workflow，可运行或继续修改参数。' }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="mini-action" @click="$emit('action', 'focusNode', node.id)">定位</button>
                <button class="mini-action primary" :disabled="!node.data?.apiWorkflow" @click="$emit('action', 'runComfyWorkflow', node.id)">运行</button>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <strong class="text-sm">Comfy 包装模板</strong>
          <div class="mt-2 space-y-2">
            <button
              v-for="template in comfyTemplates"
              :key="template.id"
              class="w-full rounded-xl border border-white/10 bg-black/20 p-2 text-left hover:border-emerald-300/40"
              @click="$emit('action', 'createComfyWrapper', template.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <b class="text-xs">{{ template.title }}</b>
                <span class="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-white/55">{{ template.level }}</span>
              </div>
              <p class="mt-1 text-[11px] text-white/48">输入：{{ template.fields.slice(0, 4).join(' / ') }}</p>
              <p class="mt-1 text-[11px] text-emerald-100/60">输出：{{ template.outputs.join(' / ') }}</p>
            </button>
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
import { computed, onMounted, ref } from 'vue'
import { currentProject } from '@/stores/projects'
import { nodes } from '@/stores/canvas'
import { useComfyStore } from '@/stores/comfy'
import { COMFY_WRAPPER_TEMPLATES, getComfyShellSummary } from '@/integrations/comfy/yufengComfyShell'
import { DRAMA_STATUS_LABELS, summarizeDramaProject } from '@/integrations/drama/dramaWorkspace'

const emit = defineEmits(['action', 'close'])

const activeTab = ref('comfy')
const comfyStore = useComfyStore()

onMounted(() => {
  comfyStore.refreshStatus?.()
})

const comfyTemplates = COMFY_WRAPPER_TEMPLATES
const comfySummary = computed(() => getComfyShellSummary(comfyStore.state.value))
const comfyNodes = computed(() => nodes.value.filter(node => node.type === 'comfyWorkflow'))
const assetNodes = computed(() => nodes.value.filter(node => ['image', 'video'].includes(node.type) && (node.data?.url || node.data?.assetPath)))
const dramaSummary = computed(() => summarizeDramaProject(currentProject.value))
const shotList = computed(() => Array.isArray(currentProject.value?.drama?.shots) ? currentProject.value.drama.shots : [])
const statusOptions = computed(() => Object.entries(DRAMA_STATUS_LABELS).map(([value, label]) => ({ value, label })))
const projectTypeLabel = computed(() => currentProject.value?.type === 'drama' ? '短剧项目' : '可升级为短剧')

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
