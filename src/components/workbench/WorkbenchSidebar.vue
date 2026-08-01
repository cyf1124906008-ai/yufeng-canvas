<template>
  <aside class="wb-sidebar" :class="{ 'is-open': open }" aria-label="任务导航">
    <header class="wb-sidebar-brand">
      <button type="button" class="brand-mark" aria-label="YUFENG Agent 首页" @click="emit('new-task')">
        Y
      </button>
      <div>
        <strong>YUFENG</strong>
        <span>桌面 Agent 工作台</span>
      </div>
      <button type="button" class="mobile-close" aria-label="关闭导航" @click="emit('close')">×</button>
    </header>

    <button type="button" class="new-task" :disabled="newTaskDisabled" @click="emit('new-task')">
      <span>＋</span>
      新任务
      <kbd>⌘ N</kbd>
    </button>

    <nav class="workspace-nav" aria-label="工作区">
      <p class="nav-label">工作区</p>
      <button
        v-for="workspace in workspaces"
        :key="workspace.id"
        type="button"
        :class="{ 'is-active': workspace.id === activeWorkspaceId }"
        @click="emit('select-workspace', workspace.id)"
      >
        <span class="nav-icon">{{ workspace.icon || '◇' }}</span>
        <span>
          <strong>{{ workspace.label }}</strong>
          <small v-if="workspace.description">{{ workspace.description }}</small>
        </span>
        <i v-if="workspace.badge">{{ workspace.badge }}</i>
      </button>
    </nav>

    <section class="task-history" :aria-busy="loading ? 'true' : 'false'">
      <div class="section-row">
        <p class="nav-label">任务</p>
        <button
          type="button"
          class="clear-history"
          :disabled="loading || !normalizedRecords.length"
          @click="emit('clear-history')"
        >
          清空
        </button>
      </div>

      <div v-if="loading" class="history-loading" role="status">
        <span></span><span></span><span></span>
        正在读取任务
      </div>

      <div v-else-if="normalizedRecords.length" class="history-list">
        <article
          v-for="record in normalizedRecords"
          :key="record.key"
          :class="{ 'is-selected': record.id === normalizedSelectedId }"
        >
          <button type="button" class="history-main" @click="emit('select-history', record.id)">
            <span class="history-dot" :class="`is-${record.tone}`"></span>
            <span>
              <strong>{{ record.goal }}</strong>
              <small>{{ record.timeLabel }} · {{ record.stepCount }} 步</small>
            </span>
          </button>
          <button
            type="button"
            class="history-delete"
            :aria-label="`删除任务 ${record.goal}`"
            @click="emit('delete-history', record.id)"
          >
            ×
          </button>
        </article>
      </div>

      <div v-else class="history-empty">
        <span>⌁</span>
        <strong>暂无任务</strong>
        <small>任务事件仅保存在这台设备。</small>
      </div>
    </section>

    <footer class="sidebar-footer">
      <div class="provider-state">
        <span class="provider-dot"></span>
        <span>
          <small>模型服务</small>
          <strong>{{ provider || '未配置' }}</strong>
        </span>
      </div>
      <button type="button" aria-label="模型与 API 设置" @click="emit('open-settings')">⚙</button>
    </footer>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { normalizeAgentRunHistoryRecords } from '../agent/agentRunHistoryView.js'

defineOptions({ name: 'WorkbenchSidebar' })

const props = defineProps({
  records: { type: Array, default: () => [] },
  selectedId: { type: [String, Number], default: '' },
  loading: { type: Boolean, default: false },
  provider: { type: String, default: '' },
  workspaces: { type: Array, default: () => [] },
  activeWorkspaceId: { type: String, default: '' },
  newTaskDisabled: { type: Boolean, default: false },
  open: { type: Boolean, default: false }
})

const emit = defineEmits({
  'new-task': () => true,
  'select-history': id => typeof id === 'string' && !!id,
  'delete-history': id => typeof id === 'string' && !!id,
  'clear-history': () => true,
  'select-workspace': id => typeof id === 'string' && !!id,
  'open-settings': () => true,
  close: () => true
})

const normalizedSelectedId = computed(() => String(props.selectedId ?? '').trim())
const normalizedRecords = computed(() => normalizeAgentRunHistoryRecords(props.records))
</script>

<style scoped>
.wb-sidebar {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  height: 100%;
  border-right: 1px solid var(--wb-border);
  color: var(--wb-text);
  background: #101113;
}

.wb-sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 12px 14px;
}

.brand-mark {
  display: grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  color: #0b1612;
  background: #b7f5d5;
  font-size: 15px;
  font-weight: 900;
}

.wb-sidebar-brand > div { min-width: 0; }
.wb-sidebar-brand strong,
.wb-sidebar-brand span { display: block; }
.wb-sidebar-brand strong { font-size: 12px; letter-spacing: 0.08em; }
.wb-sidebar-brand span { margin-top: 1px; color: var(--wb-muted); font-size: 9px; }
.mobile-close { display: none; margin-left: auto; color: var(--wb-muted); font-size: 22px; }

.new-task {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 10px 14px;
  border: 1px solid #383a3f;
  border-radius: 8px;
  padding: 9px 10px;
  color: #f5f5f5;
  background: #202226;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
}

.new-task:hover { border-color: #52555c; background: #292b30; }
.new-task:disabled { cursor: not-allowed; opacity: 0.45; }
.new-task > span { color: #b7f5d5; font-size: 17px; line-height: 1; }
.new-task kbd {
  margin-left: auto;
  border: 1px solid #414349;
  border-radius: 5px;
  padding: 2px 5px;
  color: #8b8e95;
  background: #16171a;
  font: inherit;
  font-size: 8px;
}

.workspace-nav { padding: 0 8px 10px; }
.nav-label {
  margin: 0;
  color: #6f727a;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.workspace-nav > .nav-label { padding: 0 8px 7px; }
.workspace-nav button {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  width: 100%;
  border-radius: 7px;
  padding: 7px 8px;
  color: #c8cad0;
  text-align: left;
}

.workspace-nav button:hover,
.workspace-nav button.is-active { color: #fff; background: #202226; }
.workspace-nav button > span:nth-child(2) { min-width: 0; }
.workspace-nav strong,
.workspace-nav small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-nav strong { font-size: 10px; }
.workspace-nav small { margin-top: 1px; color: #74777f; font-size: 8px; }
.workspace-nav i { border-radius: 999px; padding: 2px 5px; color: #8e9198; background: #292b30; font-size: 8px; font-style: normal; }
.nav-icon { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 6px; color: #a8abb3; background: #292b30; font-size: 10px; }

.task-history {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-top: 1px solid #25272b;
  padding: 11px 8px 8px;
}

.section-row { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 7px; }
.clear-history { color: #777a82; font-size: 8px; }
.clear-history:hover { color: #d4d5d8; }
.clear-history:disabled { cursor: default; opacity: 0.35; }
.history-list { min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #303238 transparent; }
.history-list article { display: grid; grid-template-columns: minmax(0, 1fr) 22px; align-items: center; border-radius: 7px; }
.history-list article:hover,
.history-list article.is-selected { background: #202226; }
.history-list article.is-selected { box-shadow: inset 2px 0 #80d9b4; }
.history-main { display: grid; grid-template-columns: 8px minmax(0, 1fr); align-items: center; gap: 7px; min-width: 0; padding: 8px 5px 8px 8px; text-align: left; }
.history-main > span:last-child { min-width: 0; }
.history-main strong,
.history-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-main strong { color: #d7d8dc; font-size: 9px; font-weight: 650; }
.history-main small { margin-top: 2px; color: #70737b; font-size: 7.5px; }
.history-dot { width: 6px; height: 6px; border-radius: 50%; background: #666a72; }
.history-dot.is-running { background: #75bdf2; box-shadow: 0 0 0 3px rgba(117, 189, 242, 0.08); }
.history-dot.is-success { background: #72d6a8; }
.history-dot.is-error { background: #ee7a7a; }
.history-dot.is-retry { background: #b89af3; }
.history-dot.is-stopped { background: #d6a35f; }
.history-delete { width: 20px; height: 20px; border-radius: 5px; color: transparent; font-size: 14px; }
.history-list article:hover .history-delete,
.history-delete:focus-visible { color: #777a82; }
.history-delete:hover { color: #ef8c8c !important; background: #332124; }
.history-empty,
.history-loading { display: grid; min-height: 132px; place-content: center; color: #696c74; text-align: center; }
.history-empty span { font-size: 20px; }
.history-empty strong { margin-top: 6px; color: #9699a1; font-size: 9px; }
.history-empty small { margin-top: 2px; font-size: 8px; }
.history-loading { grid-template-columns: repeat(3, 5px); gap: 5px; font-size: 8px; }
.history-loading span { width: 5px; height: 5px; border-radius: 50%; background: #8bdcb8; animation: wb-pulse 900ms infinite alternate; }
.history-loading span:nth-child(2) { animation-delay: 120ms; }
.history-loading span:nth-child(3) { animation-delay: 240ms; }
.history-loading { grid-auto-flow: column; }

.sidebar-footer { display: flex; align-items: center; gap: 8px; border-top: 1px solid #25272b; padding: 10px 12px; }
.provider-state { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.provider-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: #73d4a8; box-shadow: 0 0 0 3px rgba(115, 212, 168, 0.08); }
.provider-state > span:last-child { min-width: 0; }
.provider-state small,
.provider-state strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-state small { color: #64676e; font-size: 7px; letter-spacing: 0.09em; }
.provider-state strong { margin-top: 1px; color: #bfc1c6; font-size: 9px; }
.sidebar-footer > button { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 6px; color: #8b8e95; }
.sidebar-footer > button:hover { color: #fff; background: #292b30; }

@keyframes wb-pulse { to { opacity: 0.3; transform: translateY(2px); } }

@media (max-width: 880px) {
  .wb-sidebar {
    position: fixed;
    z-index: 60;
    inset: 0 auto 0 0;
    width: min(290px, 86vw);
    box-shadow: 18px 0 60px rgba(0, 0, 0, 0.42);
    transform: translateX(-103%);
    transition: transform 180ms ease;
  }
  .wb-sidebar.is-open { transform: translateX(0); }
  .mobile-close { display: block; }
}
</style>
