<template>
  <aside class="engine-workspace-panel absolute right-4 top-20 z-20 w-[360px] max-h-[calc(100vh-8rem)] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/[0.86] text-white shadow-2xl backdrop-blur-xl">
    <div class="border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-emerald-500/10 to-transparent p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-[0.22em] text-emerald-100/60">Integrated Shell</p>
          <h3 class="text-sm font-semibold">ComfyUI + huobao-drama 套壳工作区</h3>
          <span class="text-[11px] text-white/55">底层保留原能力，YUFENG 负责中文包装、项目化和 AI 操控。</span>
        </div>
        <span class="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-100">v0.1.47</span>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          class="rounded-2xl px-3 py-2 text-xs font-semibold transition-colors"
          :class="activeTab === 'comfy' ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'"
          @click="activeTab = 'comfy'"
        >
          ComfyUI 本地引擎
        </button>
        <button
          class="rounded-2xl px-3 py-2 text-xs font-semibold transition-colors"
          :class="activeTab === 'drama' ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.12]'"
          @click="activeTab = 'drama'"
        >
          短剧 Drama 工作区
        </button>
      </div>
    </div>

    <div class="max-h-[calc(100vh-15rem)] overflow-y-auto p-3">
      <section v-if="activeTab === 'comfy'" class="space-y-3">
        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <strong class="text-sm">ComfyUI Shell 状态</strong>
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
          <strong class="text-sm">YUFENG 对 Comfy 的套壳层</strong>
          <ol class="mt-2 space-y-2">
            <li v-for="layer in comfyLayers" :key="layer.id" class="rounded-xl bg-black/20 p-2">
              <div class="flex items-center justify-between gap-2">
                <b class="text-xs text-white">{{ layer.title }}</b>
                <span class="text-[10px] text-white/38">{{ layer.visibleToUser ? '用户可见' : '后台封装' }}</span>
              </div>
              <p class="mt-1 text-[11px] leading-relaxed text-white/55">{{ layer.description }}</p>
            </li>
          </ol>
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
            <strong class="text-sm">Drama Workspace 项目状态</strong>
            <span class="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">{{ projectTypeLabel }}</span>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center text-[11px]">
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.characterCount }}</b><span class="text-white/45">角色</span></div>
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.locationCount }}</b><span class="text-white/45">场景</span></div>
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.episodeCount }}</b><span class="text-white/45">分集</span></div>
            <div class="rounded-xl bg-black/20 p-2"><b class="block text-base">{{ dramaSummary.shotCount }}</b><span class="text-white/45">镜头</span></div>
          </div>
          <p class="mt-2 line-clamp-2 text-[11px] text-white/55">{{ dramaSummary.premise || '还没有短剧设定。点击下面按钮会把当前项目升级为短剧项目，并创建镜头表和首帧节点。' }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="shell-action primary" @click="$emit('action', 'createDramaWorkspace')">创建短剧工作区</button>
            <button class="shell-action" @click="$emit('action', 'createDramaShots')">生成 8 分镜</button>
            <button class="shell-action" @click="$emit('action', 'createCharacterBible')">角色一致性</button>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <strong class="text-sm">huobao-drama 套壳模块</strong>
          <div class="mt-2 grid gap-2">
            <div v-for="section in dramaSections" :key="section.id" class="rounded-xl bg-black/20 p-2">
              <b class="text-xs text-white">{{ section.title }}</b>
              <p class="mt-1 text-[11px] leading-relaxed text-white/55">{{ section.description }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <strong class="text-sm">短剧生产流水线</strong>
          <ol class="mt-2 space-y-1">
            <li v-for="(stage, index) in dramaStages" :key="stage.id" class="flex items-center gap-2 rounded-xl bg-black/20 px-2 py-1.5 text-[11px]">
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-100">{{ index + 1 }}</span>
              <span class="flex-1 text-white/72">{{ stage.title }}</span>
              <span class="text-white/35">{{ stage.status === 'ready' ? '可执行' : '等待' }}</span>
            </li>
          </ol>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { currentProject } from '@/stores/projects'
import { useComfyStore } from '@/stores/comfy'
import { COMFY_SHELL_LAYERS, COMFY_WRAPPER_TEMPLATES, getComfyShellSummary } from '@/integrations/comfy/yufengComfyShell'
import { DRAMA_PIPELINE_STAGES, DRAMA_WORKSPACE_SECTIONS, summarizeDramaProject } from '@/integrations/drama/dramaWorkspace'

const emit = defineEmits(['action'])
void emit

const activeTab = ref('comfy')
const comfyStore = useComfyStore()

onMounted(() => {
  comfyStore.refreshStatus?.()
})

const comfyLayers = COMFY_SHELL_LAYERS
const comfyTemplates = COMFY_WRAPPER_TEMPLATES
const dramaSections = DRAMA_WORKSPACE_SECTIONS
const dramaStages = DRAMA_PIPELINE_STAGES
const comfySummary = computed(() => getComfyShellSummary(comfyStore.state.value))
const dramaSummary = computed(() => summarizeDramaProject(currentProject.value))
const projectTypeLabel = computed(() => currentProject.value?.type === 'drama' ? '短剧项目' : '可升级为短剧')
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
.shell-action.primary {
  border-color: transparent;
  background: #34d399;
  color: #020617;
  font-weight: 700;
}
</style>
