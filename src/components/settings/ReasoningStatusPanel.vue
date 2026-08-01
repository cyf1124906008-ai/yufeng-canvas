<template>
  <section v-if="visible" class="reasoning-status-panel" aria-live="polite" aria-label="Max 推理公开执行状态">
    <header>
      <span class="reasoning-orb" aria-hidden="true"><i></i><i></i><i></i></span>
      <div>
        <span>MAX REASONING</span>
        <strong>高级执行状态</strong>
        <small>{{ activeTool ? `正在调用 ${activeTool}` : currentStageCopy }}</small>
      </div>
      <span class="progress-value">{{ progress }}%</span>
    </header>

    <div class="progress-track" aria-hidden="true"><i :style="{ width: `${progress}%` }"></i></div>

    <ol class="reasoning-stages">
      <li v-for="(stage, index) in stages" :key="stage.id" :class="`is-${stage.status}`">
        <span class="stage-node">
          <workbench-icon v-if="stage.status === 'completed'" name="check" :size="12" />
          <i v-else></i>
        </span>
        <div><strong>{{ stage.label }}</strong><small>{{ stage.evidence || stage.description }}</small></div>
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
      </li>
    </ol>

    <footer>
      <workbench-icon name="eye" :size="13" />
      <span>仅依据公开计划、工具调用与结果状态推导；不展示或模拟隐藏思维链。</span>
    </footer>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import {
  activePublicToolLabel,
  deriveReasoningStages,
  normalizeReasoningEffort,
  reasoningProgress
} from './reasoningView.js'

defineOptions({ name: 'ReasoningStatusPanel' })

const props = defineProps({
  effort: { type: String, default: 'auto' },
  running: { type: Boolean, default: false },
  status: { type: String, default: '' },
  plan: { type: Object, default: null },
  toolCalls: { type: Array, default: () => [] },
  observations: { type: Array, default: () => [] }
})

const visible = computed(() => normalizeReasoningEffort(props.effort) === 'max' && props.running)
const stages = computed(() => deriveReasoningStages({
  running: props.running,
  status: props.status,
  plan: props.plan,
  toolCalls: props.toolCalls,
  observations: props.observations
}))
const progress = computed(() => reasoningProgress(stages.value))
const activeTool = computed(() => activePublicToolLabel(props.toolCalls))
const currentStageCopy = computed(() => {
  const active = stages.value.find(stage => stage.status === 'running')
  return active ? `${active.label} · ${active.description}` : '等待公开运行事件'
})
</script>

<style scoped>
.reasoning-status-panel { --reasoning-accent: #b98ee0; overflow: hidden; border: 1px solid color-mix(in srgb,var(--reasoning-accent) 28%,var(--sc-border,#343839)); border-radius: 10px; color: var(--sc-text,#e5e9e7); background: radial-gradient(circle at 9% 0%,rgba(167,104,214,.12),transparent 34%),linear-gradient(145deg,var(--sc-panel,#1b1e20),color-mix(in srgb,#352541 15%,var(--sc-panel,#1b1e20))); box-shadow: 0 16px 46px rgba(0,0,0,.12); }
.reasoning-status-panel > header { display: grid; grid-template-columns: 40px minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 12px 13px 9px; }
.reasoning-orb { position: relative; display: grid; width: 38px; height: 38px; place-items: center; }
.reasoning-orb i { position: absolute; border: 1px solid color-mix(in srgb,var(--reasoning-accent) 58%,transparent); border-radius: 50%; animation: reasoning-orbit 2.8s linear infinite; }
.reasoning-orb i:nth-child(1) { width: 30px; height: 30px; }
.reasoning-orb i:nth-child(2) { width: 21px; height: 21px; animation-direction: reverse; animation-duration: 2.1s; }
.reasoning-orb i:nth-child(3) { width: 7px; height: 7px; border: 0; background: var(--reasoning-accent); box-shadow: 0 0 16px rgba(185,142,224,.65); animation: reasoning-pulse 850ms ease-in-out infinite alternate; }
.reasoning-status-panel header > div { min-width: 0; }
.reasoning-status-panel header > div > span,
.reasoning-status-panel header strong,
.reasoning-status-panel header small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reasoning-status-panel header > div > span { color: var(--reasoning-accent); font: 8px ui-monospace,SFMono-Regular,Menlo,monospace; font-weight: 800; letter-spacing: .12em; }
.reasoning-status-panel header strong { margin-top: 2px; font-size: 11.5px; }
.reasoning-status-panel header small { margin-top: 2px; color: var(--sc-muted,#8a918d); font-size: 8.5px; }
.progress-value { color: var(--reasoning-accent); font: 10px ui-monospace,SFMono-Regular,Menlo,monospace; }
.progress-track { height: 2px; margin: 0 13px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb,var(--reasoning-accent) 10%,var(--sc-border,#343839)); }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#6dbb99,var(--reasoning-accent)); box-shadow: 0 0 10px rgba(185,142,224,.4); transition: width 220ms ease; }
.reasoning-stages { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 1px; margin: 10px 0 0; border-top: 1px solid color-mix(in srgb,var(--reasoning-accent) 13%,var(--sc-border,#343839)); border-bottom: 1px solid color-mix(in srgb,var(--reasoning-accent) 13%,var(--sc-border,#343839)); list-style: none; background: color-mix(in srgb,var(--reasoning-accent) 8%,transparent); }
.reasoning-stages li { display: grid; grid-template-columns: 21px minmax(0,1fr) auto; align-items: center; gap: 6px; min-width: 0; min-height: 56px; padding: 7px 8px; background: color-mix(in srgb,var(--sc-panel,#1b1e20) 96%,transparent); }
.reasoning-stages li + li { border-left: 1px solid color-mix(in srgb,var(--reasoning-accent) 13%,var(--sc-border,#343839)); }
.stage-node { display: grid; width: 20px; height: 20px; place-items: center; border: 1px solid var(--sc-border,#343839); border-radius: 6px; color: #65bd8b; background: var(--sc-subtle,#181a1c); }
.stage-node i { width: 5px; height: 5px; border-radius: 50%; background: var(--sc-faint,#646b68); }
.is-running .stage-node { border-color: color-mix(in srgb,var(--reasoning-accent) 52%,var(--sc-border,#343839)); }
.is-running .stage-node i { background: var(--reasoning-accent); box-shadow: 0 0 9px rgba(185,142,224,.58); animation: reasoning-pulse 650ms ease-in-out infinite alternate; }
.reasoning-stages li > div { min-width: 0; }
.reasoning-stages strong,
.reasoning-stages small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reasoning-stages strong { color: var(--sc-muted,#8a918d); font-size: 9px; }
.reasoning-stages small { margin-top: 2px; color: var(--sc-faint,#646b68); font-size: 7.5px; }
.reasoning-stages .is-completed strong,
.reasoning-stages .is-running strong { color: var(--sc-text,#e5e9e7); }
.reasoning-stages li > span:last-child { color: color-mix(in srgb,var(--reasoning-accent) 35%,var(--sc-faint,#646b68)); font: 7px ui-monospace,SFMono-Regular,Menlo,monospace; }
.reasoning-status-panel > footer { display: flex; align-items: flex-start; gap: 6px; padding: 8px 12px; color: var(--sc-faint,#646b68); font-size: 8px; line-height: 1.45; }
.reasoning-status-panel > footer svg { flex: 0 0 auto; margin-top: 1px; color: var(--reasoning-accent); }

@keyframes reasoning-orbit { to { transform: rotate(360deg); } }
@keyframes reasoning-pulse { to { opacity: .35; transform: scale(.82); } }

@media (max-width: 680px) {
  .reasoning-stages { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .reasoning-stages li:nth-child(3) { border-left: 0; border-top: 1px solid color-mix(in srgb,var(--reasoning-accent) 13%,var(--sc-border,#343839)); }
  .reasoning-stages li:nth-child(4) { border-top: 1px solid color-mix(in srgb,var(--reasoning-accent) 13%,var(--sc-border,#343839)); }
}
</style>
