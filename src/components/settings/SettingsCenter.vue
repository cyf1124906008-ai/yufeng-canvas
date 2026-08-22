<template>
  <teleport to="body">
    <section
      v-if="show"
      ref="settingsRoot"
      class="settings-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-center-title"
      tabindex="-1"
      @keydown.esc="close"
    >
        <header class="settings-topbar">
          <button type="button" class="back-button" aria-label="返回 Agent 工作台" @click="close">
            <workbench-icon name="chevron-right" :size="16" />
            <span>返回工作台</span>
          </button>
          <div class="settings-title">
            <span class="settings-mark"><data-eyes-mark :size="24" /></span>
            <div><strong id="settings-center-title">设置</strong><small>DataEyes Code</small></div>
          </div>
          <span class="save-state"><i></i>已自动保存</span>
        </header>

        <div class="settings-layout">
          <aside class="settings-navigation" aria-label="设置分类">
            <p>偏好设置</p>
            <nav>
              <button
                v-for="section in sections"
                :key="section.id"
                type="button"
                :class="{ 'is-active': activeSection === section.id }"
                :aria-current="activeSection === section.id ? 'page' : undefined"
                @click="activeSection = section.id"
              >
                <workbench-icon :name="section.icon" :size="15" />
                <span>{{ section.label }}</span>
                <i v-if="section.id === 'api'" :class="{ 'is-ready': providerConfigured }"></i>
              </button>
            </nav>
            <footer>
              <span>桌面偏好</span>
              <small>本机存储 · 不会同步 API Key</small>
            </footer>
          </aside>

          <main class="settings-content">
            <header class="content-heading">
              <div class="heading-copy">
                <h1>{{ currentSection.label }}</h1>
                <p>{{ currentSection.description }}</p>
              </div>
            </header>

            <div class="settings-scroll">
              <template v-if="activeSection === 'general'">
                <section class="settings-group">
                  <header><strong>工作台</strong><small>窗口和任务运行体验</small></header>
                  <div class="setting-row">
                    <div><strong>默认打开 Inspector</strong><p>进入工作台时显示计划、变更、终端和产物面板。</p></div>
                    <button type="button" class="switch" role="switch" :aria-checked="defaultInspector" :class="{ 'is-on': defaultInspector }" @click="settings.state.defaultInspector = !defaultInspector"><i></i></button>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>关闭窗口后留在后台</strong>
                      <p>在 macOS 关闭最后一个窗口时保留 Agent 运行时；计划自动化需要此项。</p>
                      <small class="availability" :class="{ 'is-unavailable': !desktopReady }">{{ desktopReady ? '仅桌面 App 生效' : 'Web 预览不可用' }}</small>
                    </div>
                    <button type="button" class="switch" role="switch" :disabled="!desktopReady" :aria-checked="backgroundMode" :class="{ 'is-on': backgroundMode }" @click="settings.state.backgroundMode = !backgroundMode"><i></i></button>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>登录后启动</strong>
                      <p>登录 macOS / Windows 后启动 DataEyes Code；不会自动开始任何任务。</p>
                      <small class="availability" :class="{ 'is-unavailable': !desktopReady }">{{ desktopReady ? '仅桌面 App 生效' : 'Web 预览不可用' }}</small>
                    </div>
                    <button type="button" class="switch" role="switch" :disabled="!desktopReady" :aria-checked="launchAtLogin" :class="{ 'is-on': launchAtLogin }" @click="settings.state.launchAtLogin = !launchAtLogin"><i></i></button>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>任务运行时防止休眠</strong>
                      <p>只在 Agent 任务执行期间请求桌面运行时保持唤醒；任务结束后立即释放。</p>
                      <small class="availability" :class="{ 'is-unavailable': !desktopReady }">{{ desktopReady ? '桌面能力可用 · 下个任务生效' : 'Web 预览不可用' }}</small>
                    </div>
                    <button type="button" class="switch" role="switch" :disabled="!desktopReady" :aria-checked="preventSleepDuringRuns" :class="{ 'is-on': preventSleepDuringRuns }" @click="settings.state.preventSleepDuringRuns = !preventSleepDuringRuns"><i></i></button>
                  </div>
                </section>
              </template>

              <template v-else-if="activeSection === 'appearance'">
                <section class="settings-group">
                  <header><strong>主题</strong><small>立即应用到设置、对话与系统控件</small></header>
                  <div class="setting-stack">
                    <div><strong>颜色模式</strong><p>“跟随系统”会响应 macOS / Windows 的外观变化。</p></div>
                    <div class="choice-grid is-three" role="radiogroup" aria-label="颜色模式">
                      <button v-for="option in themeOptions" :key="option.id" type="button" role="radio" :aria-checked="theme === option.id" :class="{ 'is-selected': theme === option.id }" @click="settings.setTheme(option.id)">
                        <workbench-icon :name="option.icon" :size="17" /><strong>{{ option.label }}</strong><small>{{ option.description }}</small>
                      </button>
                    </div>
                  </div>
                  <div class="setting-stack">
                    <div><strong>界面密度</strong><p>调整任务列表、工具栏和设置行的垂直间距。</p></div>
                    <div class="choice-grid is-two" role="radiogroup" aria-label="界面密度">
                      <button v-for="option in densityOptions" :key="option.id" type="button" role="radio" :aria-checked="density === option.id" :class="{ 'is-selected': density === option.id }" @click="settings.setDensity(option.id)">
                        <workbench-icon :name="option.icon" :size="17" /><strong>{{ option.label }}</strong><small>{{ option.description }}</small>
                      </button>
                    </div>
                  </div>
                </section>
              </template>

              <template v-else-if="activeSection === 'agent'">
                <section class="settings-group">
                  <header><strong>执行边界</strong><small>任务规划与工具调用</small></header>
                  <div class="setting-stack">
                    <div class="harness-status" :class="{ 'is-ready': harnessRuntime?.lifecycle === 'ready' }">
                      <span><i></i><strong>DeepSeek Harness</strong><small>Cordis {{ harnessRuntime?.versions?.cordis || '—' }} · {{ harnessRuntime?.pluginCount || 0 }} 个插件</small></span>
                      <em>生命周期作用域 · 权限仍由 DataEyes 管理</em>
                    </div>
                    <div><strong>执行引擎</strong><p>选择负责拆解任务的规划器。无论选择哪一个，文件、终端和电脑操作都继续经过 DataEyes ToolRegistry 与审批边界。</p></div>
                    <div class="choice-grid is-two engine-choice" role="radiogroup" aria-label="Agent 执行引擎">
                      <button type="button" role="radio" :aria-checked="agentEngine === 'native'" :class="{ 'is-selected': agentEngine === 'native' }" :disabled="runtimeLocked" @click="emit('update-agent-engine', 'native')">
                        <workbench-icon name="brain" :size="17" /><strong>DataEyes Native</strong><small>直接使用当前 Provider 的聊天模型</small>
                      </button>
                      <button type="button" role="radio" :aria-checked="agentEngine === 'opencode'" :class="{ 'is-selected': agentEngine === 'opencode' }" :disabled="runtimeLocked || !desktopReady" @click="emit('update-agent-engine', 'opencode')">
                        <workbench-icon name="terminal" :size="17" /><strong>OpenCode Local</strong><small>{{ opencodeStatus?.state === 'running' ? '本地 sidecar 已连接' : (desktopReady ? '启动本地 sidecar 后使用' : '仅桌面 App 可用') }}</small>
                      </button>
                    </div>
                    <div class="engine-status" :class="{ 'is-ready': opencodeStatus?.state === 'running' }">
                      <span><i></i>{{ opencodeStatus?.state === 'running' ? `OpenCode ${opencodeStatus?.version || ''} · ${opencodeStatus?.url || '本机'}` : 'OpenCode 尚未运行' }}</span>
                      <button v-if="opencodeStatus?.state === 'running'" type="button" class="secondary-action" :disabled="runtimeLocked" @click="emit('stop-opencode')">停止</button>
                      <button v-else type="button" class="secondary-action" :disabled="runtimeLocked || !desktopReady" @click="emit('start-opencode')">启动</button>
                    </div>
                  </div>
                  <div class="setting-stack">
                    <div><strong>默认审批模式</strong><p>只控制工具门，不会阻止 Planner 使用当前聊天模型。</p></div>
                    <div class="approval-grid" role="radiogroup" aria-label="默认审批模式">
                      <button
                        v-for="mode in approvalModes"
                        :key="mode.id"
                        type="button"
                        role="radio"
                        :disabled="runtimeLocked"
                        :aria-checked="approvalMode === mode.id"
                        :class="[`is-${mode.tone}`, { 'is-selected': approvalMode === mode.id }]"
                        @click="emit('update-approval-mode', mode.id)"
                      >
                        <span><i></i><strong>{{ mode.label }}</strong></span>
                        <p>{{ mode.description }}</p>
                      </button>
                    </div>
                    <small v-if="runtimeLocked" class="inline-notice">任务执行或等待审批期间不能切换审批模式。</small>
                  </div>
                  <div class="setting-stack reasoning-setting">
                    <div><strong>推理强度</strong><p>控制支持该参数的聊天模型在规划与分析时投入的推理量；下个任务生效。</p></div>
                    <div class="reasoning-effort-grid" role="radiogroup" aria-label="推理强度">
                      <button
                        v-for="option in reasoningEffortOptions"
                        :key="option.id"
                        type="button"
                        role="radio"
                        :aria-checked="reasoningEffort === option.id"
                        :class="[`is-${option.tone}`, { 'is-selected': reasoningEffort === option.id }]"
                        @click="settings.setReasoningEffort(option.id)"
                      >
                        <span>{{ option.short }}</span>
                        <strong>{{ option.label }}</strong>
                        <small>{{ option.description }}</small>
                      </button>
                    </div>
                    <p class="reasoning-support-note"><workbench-icon name="info" :size="13" />不同模型支持的强度范围不同；Provider 明确不支持所选档位时会回退到模型默认强度，并写入运行日志。</p>
                  </div>
                  <div class="setting-row action-limit-row">
                    <div><strong>单轮最大行动步数</strong><p>防止 Agent 在一次回复中无限调用工具；范围 4–64，下个任务生效。</p></div>
                    <label class="number-control">
                      <button type="button" aria-label="减少最大行动步数" @click="settings.setMaxActionsPerTurn(maxActionsPerTurn - 1)">−</button>
                      <input
                        :value="maxActionsPerTurn"
                        type="number"
                        name="max-actions-per-turn"
                        inputmode="numeric"
                        autocomplete="off"
                        min="4"
                        max="64"
                        aria-label="单轮最大行动步数"
                        @change="onMaxActionsChange"
                      />
                      <button type="button" aria-label="增加最大行动步数" @click="settings.setMaxActionsPerTurn(maxActionsPerTurn + 1)">＋</button>
                    </label>
                  </div>
                </section>
              </template>

              <template v-else-if="activeSection === 'tools'">
                <section class="settings-group">
                  <header><strong>可用工具组</strong><small>关闭后 Agent 在后续行动中不会看到或调用该组工具</small></header>
                  <div v-for="tool in toolOptions" :key="tool.id" class="setting-row tool-row">
                    <span class="row-icon"><workbench-icon :name="tool.icon" :size="16" /></span>
                    <div><strong>{{ tool.label }}</strong><p>{{ tool.description }}</p><small>{{ tool.scope }}</small></div>
                    <button type="button" class="switch" role="switch" :disabled="toolChangesLocked" :aria-checked="tools[tool.id]" :class="{ 'is-on': tools[tool.id] }" @click="settings.setToolEnabled(tool.id, !tools[tool.id])"><i></i></button>
                  </div>
                  <p class="safety-note"><workbench-icon name="shield" :size="14" />启用工具不等于授权操作；普通模式仍受逐次审批，完全访问则必须先通过风险页和系统级确认。</p>
                </section>
              </template>

              <template v-else-if="activeSection === 'api'">
                <section class="settings-group provider-card">
                  <header><strong>模型服务</strong><small>Provider、凭据与模型目录</small></header>
                  <div class="provider-summary">
                    <span class="provider-logo">{{ providerInitial }}</span>
                    <div><strong>{{ providerLabel || '未选择 Provider' }}</strong><p>{{ providerConfigured ? '已检测到本机 API 配置' : '尚未配置可用 API Key' }}</p></div>
                    <span class="provider-status" :class="{ 'is-ready': providerConfigured }"><i></i>{{ providerConfigured ? '已配置' : '未配置' }}</span>
                  </div>
                  <p class="provider-copy">Provider 控制台负责连接地址、能力专用 Key、模型同步与协议设置。凭据继续由现有 API 配置层管理，不复制到通用偏好中。</p>
                  <button type="button" class="primary-action" @click="emit('open-api-settings')">
                    <workbench-icon name="key" :size="15" />打开 Provider 与模型控制台<workbench-icon name="chevron-right" :size="14" />
                  </button>
                </section>
              </template>

              <template v-else-if="activeSection === 'automation'">
                <section class="settings-group automation-slot" data-settings-slot="automation">
                  <slot name="automations" />
                </section>
              </template>

              <template v-else-if="activeSection === 'data'">
                <section class="settings-group">
                  <header><strong>本机数据</strong><small>备份配置与恢复工作环境</small></header>
                  <div class="setting-row data-row">
                    <div><strong>导出用户数据</strong><p>导出 Provider 配置、模型目录、偏好和本地项目数据。文件可能包含 API Key，请妥善保管。</p></div>
                    <button type="button" class="secondary-action" :disabled="!desktopReady || dataBusy" @click="exportData">导出…</button>
                  </div>
                  <div class="setting-row data-row">
                    <div><strong>导入用户数据</strong><p>从 DataEyes Code 数据包覆盖当前本地配置；导入成功后需要重新加载界面。</p></div>
                    <button type="button" class="secondary-action" :disabled="!desktopReady || dataBusy" @click="importData">导入…</button>
                  </div>
                  <div class="setting-row data-row">
                    <div><strong>重置界面与 Agent 偏好</strong><p>只重置本页偏好，不会删除 API Key、项目或任务历史。审批模式恢复为“每次审批”。</p></div>
                    <button type="button" class="danger-action" :disabled="runtimeLocked" @click="resetPreferences">重置偏好</button>
                  </div>
                  <p v-if="dataStatus" class="data-status" role="status">{{ dataStatus }}</p>
                </section>
              </template>

              <template v-else-if="activeSection === 'about'">
                <section class="settings-group about-card">
                  <span class="about-mark"><data-eyes-mark :size="48" /></span>
                  <div><p>DATAEYES CODE</p><h2>Agent Workbench</h2><span>{{ appVersion ? `版本 ${appVersion}` : (desktopReady ? '正在读取版本…' : 'Web 预览') }}</span></div>
                  <p>本地优先的 Agent Harness：规划任务、调用工作区与桌面工具，并在明确的审批边界内交付结果。</p>
                  <a :href="githubUrl" target="_blank" rel="noopener noreferrer">查看源代码与发布记录 ↗</a>
                </section>
              </template>
            </div>
          </main>
        </div>
    </section>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { getGithubUrl } from '../../config/distribution.js'
import { useAgentSettings } from '../../stores/settings.js'
import { exportUserDataToFile, importUserDataFromFile } from '../../utils/appDataBackup.js'
import DataEyesMark from '../brand/DataEyesMark.vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { WORKBENCH_APPROVAL_MODES } from '../workbench/workbenchView.js'
import { REASONING_EFFORT_OPTIONS } from './reasoningView.js'

defineOptions({ name: 'SettingsCenter' })

const props = defineProps({
  show: { type: Boolean, default: false },
  initialSection: { type: String, default: 'general' },
  desktopReady: { type: Boolean, default: false },
  runtimeLocked: { type: Boolean, default: false },
  toolChangesLocked: { type: Boolean, default: false },
  approvalMode: { type: String, default: 'ask' },
  providerLabel: { type: String, default: '' },
  providerConfigured: { type: Boolean, default: false },
  agentEngine: { type: String, default: 'native' },
  opencodeStatus: { type: Object, default: () => ({ state: 'unknown' }) },
  harnessRuntime: { type: Object, default: () => ({ lifecycle: 'starting', pluginCount: 0, versions: {} }) }
})

const emit = defineEmits({
  'update:show': value => typeof value === 'boolean',
  'open-api-settings': () => true,
  'update-approval-mode': mode => WORKBENCH_APPROVAL_MODES.some(item => item.id === mode),
  'update-agent-engine': value => ['native', 'opencode'].includes(value),
  'start-opencode': () => true,
  'stop-opencode': () => true
})

const settings = useAgentSettings()
const {
  theme,
  density,
  defaultInspector,
  backgroundMode,
  launchAtLogin,
  preventSleepDuringRuns,
  reasoningEffort,
  maxActionsPerTurn,
  tools
} = settings
const settingsRoot = ref(null)
const activeSection = ref('general')
const appVersion = ref('')
const dataBusy = ref(false)
const dataStatus = ref('')
const githubUrl = getGithubUrl()
const approvalModes = WORKBENCH_APPROVAL_MODES
const reasoningEffortOptions = REASONING_EFFORT_OPTIONS

const sections = [
  { id: 'general', label: '常规', icon: 'settings', eyebrow: 'GENERAL', description: '控制工作台的默认行为和桌面运行体验。' },
  { id: 'appearance', label: '外观', icon: 'eye', eyebrow: 'APPEARANCE', description: '调整主题与信息密度，变化会立即应用。' },
  { id: 'agent', label: 'Agent', icon: 'brain', eyebrow: 'AGENT', description: '设置自主执行边界和单轮行动上限。' },
  { id: 'tools', label: '工具与权限', icon: 'shield', eyebrow: 'TOOLS & PERMISSIONS', description: '决定 Agent 能看到哪些工具组；系统权限仍由操作系统管理。' },
  { id: 'api', label: 'API 与模型', icon: 'key', eyebrow: 'PROVIDERS & MODELS', description: '管理真实 Provider 连接、凭据与模型能力目录。' },
  { id: 'automation', label: '自动化', icon: 'automation', eyebrow: 'AUTOMATION', description: '创建、暂停或立即运行本地计划任务；App 需要保持运行。' },
  { id: 'data', label: '数据', icon: 'database', eyebrow: 'LOCAL DATA', description: '导入、导出并重置当前设备上的用户偏好。' },
  { id: 'about', label: '关于', icon: 'info', eyebrow: 'ABOUT', description: '查看产品版本、定位与项目链接。' }
]
const validSections = new Set(sections.map(section => section.id))
const currentSection = computed(() => sections.find(section => section.id === activeSection.value) || sections[0])
const providerInitial = computed(() => String(props.providerLabel || 'D').trim().slice(0, 1).toUpperCase())

const themeOptions = [
  { id: 'system', label: '跟随系统', description: '自动匹配设备', icon: 'monitor' },
  { id: 'light', label: '浅色', description: '明亮工作区', icon: 'sun' },
  { id: 'dark', label: '深色', description: '低光工作区', icon: 'moon' }
]
const densityOptions = [
  { id: 'comfortable', label: '舒适', description: '更宽松的留白', icon: 'layout' },
  { id: 'compact', label: '紧凑', description: '显示更多内容', icon: 'list' }
]
const toolOptions = [
  { id: 'workspaceRead', label: '读取项目', icon: 'folder', description: '查看当前工作区根目录、列出文件、读取文本与搜索内容。', scope: '只读工具；限制在默认或用户选择的 workspace root 内' },
  { id: 'workspaceWrite', label: '修改项目', icon: 'git-diff', description: '新建或覆盖文件、应用精确补丁与条件回滚。', scope: '高风险工具；受审批模式和文件校验双重约束' },
  { id: 'terminal', label: '终端命令', icon: 'terminal', description: '以 executable + 参数数组运行受控进程。', scope: '不使用 shell 字符串拼接；高风险操作仍需确认' },
  { id: 'computer', label: '电脑控制', icon: 'monitor', description: '查看屏幕、打开应用、点击和输入文字。', scope: '依赖操作系统屏幕录制与辅助功能权限' },
  { id: 'creative', label: '创作生成', icon: 'sparkles', description: '调用图片或视频模型并保存产物。', scope: '可能产生模型费用；受审批模式控制' }
]

const close = () => emit('update:show', false)
const onMaxActionsChange = event => settings.setMaxActionsPerTurn(event.target?.value)

const resetPreferences = () => {
  if (props.runtimeLocked) return
  if (!globalThis.confirm?.('只重置界面与 Agent 偏好？API Key、项目和任务历史不会被删除。')) return
  settings.reset()
  emit('update-approval-mode', 'ask')
  dataStatus.value = '偏好已恢复为安全默认值。'
}

const exportData = async () => {
  dataBusy.value = true
  dataStatus.value = ''
  try {
    const result = await exportUserDataToFile()
    dataStatus.value = result?.canceled ? '已取消导出。' : '用户数据已导出。请妥善保管，其中可能包含 API Key。'
  } catch (error) {
    dataStatus.value = error?.message || '导出失败。'
  } finally {
    dataBusy.value = false
  }
}

const importData = async () => {
  if (!globalThis.confirm?.('导入会覆盖当前本地配置。确定继续吗？')) return
  dataBusy.value = true
  dataStatus.value = ''
  try {
    const result = await importUserDataFromFile({ overwrite: true })
    if (result?.canceled) dataStatus.value = '已取消导入。'
    else dataStatus.value = '导入完成。重新启动 App 后所有设置生效。'
  } catch (error) {
    dataStatus.value = error?.message || '导入失败。'
  } finally {
    dataBusy.value = false
  }
}

watch(() => [props.show, props.initialSection], async ([show, section]) => {
  if (!show) return
  activeSection.value = validSections.has(section) ? section : 'general'
  dataStatus.value = ''
  await nextTick()
  settingsRoot.value?.focus()
}, { immediate: true })

onMounted(async () => {
  if (typeof globalThis.window?.desktopApp?.getVersion !== 'function') return
  try {
    appVersion.value = String(await globalThis.window.desktopApp.getVersion())
  } catch {
    appVersion.value = ''
  }
})
</script>

<style scoped>
/* Quiet system surface: one neutral hierarchy shared by light and dark mode. */
.settings-center {
  --sc-bg: #f5f5f7;
  --sc-panel: #ffffff;
  --sc-panel-raised: #fafafc;
  --sc-subtle: #eeeeF0;
  --sc-hover: #e7e7ea;
  --sc-border: #d8d8dc;
  --sc-border-strong: #c5c5ca;
  --sc-text: #1d1d1f;
  --sc-muted: #6e6e73;
  --sc-faint: #8e8e93;
  --sc-accent: #147d92;
  --sc-accent-bright: #34c759;
  --sc-cyan: #147d92;
  --sc-warning: #9a6700;
  --sc-danger: #c9343f;
  --sc-focus: #007aff;
  --sc-accent-soft: rgba(20, 125, 146, .1);
  --sc-shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 8px 24px rgba(0, 0, 0, .035);
  position: fixed;
  z-index: 1800;
  inset: 0;
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  overflow: hidden;
  isolation: isolate;
  outline: 2px solid transparent;
  outline-offset: -2px;
  color: var(--sc-text);
  background: var(--sc-bg);
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI Variable", "Microsoft YaHei UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

:global(html.dark .settings-center) {
  --sc-bg: #0e0e10;
  --sc-panel: #1c1c1e;
  --sc-panel-raised: #242426;
  --sc-subtle: #151517;
  --sc-hover: #2c2c2e;
  --sc-border: #38383a;
  --sc-border-strong: #4a4a4e;
  --sc-text: #f5f5f7;
  --sc-muted: #a1a1a6;
  --sc-faint: #8e8e93;
  --sc-accent: #64d2ff;
  --sc-accent-bright: #30d158;
  --sc-cyan: #64d2ff;
  --sc-warning: #ffd60a;
  --sc-danger: #ff6961;
  --sc-focus: #0a84ff;
  --sc-accent-soft: rgba(100, 210, 255, .12);
  --sc-shadow: 0 1px 2px rgba(0, 0, 0, .24), 0 10px 28px rgba(0, 0, 0, .18);
  color-scheme: dark;
  background: var(--sc-bg);
}

.settings-center :is(button, a, input) {
  font: inherit;
}

.settings-center :is(button, a, input, .choice-grid button, .switch, .primary-action, .secondary-action, .danger-action) {
  transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, opacity 160ms ease !important;
}

.settings-center :is(button, a, input):focus-visible {
  outline: 2px solid var(--sc-focus) !important;
  outline-offset: 3px;
}

.settings-center :is(button, a, input):focus:not(:focus-visible) {
  outline: none;
}

.settings-center :is(button, a, input):disabled {
  cursor: not-allowed;
}

.settings-topbar {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--sc-border);
  padding: 0 20px;
  background: color-mix(in srgb, var(--sc-panel) 88%, transparent);
  backdrop-filter: blur(20px) saturate(1.2);
}

.back-button {
  display: inline-flex;
  width: max-content;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 0 10px;
  color: var(--sc-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -.01em;
}

.back-button svg { transform: rotate(180deg); }
.back-button:hover { color: var(--sc-text); background: var(--sc-hover); border-color: var(--sc-border); }

.settings-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: max-content;
}

.settings-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--sc-accent) 38%, var(--sc-border));
  border-radius: 8px;
  color: var(--sc-accent);
  background: var(--sc-accent-soft);
}

.settings-mark :deep(svg) { width: 22px; height: 22px; }
.settings-title strong, .settings-title small { display: block; text-align: left; }
.settings-title strong { font-size: 14px; font-weight: 600; letter-spacing: -.01em; }
.settings-title small { margin-top: 1px; color: var(--sc-faint); font-size: 11px; line-height: 1.2; }

.save-state {
  display: inline-flex;
  justify-self: end;
  align-items: center;
  gap: 8px;
  color: var(--sc-faint);
  font-size: 12px;
  white-space: nowrap;
}

.save-state i,
.heading-status i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--sc-accent) 55%, transparent);
  border-radius: 50%;
  background: var(--sc-accent-bright);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sc-accent) 13%, transparent), 0 0 12px color-mix(in srgb, var(--sc-accent-bright) 50%, transparent);
}

.settings-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  width: min(1400px, 100%);
  min-height: 0;
  margin: 0 auto;
}

.settings-navigation {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  border-right: 1px solid var(--sc-border);
  padding: 24px 12px 18px;
  background: var(--sc-subtle);
}

.settings-navigation > p {
  padding: 0 12px 12px;
  color: var(--sc-faint);
  font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.settings-navigation nav { display: grid; align-content: start; gap: 4px; }

.settings-navigation nav button {
  position: relative;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 8px;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 12px;
  color: var(--sc-muted);
  font-size: 13px;
  font-weight: 560;
  text-align: left;
}

.settings-navigation nav button::before {
  position: absolute;
  inset: 9px auto 9px 0;
  width: 2px;
  border-radius: 2px;
  background: var(--sc-cyan);
  content: "";
  opacity: 0;
  transform: scaleY(.35);
  transition: opacity 160ms ease, transform 160ms ease !important;
}

.settings-navigation nav button:hover { color: var(--sc-text); background: var(--sc-hover); border-color: var(--sc-border); }
.settings-navigation nav button.is-active { color: var(--sc-text); background: var(--sc-panel); border-color: var(--sc-border); box-shadow: 0 1px 2px rgba(0, 0, 0, .035); }
.settings-navigation nav button.is-active::before { opacity: 1; transform: scaleY(1); }
.settings-navigation nav button svg { color: var(--sc-faint); }
.settings-navigation nav button.is-active svg { color: var(--sc-accent); }
.settings-navigation nav button > i { width: 7px; height: 7px; border: 1px solid var(--sc-border-strong); border-radius: 50%; background: transparent; }
.settings-navigation nav button > i.is-ready { border-color: var(--sc-accent); background: var(--sc-accent-bright); box-shadow: 0 0 0 3px var(--sc-accent-soft); }

.settings-navigation footer { border-top: 1px solid var(--sc-border); padding: 16px 12px 0; }
.settings-navigation footer span, .settings-navigation footer small { display: block; }
.settings-navigation footer span { color: var(--sc-muted); font-size: 12px; font-weight: 650; }
.settings-navigation footer small { margin-top: 5px; color: var(--sc-faint); font-size: 11px; line-height: 1.45; }

.settings-content { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; background: transparent; }

.content-heading {
  border-bottom: 1px solid var(--sc-border);
  padding: 28px clamp(28px, 5vw, 64px) 21px;
}

.content-heading > div { width: min(780px, 100%); margin: 0 auto; }
.heading-overline { display: flex; align-items: center; gap: 14px; }
.content-heading span:first-child { color: var(--sc-cyan); font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 750; letter-spacing: .14em; }
.heading-status { display: inline-flex; align-items: center; gap: 7px; color: var(--sc-faint); font-size: 11px; }
.heading-status i { width: 6px; height: 6px; box-shadow: none; }
.content-heading h1 { margin: 0; color: var(--sc-text); font-size: clamp(25px, 2.2vw, 29px); font-weight: 600; letter-spacing: -.035em; line-height: 1.2; text-wrap: balance; }
.content-heading p { max-width: 680px; margin: 7px 0 0; color: var(--sc-muted); font-size: 13px; line-height: 1.55; text-wrap: pretty; }

.settings-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px clamp(28px, 5vw, 64px) 64px;
  scrollbar-color: var(--sc-border-strong) transparent;
  scrollbar-width: thin;
}

.settings-group {
  width: min(780px, 100%);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--sc-border);
  border-radius: 14px;
  background: var(--sc-panel);
  box-shadow: var(--sc-shadow);
}

.settings-group > header {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--sc-border);
  padding: 13px 18px;
  background: color-mix(in srgb, var(--sc-panel-raised) 72%, var(--sc-panel));
}

.settings-group > header strong { color: var(--sc-text); font-size: 14px; font-weight: 700; letter-spacing: -.01em; }
.settings-group > header small { color: var(--sc-faint); font-size: 12px; line-height: 1.4; text-align: right; }

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  min-height: 78px;
  padding: 16px 18px;
}

.setting-row + .setting-row, .setting-stack + .setting-stack { border-top: 1px solid var(--sc-border); }
.setting-row strong, .setting-stack strong { color: var(--sc-text); font-size: 13px; font-weight: 680; line-height: 1.35; }
.setting-row p, .setting-stack p { margin: 6px 0 0; color: var(--sc-muted); font-size: 12.5px; line-height: 1.6; }
.availability { display: block; margin-top: 7px; color: var(--sc-accent); font-size: 11px; line-height: 1.35; }
.availability.is-unavailable { color: var(--sc-warning); }

.switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex: 0 0 auto;
  border: 1px solid var(--sc-border-strong);
  border-radius: 999px;
  background: var(--sc-subtle) !important;
  box-shadow: inset 0 1px 2px rgba(12, 28, 22, .1) !important;
}

.switch i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--sc-faint); box-shadow: 0 2px 5px rgba(0, 0, 0, .22); transition: transform 160ms ease, background-color 160ms ease !important; }
.switch.is-on { border-color: var(--sc-accent); background: var(--sc-accent) !important; box-shadow: 0 0 0 3px var(--sc-accent-soft) !important; }
.switch.is-on i { background: #fff; transform: translateX(18px); }
.switch:disabled { opacity: .45; }

.setting-stack { padding: 20px; }
.choice-grid { display: grid; gap: 10px; margin-top: 16px; }
.choice-grid.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.choice-grid.is-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.choice-grid button {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 4px 10px;
  min-height: 78px;
  border: 1px solid var(--sc-border);
  border-radius: 12px;
  padding: 13px 14px;
  color: var(--sc-muted);
  background: var(--sc-panel-raised);
  text-align: left;
}

.choice-grid button:hover { color: var(--sc-text); border-color: var(--sc-border-strong); background: var(--sc-hover); }
.choice-grid button.is-selected { border-color: var(--sc-accent); color: var(--sc-accent); background: var(--sc-accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sc-accent) 20%, transparent); }
.choice-grid button svg { grid-row: 1 / 3; color: currentColor; }
.choice-grid button strong { color: inherit; font-size: 13px; }
.choice-grid button small { color: var(--sc-faint); font-size: 11px; line-height: 1.4; }
.engine-choice button { min-height: 92px; }

.engine-status { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; border: 1px solid var(--sc-border); border-radius: 10px; padding: 8px 12px; color: var(--sc-faint); background: var(--sc-subtle); font-size: 11px; }
.engine-status > span { display: inline-flex; min-width: 0; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.engine-status i { width: 7px; height: 7px; flex: 0 0 auto; border: 1px solid var(--sc-border-strong); border-radius: 50%; background: transparent; }
.engine-status.is-ready { color: var(--sc-accent); }
.engine-status.is-ready i { border-color: var(--sc-accent); background: var(--sc-accent-bright); box-shadow: 0 0 0 3px var(--sc-accent-soft); }
.harness-status { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 17px; border: 1px solid var(--sc-border); border-radius: 10px; padding: 9px 11px; color: var(--sc-muted); background: var(--sc-subtle); }
.harness-status > span { display: grid; grid-template-columns: 8px auto; align-items: center; gap: 2px 8px; min-width: 0; }
.harness-status i { grid-row: 1 / 3; width: 7px; height: 7px; border-radius: 50%; background: var(--sc-faint); }
.harness-status strong { color: var(--sc-text); font-size: 12px; }
.harness-status small { overflow: hidden; color: var(--sc-faint); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.harness-status em { color: var(--sc-faint); font-size: 10.5px; font-style: normal; text-align: right; }
.harness-status.is-ready i { background: var(--sc-accent); box-shadow: 0 0 0 3px var(--sc-accent-soft); }

.approval-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
.approval-grid button { min-height: 116px; border: 1px solid var(--sc-border); border-radius: 12px; padding: 14px; color: var(--sc-muted); background: var(--sc-panel-raised); text-align: left; }
.approval-grid button:hover { color: var(--sc-text); border-color: var(--sc-border-strong); background: var(--sc-hover); }
.approval-grid button.is-selected { border-color: var(--sc-accent); background: var(--sc-accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sc-accent) 26%, transparent); }
.approval-grid button:disabled { opacity: .48; }
.approval-grid button > span { display: flex; align-items: center; gap: 9px; color: var(--sc-text); }
.approval-grid button > span i { width: 8px; height: 8px; border: 1px solid var(--sc-border-strong); border-radius: 50%; background: transparent; }
.approval-grid button.is-ask > span i { border-color: var(--sc-warning); background: var(--sc-warning); }
.approval-grid button.is-auto > span i { border-color: var(--sc-accent); background: var(--sc-accent); }
.approval-grid button.is-full > span i { border-color: var(--sc-danger); background: var(--sc-danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sc-danger) 14%, transparent); }
.approval-grid button.is-full.is-selected { border-color: var(--sc-danger); background: color-mix(in srgb, var(--sc-danger) 9%, var(--sc-panel)); }
.approval-grid button p { margin: 9px 0 0; color: var(--sc-muted); font-size: 12px; line-height: 1.55; }

.reasoning-effort-grid { display: grid; grid-template-columns: repeat(7, minmax(88px, 1fr)); gap: 8px; margin-top: 16px; }
.reasoning-effort-grid button { display: grid; min-width: 0; min-height: 92px; align-content: start; justify-items: start; border: 1px solid var(--sc-border); border-radius: 11px; padding: 11px 10px; color: var(--sc-muted); background: var(--sc-panel-raised); text-align: left; }
.reasoning-effort-grid button:hover { color: var(--sc-text); border-color: var(--sc-border-strong); background: var(--sc-hover); }
.reasoning-effort-grid button.is-selected { border-color: var(--sc-accent); color: var(--sc-text); background: var(--sc-accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sc-accent) 24%, transparent); }
.reasoning-effort-grid button.is-max.is-selected { border-color: #9a72c5; background: color-mix(in srgb, #9a72c5 11%, var(--sc-panel)); box-shadow: inset 0 0 0 1px rgba(172, 116, 215, .26); }
.reasoning-effort-grid button > span { color: var(--sc-cyan); font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .05em; }
.reasoning-effort-grid button.is-max > span { color: #a875d3; }
.reasoning-effort-grid button strong { margin-top: 8px; color: inherit; font-size: 12px; }
.reasoning-effort-grid button small { display: -webkit-box; overflow: hidden; margin-top: 4px; color: var(--sc-faint); font-size: 10px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.reasoning-support-note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; color: var(--sc-faint); font-size: 11px; line-height: 1.55; }
.reasoning-support-note svg { flex: 0 0 auto; margin-top: 2px; color: #a875d3; }
.inline-notice { display: block; margin-top: 10px; color: var(--sc-warning); font-size: 11px; }

.number-control { display: grid; grid-template-columns: 34px 56px 34px; overflow: hidden; border: 1px solid var(--sc-border-strong); border-radius: 9px; background: var(--sc-subtle); }
.number-control button { color: var(--sc-muted); background: transparent; }
.number-control button:hover { color: var(--sc-text); background: var(--sc-hover); }
.number-control input { width: 56px; height: 34px; border: 0; border-right: 1px solid var(--sc-border); border-left: 1px solid var(--sc-border); outline: none; color: var(--sc-text); background: var(--sc-panel); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; appearance: textfield; }
.number-control input::-webkit-inner-spin-button { display: none; }

.tool-row { grid-template-columns: 38px minmax(0, 1fr) auto; }
.row-icon { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid color-mix(in srgb, var(--sc-accent) 24%, var(--sc-border)); border-radius: 10px; color: var(--sc-accent); background: var(--sc-accent-soft); }
.tool-row div > small { display: block; margin-top: 6px; color: var(--sc-faint); font-size: 11px; line-height: 1.4; }
.safety-note { display: flex; align-items: flex-start; gap: 9px; margin: 0; border-top: 1px solid var(--sc-border); padding: 14px 20px; color: var(--sc-muted); background: var(--sc-subtle); font-size: 11.5px; line-height: 1.55; }
.safety-note svg { margin-top: 2px; color: var(--sc-accent); }

.provider-summary { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 13px; margin: 20px 20px 0; border: 1px solid var(--sc-border); border-radius: 12px; padding: 13px; background: var(--sc-subtle); }
.provider-logo { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid color-mix(in srgb, var(--sc-accent) 38%, var(--sc-border)); border-radius: 11px; color: var(--sc-accent); background: var(--sc-accent-soft); font: 16px/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 760; }
.provider-summary strong { color: var(--sc-text); font-size: 13px; }
.provider-summary p { margin: 4px 0 0; color: var(--sc-muted); font-size: 11.5px; }
.provider-status { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--sc-border); border-radius: 999px; padding: 5px 9px; color: var(--sc-faint); font-size: 11px; }
.provider-status i { width: 6px; height: 6px; border: 1px solid var(--sc-border-strong); border-radius: 50%; background: transparent; }
.provider-status.is-ready { color: var(--sc-accent); border-color: color-mix(in srgb, var(--sc-accent) 36%, var(--sc-border)); }
.provider-status.is-ready i { border-color: var(--sc-accent); background: var(--sc-accent-bright); }
.provider-copy { margin: 15px 20px 0; color: var(--sc-muted); font-size: 12.5px; line-height: 1.65; }

.primary-action {
  display: flex;
  width: calc(100% - 40px);
  min-height: 44px;
  align-items: center;
  gap: 8px;
  margin: 18px 20px 20px;
  border: 1px solid var(--sc-accent) !important;
  border-radius: 10px;
  padding: 0 13px;
  color: #08291d !important;
  background: var(--sc-accent-bright) !important;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--sc-accent) 16%, transparent) !important;
  font-size: 12px;
  font-weight: 720;
}

:global(html.dark .settings-center .primary-action) { color: #061b13 !important; }
.primary-action svg:last-child { margin-left: auto; }
.primary-action:hover { background: #66dba8 !important; box-shadow: 0 10px 24px color-mix(in srgb, var(--sc-accent) 23%, transparent) !important; transform: translateY(-1px); }

.settings-center .primary-action::before,
.settings-center .primary-action::after,
.settings-center .secondary-action::before,
.settings-center .secondary-action::after { display: none !important; content: none !important; }

.automation-slot { min-height: 300px; }
.data-row { min-height: 96px; }
.secondary-action, .danger-action { min-width: 84px; height: 36px; border: 1px solid var(--sc-border-strong) !important; border-radius: 9px; padding: 0 12px; color: var(--sc-muted) !important; background: var(--sc-subtle) !important; font-size: 12px; font-weight: 650; }
.secondary-action:hover { color: var(--sc-text) !important; border-color: var(--sc-cyan) !important; background: var(--sc-hover) !important; transform: translateY(-1px); }
.danger-action { border-color: color-mix(in srgb, var(--sc-danger) 48%, var(--sc-border)) !important; color: var(--sc-danger) !important; background: transparent !important; }
.danger-action:hover { background: color-mix(in srgb, var(--sc-danger) 10%, transparent) !important; }
.danger-action:disabled, .secondary-action:disabled { opacity: .42; transform: none; }
.data-status { margin: 0; border-top: 1px solid var(--sc-border); padding: 12px 20px; color: var(--sc-accent); background: var(--sc-subtle); font-size: 12px; }

.about-card { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 16px; padding: 30px; }
.about-mark { display: grid; width: 60px; height: 60px; place-items: center; border: 1px solid color-mix(in srgb, var(--sc-accent) 38%, var(--sc-border)); border-radius: 16px; color: var(--sc-accent); background: var(--sc-accent-soft); }
.about-mark :deep(svg) { width: 48px; height: 48px; }
.about-card > div > p { margin: 0; color: var(--sc-cyan); font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 750; letter-spacing: .14em; }
.about-card h2 { margin: 5px 0 0; color: var(--sc-text); font-size: 21px; letter-spacing: -.025em; }
.about-card > div > span { display: block; margin-top: 5px; color: var(--sc-faint); font-size: 12px; }
.about-card > p { grid-column: 1 / -1; margin: 12px 0 0; color: var(--sc-muted); font-size: 13px; line-height: 1.65; }
.about-card a { grid-column: 1 / -1; width: max-content; color: var(--sc-cyan); font-size: 12px; font-weight: 650; text-decoration: none; }
.about-card a:hover { color: var(--sc-accent-bright); text-decoration: underline; text-underline-offset: 3px; }

:global(html[data-yufeng-density="compact"]) .settings-center .setting-row { min-height: 68px; padding-top: 13px; padding-bottom: 13px; }
:global(html[data-yufeng-density="compact"]) .settings-center .settings-navigation nav button { min-height: 39px; }
:global(html[data-yufeng-density="compact"]) .settings-center .settings-scroll { padding-top: 22px; }

@media (prefers-reduced-motion: reduce) {
  .settings-center :is(button, a, input, .choice-grid button, .switch, .switch i, .settings-navigation nav button::before, .primary-action, .secondary-action, .danger-action) {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}

@media (max-width: 1080px) {
  .settings-layout { grid-template-columns: 224px minmax(0, 1fr); }
  .content-heading, .settings-scroll { padding-left: 36px; padding-right: 36px; }
  .reasoning-effort-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
  .settings-center { grid-template-rows: 56px minmax(0, 1fr); }
  .settings-topbar { grid-template-columns: 1fr auto; padding: 0 12px; }
  .settings-title { display: none; }
  .save-state { font-size: 11px; }
  .settings-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .settings-navigation { display: block; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--sc-border); padding: 8px 10px; }
  .settings-navigation > p, .settings-navigation footer { display: none; }
  .settings-navigation nav { display: flex; width: max-content; gap: 5px; }
  .settings-navigation nav button { display: flex; min-height: 36px; gap: 7px; border-radius: 9px; padding: 0 10px; white-space: nowrap; }
  .settings-navigation nav button::before, .settings-navigation nav button > i { display: none; }
  .content-heading { padding: 25px 18px 21px; }
  .content-heading h1 { font-size: 25px; }
  .content-heading p { font-size: 13px; }
  .settings-scroll { padding: 16px 12px 56px; }
  .settings-group { border-radius: 13px; }
  .settings-group > header { min-height: 58px; padding: 13px 15px; }
  .settings-group > header small { max-width: 58%; font-size: 11px; }
  .setting-row { gap: 16px; min-height: 78px; padding: 15px; }
  .setting-row p, .setting-stack p { font-size: 12px; }
  .setting-stack { padding: 16px 15px; }
  .harness-status em { display: none; }
  .choice-grid.is-three, .approval-grid { grid-template-columns: minmax(0, 1fr); }
  .choice-grid.is-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .reasoning-effort-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .reasoning-effort-grid button { min-height: 74px; }
  .tool-row { grid-template-columns: 34px minmax(0, 1fr) auto; }
  .provider-summary { grid-template-columns: 42px minmax(0, 1fr); margin: 15px 15px 0; }
  .provider-status { grid-column: 2; width: max-content; }
  .provider-copy { margin-left: 15px; margin-right: 15px; }
  .primary-action { width: calc(100% - 30px); margin: 16px 15px 15px; }
  .data-row { min-height: 88px; }
  .about-card { grid-template-columns: 52px minmax(0, 1fr); padding: 22px; }
  .about-mark { width: 50px; height: 50px; }
  .about-mark :deep(svg) { width: 40px; height: 40px; }
}

@media (max-width: 460px) {
  .save-state { width: 8px; overflow: hidden; font-size: 0; }
  .save-state i { display: block; }
  .content-heading { padding-inline: 15px; }
  .settings-scroll { padding-inline: 9px; }
  .choice-grid.is-two { grid-template-columns: minmax(0, 1fr); }
  .setting-row { grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
  .about-card { grid-template-columns: 1fr; }
  .about-card > p, .about-card a { grid-column: 1; }
}
</style>
