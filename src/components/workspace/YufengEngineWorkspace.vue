<template>
  <aside class="engine-workspace-panel absolute right-4 top-20 z-20 w-[340px] max-h-[calc(100vh-12rem)] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/[0.88] text-white shadow-2xl backdrop-blur-xl">
    <div class="border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-emerald-500/10 to-transparent p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-[0.22em] text-emerald-100/60">YUFENG Cloud Creative Workspace</p>
          <h3 class="text-sm font-semibold">云端模型工作流 + 短剧工作区</h3>
        </div>
        <div class="flex shrink-0 items-center gap-2">
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
            <button class="shell-action primary" @click="$emit('action', 'createCloudImageWorkflow')">创建云端专业工作流</button>
          </div>
        </div>
      </section>

      <DramaWorkspacePanel
        v-if="activeTab === 'drama'"
        @action="(a, p) => $emit('action', a, p)"
        @close="$emit('close')"
      />
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import DramaWorkspacePanel from './DramaWorkspacePanel.vue'

const props = defineProps({
  initialTab: { type: String, default: 'comfy' }
})
defineEmits(['action', 'close'])

const activeTab = ref(props.initialTab)
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
