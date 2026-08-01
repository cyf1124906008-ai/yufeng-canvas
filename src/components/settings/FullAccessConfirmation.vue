<template>
  <teleport to="body">
    <transition name="full-access-fade">
      <section
        v-if="show"
        ref="dialogRoot"
        class="full-access-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-access-title"
        aria-describedby="full-access-summary"
        tabindex="-1"
        @keydown.esc="requestCancel"
      >
        <div class="ambient-glow glow-one" aria-hidden="true"></div>
        <div class="ambient-glow glow-two" aria-hidden="true"></div>

        <header class="full-access-topbar">
          <div class="product-lockup">
            <span class="product-mark">Y</span>
            <span><strong>YUFENG Agent</strong><small>权限确认</small></span>
          </div>
          <span class="session-badge"><i></i>当前 App 会话</span>
        </header>

        <main class="confirmation-shell">
          <aside class="risk-rail" aria-label="完全访问权限说明">
            <span class="warning-emblem" aria-hidden="true">
              <workbench-icon name="alert" :size="25" />
              <i></i>
            </span>
            <p>FULL ACCESS</p>
            <strong>高信任执行模式</strong>
            <span>Agent 将减少逐步审批，连续调度已启用的工具。请先确认项目、指令和当前桌面环境均可信。</span>
            <div class="scope-card">
              <span>当前工作区</span>
              <code :title="normalizedWorkspace">{{ workspaceCopy }}</code>
              <small>{{ normalizedWorkspace ? '文件工具仍绑定此根目录' : '使用文件工具前仍需选择根目录' }}</small>
            </div>
          </aside>

          <div class="confirmation-content">
            <header class="content-heading">
              <span><workbench-icon name="shield" :size="14" />敏感权限</span>
              <h1 id="full-access-title">开启完全访问权限？</h1>
              <p id="full-access-summary">开启后，Agent 可以更少打断地执行任务。它不会解除操作系统权限，也不会取消工作区文件工具自身的边界。</p>
            </header>

            <section class="risk-section" aria-labelledby="full-access-risks">
              <header>
                <div><span>01</span><strong id="full-access-risks">你将允许的高风险能力</strong></div>
                <small>执行前不再逐项打断</small>
              </header>
              <div class="risk-grid">
                <article v-for="item in riskItems" :key="item.id">
                  <span><workbench-icon :name="item.icon" :size="17" /></span>
                  <div><strong>{{ item.title }}</strong><p>{{ item.description }}</p></div>
                </article>
              </div>
            </section>

            <section class="guardrail-section" aria-labelledby="full-access-guardrails">
              <header>
                <div><span>02</span><strong id="full-access-guardrails">这些安全边界仍然保留</strong></div>
                <small>不是解除 OS 沙箱</small>
              </header>
              <ul>
                <li v-for="item in guardrails" :key="item.id">
                  <span><workbench-icon name="check" :size="12" /></span>
                  <div><strong>{{ item.title }}</strong><p>{{ item.description }}</p></div>
                </li>
              </ul>
            </section>

            <label class="acknowledgement" :class="{ 'is-checked': acknowledged, 'is-disabled': busy }">
              <input v-model="acknowledged" type="checkbox" :disabled="busy" />
              <span class="check-control" aria-hidden="true"><workbench-icon name="check" :size="13" /></span>
              <span>
                <strong>我理解上述风险，并确认当前任务与环境可信</strong>
                <small>继续后还会显示一次系统级确认；本页勾选不会永久保存。</small>
              </span>
            </label>

            <footer class="confirmation-actions">
              <button type="button" class="cancel-button" :disabled="busy" @click="requestCancel">取消</button>
              <button type="button" class="confirm-button" :disabled="!confirmEnabled" @click="requestConfirm">
                <span v-if="busy" class="button-spinner" aria-hidden="true"></span>
                <workbench-icon v-else name="shield" :size="15" />
                {{ busy ? '等待系统确认…' : '继续并打开系统确认' }}
                <workbench-icon v-if="!busy" name="chevron-right" :size="14" />
              </button>
            </footer>
          </div>
        </main>
      </section>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import {
  FULL_ACCESS_GUARDRAILS,
  FULL_ACCESS_RISK_ITEMS,
  canConfirmFullAccess,
  normalizeFullAccessWorkspace
} from './fullAccessConfirmationView.js'

defineOptions({ name: 'FullAccessConfirmation' })

const props = defineProps({
  show: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  workspaceRoot: { type: String, default: '' }
})

const emit = defineEmits({
  confirm: () => true,
  cancel: () => true,
  'update:show': value => typeof value === 'boolean'
})

const dialogRoot = ref(null)
const acknowledged = ref(false)
const riskItems = FULL_ACCESS_RISK_ITEMS
const guardrails = FULL_ACCESS_GUARDRAILS

const normalizedWorkspace = computed(() => normalizeFullAccessWorkspace(props.workspaceRoot))
const workspaceCopy = computed(() => normalizedWorkspace.value || '尚未选择工作区')
const confirmEnabled = computed(() => canConfirmFullAccess({
  show: props.show,
  busy: props.busy,
  acknowledged: acknowledged.value
}))

const requestCancel = () => {
  if (props.busy) return
  acknowledged.value = false
  emit('cancel')
  emit('update:show', false)
}

const requestConfirm = () => {
  if (!confirmEnabled.value) return
  emit('confirm')
}

watch(
  () => props.show,
  async visible => {
    acknowledged.value = false
    if (!visible) return
    await nextTick()
    dialogRoot.value?.focus?.()
  }
)

watch(() => props.workspaceRoot, () => {
  acknowledged.value = false
})
</script>

<style scoped>
.full-access-layer {
  --fa-bg: #f4f5f4;
  --fa-panel: rgba(255,255,255,.9);
  --fa-subtle: #f7f8f7;
  --fa-hover: #eef1ef;
  --fa-border: #dfe3e0;
  --fa-border-strong: #ccd2ce;
  --fa-text: #202422;
  --fa-muted: #6e756f;
  --fa-faint: #929994;
  --fa-warning: #c67a45;
  --fa-warning-soft: #fff4e8;
  position: fixed;
  z-index: 2200;
  inset: 0;
  display: grid;
  grid-template-rows: 54px minmax(0,1fr);
  overflow: hidden;
  outline: none;
  color: var(--fa-text);
  background: var(--fa-bg);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  color-scheme: light;
}
:global(.dark) .full-access-layer {
  --fa-bg: #111315;
  --fa-panel: rgba(27,30,32,.9);
  --fa-subtle: #181a1c;
  --fa-hover: #25292a;
  --fa-border: #303435;
  --fa-border-strong: #404647;
  --fa-text: #e5e9e7;
  --fa-muted: #8a918d;
  --fa-faint: #646b68;
  --fa-warning: #dc9a65;
  --fa-warning-soft: #2a211b;
  color-scheme: dark;
}
.ambient-glow { position: absolute; pointer-events: none; border-radius: 50%; filter: blur(1px); }
.glow-one { top: -24%; right: -12%; width: 46vw; height: 46vw; background: radial-gradient(circle,rgba(222,139,77,.08),transparent 69%); }
.glow-two { bottom: -35%; left: 5%; width: 52vw; height: 52vw; background: radial-gradient(circle,rgba(77,172,126,.055),transparent 70%); }
.full-access-topbar { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--fa-border); padding: 0 clamp(16px,3vw,34px); background: color-mix(in srgb,var(--fa-panel) 92%,transparent); backdrop-filter: blur(18px); }
.product-lockup { display: flex; align-items: center; gap: 9px; }
.product-mark { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 8px; color: #102018; background: #a5e5c1; font-size: 12px; font-weight: 900; box-shadow: 0 6px 18px rgba(58,144,98,.14); }
.product-lockup > span:last-child strong,
.product-lockup > span:last-child small { display: block; }
.product-lockup strong { font-size: 11.5px; font-weight: 720; }
.product-lockup small { margin-top: 1px; color: var(--fa-faint); font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; }
.session-badge { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--fa-border); border-radius: 999px; padding: 5px 9px; color: var(--fa-muted); background: color-mix(in srgb,var(--fa-panel) 76%,transparent); font-size: 9.5px; }
.session-badge i { width: 6px; height: 6px; border-radius: 50%; background: #dd9a62; box-shadow: 0 0 0 3px rgba(221,154,98,.12); }
.confirmation-shell { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(215px,275px) minmax(0,700px); width: min(1040px,calc(100% - 48px)); min-height: 0; margin: auto; overflow: hidden; border: 1px solid var(--fa-border); border-radius: 16px; background: var(--fa-panel); box-shadow: 0 30px 100px rgba(17,24,20,.13),0 2px 5px rgba(0,0,0,.04); backdrop-filter: blur(22px); }
.risk-rail { position: relative; display: flex; min-width: 0; flex-direction: column; border-right: 1px solid color-mix(in srgb,var(--fa-warning) 27%,var(--fa-border)); padding: clamp(24px,4vw,42px) 26px 25px; background: radial-gradient(circle at 15% 7%,rgba(220,137,76,.13),transparent 38%),linear-gradient(155deg,color-mix(in srgb,var(--fa-warning-soft) 76%,var(--fa-panel)),var(--fa-panel)); }
.warning-emblem { position: relative; display: grid; width: 54px; height: 54px; place-items: center; border: 1px solid color-mix(in srgb,var(--fa-warning) 38%,var(--fa-border)); border-radius: 15px; color: var(--fa-warning); background: color-mix(in srgb,var(--fa-warning-soft) 80%,var(--fa-panel)); box-shadow: inset 0 1px 0 rgba(255,255,255,.25),0 12px 34px rgba(176,102,51,.09); }
.warning-emblem i { position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--fa-warning); box-shadow: 0 0 0 4px color-mix(in srgb,var(--fa-warning) 11%,transparent); }
.risk-rail > p { margin: 25px 0 0; color: var(--fa-warning); font: 800 9px ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing: .15em; }
.risk-rail > strong { margin-top: 7px; font-size: 19px; letter-spacing: -.025em; }
.risk-rail > span:not(.warning-emblem) { margin-top: 12px; color: var(--fa-muted); font-size: 10.5px; line-height: 1.72; }
.scope-card { min-width: 0; margin-top: auto; border: 1px solid color-mix(in srgb,var(--fa-warning) 20%,var(--fa-border)); border-radius: 10px; padding: 12px; background: color-mix(in srgb,var(--fa-panel) 72%,transparent); }
.scope-card span,
.scope-card code,
.scope-card small { display: block; }
.scope-card span { color: var(--fa-faint); font-size: 8px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.scope-card code { overflow: hidden; margin-top: 7px; color: var(--fa-text); font: 10px ui-monospace,SFMono-Regular,Menlo,monospace; text-overflow: ellipsis; white-space: nowrap; }
.scope-card small { margin-top: 5px; color: var(--fa-muted); font-size: 8.5px; }
.confirmation-content { min-width: 0; overflow-y: auto; padding: clamp(24px,3.7vw,40px) clamp(24px,4.2vw,46px) 26px; scrollbar-width: thin; }
.content-heading > span { display: inline-flex; align-items: center; gap: 6px; color: var(--fa-warning); font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.content-heading h1 { margin: 8px 0 0; font-size: clamp(25px,3vw,34px); font-weight: 680; letter-spacing: -.04em; }
.content-heading p { max-width: 610px; margin: 10px 0 0; color: var(--fa-muted); font-size: 11px; line-height: 1.7; }
.risk-section,
.guardrail-section { margin-top: 24px; }
.risk-section > header,
.guardrail-section > header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.risk-section > header div,
.guardrail-section > header div { display: flex; align-items: center; gap: 8px; }
.risk-section > header div span,
.guardrail-section > header div span { color: var(--fa-faint); font: 8px ui-monospace,SFMono-Regular,Menlo,monospace; }
.risk-section > header strong,
.guardrail-section > header strong { font-size: 11px; }
.risk-section > header small,
.guardrail-section > header small { color: var(--fa-faint); font-size: 8.5px; }
.risk-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }
.risk-grid article { min-width: 0; border: 1px solid color-mix(in srgb,var(--fa-warning) 22%,var(--fa-border)); border-radius: 10px; padding: 12px 11px; background: color-mix(in srgb,var(--fa-warning-soft) 42%,var(--fa-panel)); }
.risk-grid article > span { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 8px; color: var(--fa-warning); background: color-mix(in srgb,var(--fa-warning) 10%,transparent); }
.risk-grid article strong { display: block; margin-top: 10px; font-size: 10.5px; }
.risk-grid article p { margin: 5px 0 0; color: var(--fa-muted); font-size: 8.8px; line-height: 1.55; }
.guardrail-section ul { display: grid; gap: 1px; overflow: hidden; margin: 0; border: 1px solid var(--fa-border); border-radius: 10px; padding: 0; list-style: none; background: var(--fa-border); }
.guardrail-section li { display: grid; grid-template-columns: 25px minmax(0,1fr); align-items: center; gap: 8px; padding: 9px 11px; background: var(--fa-subtle); }
.guardrail-section li > span { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 6px; color: #52aa79; background: color-mix(in srgb,#62bd88 11%,transparent); }
.guardrail-section li strong { display: block; font-size: 9.8px; }
.guardrail-section li p { margin: 2px 0 0; color: var(--fa-muted); font-size: 8.7px; line-height: 1.48; }
.acknowledgement { display: grid; grid-template-columns: 23px minmax(0,1fr); align-items: flex-start; gap: 10px; margin-top: 18px; border: 1px solid var(--fa-border-strong); border-radius: 10px; padding: 11px 12px; cursor: pointer; background: var(--fa-subtle); transition: border-color 140ms ease,background 140ms ease,box-shadow 140ms ease; }
.acknowledgement:hover { background: var(--fa-hover); }
.acknowledgement.is-checked { border-color: color-mix(in srgb,var(--fa-warning) 48%,var(--fa-border)); background: color-mix(in srgb,var(--fa-warning-soft) 45%,var(--fa-panel)); box-shadow: inset 0 0 0 1px color-mix(in srgb,var(--fa-warning) 12%,transparent); }
.acknowledgement.is-disabled { cursor: wait; opacity: .66; }
.acknowledgement input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
.check-control { display: grid; width: 21px; height: 21px; place-items: center; border: 1px solid var(--fa-border-strong); border-radius: 6px; color: transparent; background: var(--fa-panel); transition: all 140ms ease; }
.acknowledgement input:focus-visible + .check-control { outline: 2px solid color-mix(in srgb,var(--fa-warning) 68%,transparent); outline-offset: 2px; }
.acknowledgement input:checked + .check-control { border-color: var(--fa-warning); color: #fff; background: var(--fa-warning); }
.acknowledgement > span:last-child strong,
.acknowledgement > span:last-child small { display: block; }
.acknowledgement strong { font-size: 10px; }
.acknowledgement small { margin-top: 3px; color: var(--fa-muted); font-size: 8.8px; line-height: 1.45; }
.confirmation-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 17px; }
.cancel-button,
.confirm-button { height: 36px; border-radius: 8px; padding: 0 14px; font-size: 10.5px; font-weight: 680; }
.cancel-button { border: 1px solid var(--fa-border); color: var(--fa-muted); background: var(--fa-subtle); }
.cancel-button:hover:not(:disabled) { color: var(--fa-text); background: var(--fa-hover); }
.confirm-button { display: inline-flex; min-width: 189px; align-items: center; justify-content: center; gap: 7px; color: #fff8f2; background: linear-gradient(135deg,#c87b44,#b96937); box-shadow: 0 8px 22px rgba(181,100,51,.17); transition: transform 140ms ease,filter 140ms ease,opacity 140ms ease; }
.confirm-button:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.cancel-button:disabled,
.confirm-button:disabled { cursor: not-allowed; opacity: .43; box-shadow: none; }
.button-spinner { width: 13px; height: 13px; border: 1.5px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: full-access-spin 720ms linear infinite; }
.full-access-fade-enter-active,
.full-access-fade-leave-active { transition: opacity 150ms ease; }
.full-access-fade-enter-active .confirmation-shell { transition: transform 180ms ease,opacity 160ms ease; }
.full-access-fade-enter-from,
.full-access-fade-leave-to { opacity: 0; }
.full-access-fade-enter-from .confirmation-shell { opacity: 0; transform: translateY(8px) scale(.992); }

@keyframes full-access-spin { to { transform: rotate(360deg); } }

@media (max-height: 720px) {
  .confirmation-shell { height: calc(100% - 30px); }
  .confirmation-content { padding-top: 24px; }
  .risk-rail { padding-top: 26px; }
}

@media (max-width: 760px) {
  .full-access-layer { grid-template-rows: 50px minmax(0,1fr); }
  .confirmation-shell { display: block; width: min(620px,calc(100% - 20px)); max-height: calc(100% - 20px); overflow-y: auto; }
  .risk-rail { display: grid; grid-template-columns: 46px minmax(0,1fr); gap: 2px 13px; border-right: 0; border-bottom: 1px solid color-mix(in srgb,var(--fa-warning) 27%,var(--fa-border)); padding: 17px 18px; }
  .warning-emblem { grid-row: 1 / 5; width: 44px; height: 44px; border-radius: 12px; }
  .risk-rail > p { margin: 0; }
  .risk-rail > strong { margin-top: 2px; font-size: 15px; }
  .risk-rail > span:not(.warning-emblem) { margin-top: 4px; font-size: 9px; line-height: 1.5; }
  .scope-card { grid-column: 1 / -1; margin-top: 11px; }
  .confirmation-content { overflow: visible; padding: 22px 18px 18px; }
  .risk-grid { grid-template-columns: minmax(0,1fr); }
  .risk-grid article { display: grid; grid-template-columns: 31px minmax(0,1fr); gap: 9px; padding: 10px; }
  .risk-grid article strong { margin-top: 1px; }
  .risk-grid article p { margin-top: 3px; }
}

@media (max-width: 440px) {
  .session-badge { font-size: 0; }
  .confirmation-actions { display: grid; grid-template-columns: 1fr; }
  .confirmation-actions button { width: 100%; }
  .confirm-button { grid-row: 1; }
  .risk-section > header small,
  .guardrail-section > header small { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .full-access-layer *,
  .full-access-layer *::before,
  .full-access-layer *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
</style>
