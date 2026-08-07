<template>
  <aside class="wb-sidebar" :class="{ 'is-open': open }" aria-label="项目与任务导航">
    <header class="sidebar-brand">
      <button type="button" class="brand-button" aria-label="DataEyes Code 首页" :disabled="newTaskDisabled" @click="emit('new-task')">
        <data-eyes-mark :size="31" />
      </button>
      <div class="brand-copy">
        <strong>DATAEYES <b>CODE</b></strong>
        <small>LOCAL AGENT RUNTIME</small>
      </div>
      <button type="button" class="icon-button mobile-close" aria-label="关闭导航" @click="emit('close')">
        <workbench-icon name="close" :size="17" />
      </button>
    </header>

    <div class="primary-actions">
      <button type="button" class="new-task" :disabled="newTaskDisabled" @click="emit('new-task')">
        <span class="new-task-mark"><workbench-icon name="plus" :size="14" /></span>
        <span>新建任务</span>
        <kbd>⌘N</kbd>
      </button>
      <label class="task-search" :class="{ 'has-value': query }">
        <workbench-icon name="search" :size="14" />
        <input ref="searchInput" v-model="query" type="search" placeholder="搜索任务" aria-label="搜索任务历史" />
        <button v-if="query" type="button" aria-label="清除搜索" @click="query = ''">
          <workbench-icon name="close" :size="13" />
        </button>
        <kbd v-else>⌘K</kbd>
      </label>
    </div>

    <section class="sidebar-section project-section">
      <div class="section-heading">
        <span>项目</span>
      </div>
      <nav class="project-list" aria-label="项目">
        <button
          v-for="workspace in workspaces"
          :key="workspace.id"
          type="button"
          :class="{ 'is-active': workspace.id === activeWorkspaceId }"
          @click="emit('select-workspace', workspace.id)"
        >
          <span class="project-icon"><workbench-icon :name="workspace.iconName || iconForWorkspace(workspace.id)" :size="15" /></span>
          <span class="project-copy">
            <strong>{{ workspace.label }}</strong>
            <small v-if="workspace.description">{{ workspace.description }}</small>
          </span>
          <span v-if="workspace.badge" class="project-badge">{{ workspace.badge }}</span>
          <workbench-icon v-else name="chevron-right" :size="13" class="project-arrow" />
        </button>
      </nav>
    </section>

    <section class="sidebar-section history-section" :aria-busy="loading ? 'true' : 'false'">
      <div class="section-heading">
        <span>最近任务</span>
        <button
          type="button"
          :disabled="loading || !normalizedRecords.length"
          @click="emit('clear-history')"
        >清空</button>
      </div>

      <div v-if="loading" class="sidebar-empty" role="status">
        <span class="loading-ring"></span>
        <p>正在读取任务…</p>
      </div>

      <div v-else-if="filteredRecords.length" class="history-list">
        <article
          v-for="record in filteredRecords"
          :key="record.key"
          :class="{ 'is-selected': record.id === normalizedSelectedId }"
        >
          <button type="button" class="history-main" @click="emit('select-history', record.id)">
            <span class="history-status" :class="`is-${record.tone}`"></span>
            <span class="history-copy">
              <strong>{{ record.goal }}</strong>
              <small>{{ record.timeLabel }}<span>·</span>{{ record.stepCount }} 步</small>
            </span>
          </button>
          <button
            type="button"
            class="history-delete"
            :aria-label="`删除任务 ${record.goal}`"
            @click.stop="emit('delete-history', record.id)"
          >
            <workbench-icon name="trash" :size="13" />
          </button>
        </article>
      </div>

      <div v-else-if="query" class="sidebar-empty">
        <workbench-icon name="search" :size="18" />
        <strong>没有匹配任务</strong>
        <p>换个关键词试试。</p>
      </div>

      <div v-else class="sidebar-empty">
        <workbench-icon name="history" :size="18" />
        <strong>还没有任务</strong>
        <p>完成的会话会保存在本机。</p>
      </div>
    </section>

    <footer class="sidebar-footer">
      <div class="connection-state">
        <span class="connection-dot" :class="{ 'is-offline': !providerConfigured }"></span>
        <span>
          <small>模型服务 · {{ providerConfigured ? '已配置' : '未配置' }}</small>
          <strong>{{ provider || '未选择' }}</strong>
        </span>
      </div>
      <button type="button" class="icon-button" aria-label="打开设置中心" @click="emit('open-settings')">
        <workbench-icon name="settings" :size="15" />
      </button>
    </footer>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { normalizeAgentRunHistoryRecords } from '../agent/agentRunHistoryView.js'
import DataEyesMark from '../brand/DataEyesMark.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

defineOptions({ name: 'WorkbenchSidebar' })

const props = defineProps({
  records: { type: Array, default: () => [] },
  selectedId: { type: [String, Number], default: '' },
  loading: { type: Boolean, default: false },
  provider: { type: String, default: '' },
  providerConfigured: { type: Boolean, default: false },
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

const query = ref('')
const searchInput = ref(null)
const normalizedSelectedId = computed(() => String(props.selectedId ?? '').trim())
const normalizedRecords = computed(() => normalizeAgentRunHistoryRecords(props.records))
const filteredRecords = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return normalizedRecords.value
  return normalizedRecords.value.filter(record => record.goal.toLocaleLowerCase().includes(needle))
})

const iconForWorkspace = (id) => ({
  'local-workspace': 'folder',
  tools: 'shield',
  artifacts: 'box'
})[id] || 'folder'

const onSearchShortcut = (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onSearchShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onSearchShortcut))
</script>

<style scoped>
.wb-sidebar {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--wb-border);
  color: var(--wb-text);
  background: #111214;
}

button,
input { font: inherit; }

.sidebar-brand { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 10px 12px; }
.brand-button { display: grid; width: 29px; height: 29px; flex: 0 0 auto; place-items: center; border-radius: 8px; color: #102018; background: #a7e8c4; box-shadow: inset 0 1px rgba(255,255,255,.36); }
.brand-button:disabled { cursor: not-allowed; opacity: .45; }
.brand-button span { font-size: 14px; font-weight: 900; }
.brand-copy { min-width: 0; }
.brand-copy strong,
.brand-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brand-copy strong { color: #eceeed; font-size: 13px; letter-spacing: .1em; }
.brand-copy small { margin-top: 1px; color: #6f7475; font-size: 11px; }
.icon-button { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid transparent; border-radius: 7px; color: #777c7e; }
.icon-button:hover { border-color: #313437; color: #d7dad9; background: #202225; }
.mobile-close { display: none; margin-left: auto; }

.primary-actions { display: grid; gap: 8px; padding: 4px 11px 13px; }
.new-task { display: flex; align-items: center; gap: 8px; min-height: 38px; border: 1px solid #35393a; border-radius: 8px; padding: 0 10px; color: #e3e6e4; background: #202326; box-shadow: inset 0 1px rgba(255,255,255,.025); font-size: 13px; font-weight: 680; text-align: left; }
.new-task:hover { border-color: #464b4c; background: #272a2d; }
.new-task:disabled { cursor: not-allowed; opacity: .42; }
.new-task kbd { margin-left: auto; color: #74797a; font-size: 10px; font-weight: 600; }
.task-search { display: flex; align-items: center; gap: 7px; height: 35px; border: 1px solid transparent; border-radius: 7px; padding: 0 9px; color: #666b6d; background: #191b1d; }
.task-search:focus-within { border-color: #3d5147; box-shadow: 0 0 0 2px rgba(142,218,178,.07); }
.task-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: #d8dbda; background: transparent; font-size: 12px; }
.task-search input::-webkit-search-cancel-button { display: none; }
.task-search input::placeholder { color: #656a6c; }
.task-search button { color: #6e7375; }
.task-search kbd { color: #575c5e; font-size: 10px; }

.sidebar-section { min-width: 0; padding: 0 8px; }
.project-section { padding-bottom: 10px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; min-height: 31px; padding: 0 7px; color: #686d6f; font-size: 11px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.section-heading button { color: #666b6d; font-size: 11px; letter-spacing: 0; text-transform: none; }
.section-heading button:hover { color: #c5c9c7; }
.section-heading button:disabled { opacity: .3; }
.project-list { display: grid; gap: 2px; }
.project-list > button { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: center; gap: 8px; width: 100%; min-height: 46px; border-radius: 8px; padding: 5px 8px; color: #aeb2b1; text-align: left; }
.project-list > button:hover,
.project-list > button.is-active { color: #ecedec; background: #1e2023; }
.project-list > button.is-active { box-shadow: inset 2px 0 #84cfa9; }
.project-icon { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 7px; color: #8b9290; background: #26292c; }
.project-copy { min-width: 0; }
.project-copy strong,
.project-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-copy strong { font-size: 13px; font-weight: 630; }
.project-copy small { margin-top: 2px; color: #626769; font-size: 11px; }
.project-badge { border: 1px solid #303436; border-radius: 999px; padding: 2px 6px; color: #6c7272; font-size: 10px; }
.project-arrow { color: #555a5c; }

.history-section { display: flex; min-height: 0; flex-direction: column; border-top: 1px solid #24272a; padding-top: 5px; }
.history-list { min-height: 0; overflow-y: auto; padding-bottom: 8px; scrollbar-width: thin; scrollbar-color: #303437 transparent; }
.history-list article { display: grid; grid-template-columns: minmax(0,1fr) 25px; align-items: center; border-radius: 7px; }
.history-list article:hover,
.history-list article.is-selected { background: #1e2023; }
.history-list article.is-selected { box-shadow: inset 2px 0 #84cfa9; }
.history-main { display: grid; grid-template-columns: 8px minmax(0,1fr); align-items: center; gap: 8px; min-width: 0; padding: 9px 4px 9px 8px; text-align: left; }
.history-status { width: 6px; height: 6px; border-radius: 50%; background: #616668; }
.history-status.is-running { background: #70b8ea; box-shadow: 0 0 0 3px rgba(112,184,234,.08); }
.history-status.is-success { background: #6fcc9e; }
.history-status.is-error { background: #e47878; }
.history-status.is-stopped { background: #c99a5d; }
.history-status.is-retry { background: #aa8ee5; }
.history-copy { min-width: 0; }
.history-copy strong,
.history-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-copy strong { color: #cfd2d1; font-size: 12.5px; font-weight: 560; }
.history-copy small { margin-top: 3px; color: #64696b; font-size: 11px; }
.history-copy small span { padding: 0 4px; }
.history-delete { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 6px; color: transparent; }
.history-list article:hover .history-delete,
.history-delete:focus-visible { color: #737879; }
.history-delete:hover { color: #e58484 !important; background: #322124; }
.sidebar-empty { display: flex; min-height: 115px; flex-direction: column; align-items: center; justify-content: center; color: #505557; text-align: center; }
.sidebar-empty strong { margin-top: 8px; color: #858a89; font-size: 12px; }
.sidebar-empty p { margin: 4px 0 0; color: #595e60; font-size: 11px; }
.loading-ring { width: 15px; height: 15px; border: 2px solid #333739; border-top-color: #8bd5ae; border-radius: 50%; animation: spin 700ms linear infinite; }

.sidebar-footer { display: flex; align-items: center; gap: 8px; border-top: 1px solid #24272a; padding: 9px 11px; }
.connection-state { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; }
.connection-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: #70ce9e; box-shadow: 0 0 0 3px rgba(112,206,158,.07); }
.connection-dot.is-offline { background: #7b8081; box-shadow: none; }
.connection-state > span:last-child { min-width: 0; }
.connection-state small,
.connection-state strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connection-state small { color: #5e6365; font-size: 10.5px; }
.connection-state strong { margin-top: 2px; color: #b8bcba; font-size: 12px; font-weight: 620; }

@keyframes spin { to { transform: rotate(360deg); } }

/* DataEyes Code — optical navigation rail */
.wb-sidebar {
  position: relative;
  isolation: isolate;
  border-right-color: rgba(168, 189, 185, .14);
  background:
    radial-gradient(circle at 13% 2%, rgba(94, 231, 196, .11), transparent 27%),
    linear-gradient(180deg, #10141b 0%, #0b0e14 74%);
  box-shadow: inset -1px 0 rgba(255, 255, 255, .018);
}

.wb-sidebar::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, .018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, .014) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(to bottom, #000, transparent 58%);
  content: '';
  pointer-events: none;
}

.sidebar-brand {
  min-height: 68px;
  gap: 11px;
  padding: 13px 14px 11px;
}

.brand-button {
  width: 37px;
  height: 37px;
  border: 1px solid rgba(111, 233, 204, .2);
  border-radius: 11px;
  color: #6fe9cc;
  background: linear-gradient(145deg, rgba(94, 231, 196, .13), rgba(255, 255, 255, .025));
  box-shadow: inset 0 1px rgba(255, 255, 255, .07), 0 10px 28px rgba(0, 0, 0, .2);
}

.brand-button:hover:not(:disabled) {
  border-color: rgba(111, 233, 204, .42);
  color: #a1f2df;
  transform: translateY(-1px);
}

.brand-copy strong {
  color: #f1f5f3;
  font-size: 12px;
  font-weight: 760;
  letter-spacing: .13em;
}

.brand-copy strong b {
  color: #75e4c9;
  font-weight: 760;
}

.brand-copy small {
  margin-top: 4px;
  color: #667079;
  font: 8.5px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .12em;
}

.primary-actions {
  gap: 9px;
  padding: 4px 12px 15px;
}

.new-task {
  min-height: 42px;
  gap: 9px;
  border-color: rgba(126, 224, 200, .22);
  border-radius: 10px;
  padding: 0 10px 0 7px;
  color: #eef6f3;
  background: linear-gradient(180deg, rgba(45, 63, 63, .78), rgba(27, 36, 40, .86));
  box-shadow: inset 0 1px rgba(255, 255, 255, .06), 0 8px 22px rgba(0, 0, 0, .16);
}

.new-task:hover:not(:disabled) {
  border-color: rgba(126, 224, 200, .42);
  background: linear-gradient(180deg, rgba(51, 75, 72, .9), rgba(31, 44, 46, .94));
  transform: translateY(-1px);
}

.new-task-mark {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border-radius: 7px;
  color: #0d1717;
  background: #6fe4c6;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .18), 0 5px 16px rgba(71, 208, 175, .15);
}

.new-task kbd,
.task-search kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.task-search {
  height: 37px;
  border-color: rgba(255, 255, 255, .045);
  border-radius: 9px;
  color: #737e85;
  background: rgba(255, 255, 255, .034);
}

.task-search:focus-within {
  border-color: rgba(111, 228, 198, .33);
  background: rgba(255, 255, 255, .05);
  box-shadow: 0 0 0 3px rgba(94, 231, 196, .055);
}

.section-heading {
  color: #59636c;
  font-size: 9.5px;
  letter-spacing: .13em;
}

.project-list > button {
  min-height: 52px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding-inline: 8px;
}

.project-list > button:hover,
.project-list > button.is-active {
  border-color: rgba(255, 255, 255, .055);
  background: rgba(255, 255, 255, .045);
}

.project-list > button.is-active {
  box-shadow: inset 2px 0 #5ee7c4;
}

.project-icon {
  border: 1px solid rgba(255, 255, 255, .045);
  color: #82a49c;
  background: rgba(255, 255, 255, .05);
}

.project-copy strong { color: #d5dcda; }
.project-copy small { color: #677178; }
.project-badge { border-color: rgba(112, 229, 199, .14); color: #79aa9e; background: rgba(94, 231, 196, .035); }

.history-section,
.sidebar-footer { border-color: rgba(255, 255, 255, .07); }
.history-list article { border: 1px solid transparent; border-radius: 9px; }
.history-list article:hover,
.history-list article.is-selected { border-color: rgba(255, 255, 255, .05); background: rgba(255, 255, 255, .04); }
.history-list article.is-selected { box-shadow: inset 2px 0 #5ee7c4; }
.history-copy strong { color: #cbd4d1; }
.history-copy small { color: #626d74; }
.sidebar-empty strong { color: #7f898e; }
.sidebar-empty p { color: #565f66; }

.sidebar-footer { min-height: 54px; padding-inline: 13px; background: rgba(4, 6, 10, .22); }
.connection-dot { background: #5ee7c4; box-shadow: 0 0 0 3px rgba(94, 231, 196, .08), 0 0 14px rgba(94, 231, 196, .25); }
.connection-state small { color: #566168; }
.connection-state strong { color: #bdc8c5; }

.brand-button,
.new-task,
.project-list > button,
.history-list article,
.icon-button,
.task-search {
  transition: transform 160ms cubic-bezier(.2, .8, .2, 1), border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}

.wb-sidebar :is(button, input):focus-visible {
  outline: 2px solid rgba(94, 231, 196, .85);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .brand-button,
  .new-task,
  .project-list > button,
  .history-list article,
  .icon-button,
  .task-search { transition-duration: 0s; }
}

@media (max-width: 860px) {
  .wb-sidebar { position: fixed; z-index: 70; inset: 0 auto 0 0; width: min(290px, 90vw); visibility: hidden; pointer-events: none; box-shadow: 18px 0 60px rgba(0,0,0,.45); transform: translateX(-103%); transition: transform 170ms ease, visibility 0s linear 170ms; }
  .wb-sidebar.is-open { visibility: visible; pointer-events: auto; transform: translateX(0); transition-delay: 0s; }
  .mobile-close { display: grid; }
}
</style>
