import { computed, reactive, toRefs, watch } from 'vue'

export const AGENT_SETTINGS_STORAGE_KEY = 'yufeng-agent-settings-v1'

export const DEFAULT_AGENT_SETTINGS = Object.freeze({
  theme: 'system',
  density: 'comfortable',
  defaultInspector: true,
  backgroundMode: true,
  launchAtLogin: false,
  preventSleepDuringRuns: true,
  approvalMode: 'ask',
  // The native planner remains the safe default. OpenCode is an explicit,
  // user-selected local sidecar and never becomes an authority by restoring
  // a persisted permission or API credential.
  agentEngine: 'native',
  reasoningEffort: 'auto',
  maxActionsPerTurn: 24,
  tools: Object.freeze({
    workspaceRead: true,
    workspaceWrite: true,
    terminal: true,
    computer: true,
    creative: true
  })
})

const THEMES = new Set(['system', 'light', 'dark'])
const DENSITIES = new Set(['comfortable', 'compact'])
const APPROVAL_MODES = new Set(['read_only', 'ask', 'auto', 'full_access'])
const AGENT_ENGINES = new Set(['native', 'opencode'])
const REASONING_EFFORTS = new Set(['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const TOOL_GROUPS = new Set(Object.keys(DEFAULT_AGENT_SETTINGS.tools))

const storageOrNull = () => {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

const rootOrNull = () => {
  try {
    return globalThis.document?.documentElement || null
  } catch {
    return null
  }
}

const systemThemeOrNull = () => {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)') || null
  } catch {
    return null
  }
}

const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export function normalizeAgentSettings(value = {}, { restoring = false, legacyTheme = '' } = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const storedTheme = THEMES.has(source.theme)
    ? source.theme
    : (THEMES.has(legacyTheme) && legacyTheme !== 'system' ? legacyTheme : DEFAULT_AGENT_SETTINGS.theme)
  const storedApproval = APPROVAL_MODES.has(source.approvalMode) ? source.approvalMode : DEFAULT_AGENT_SETTINGS.approvalMode
  const storedEngine = AGENT_ENGINES.has(source.agentEngine) ? source.agentEngine : DEFAULT_AGENT_SETTINGS.agentEngine
  const tools = source.tools && typeof source.tools === 'object' ? source.tools : {}

  return {
    theme: storedTheme,
    density: DENSITIES.has(source.density) ? source.density : DEFAULT_AGENT_SETTINGS.density,
    defaultInspector: typeof source.defaultInspector === 'boolean' ? source.defaultInspector : DEFAULT_AGENT_SETTINGS.defaultInspector,
    backgroundMode: typeof source.backgroundMode === 'boolean' ? source.backgroundMode : DEFAULT_AGENT_SETTINGS.backgroundMode,
    launchAtLogin: typeof source.launchAtLogin === 'boolean' ? source.launchAtLogin : DEFAULT_AGENT_SETTINGS.launchAtLogin,
    preventSleepDuringRuns: typeof source.preventSleepDuringRuns === 'boolean'
      ? source.preventSleepDuringRuns
      : DEFAULT_AGENT_SETTINGS.preventSleepDuringRuns,
    // Automatic and full access execution are intentionally session-only. A
    // restarted application always falls back to explicit approval.
    approvalMode: restoring && ['auto', 'full_access'].includes(storedApproval) ? 'ask' : storedApproval,
    agentEngine: storedEngine,
    reasoningEffort: REASONING_EFFORTS.has(source.reasoningEffort)
      ? source.reasoningEffort
      : DEFAULT_AGENT_SETTINGS.reasoningEffort,
    maxActionsPerTurn: boundedInteger(source.maxActionsPerTurn, DEFAULT_AGENT_SETTINGS.maxActionsPerTurn, 4, 64),
    tools: Object.fromEntries([...TOOL_GROUPS].map(group => {
      const legacyWorkspace = ['workspaceRead', 'workspaceWrite'].includes(group) && typeof tools.workspace === 'boolean'
        ? tools.workspace
        : undefined
      return [
        group,
        typeof tools[group] === 'boolean'
          ? tools[group]
          : (legacyWorkspace ?? DEFAULT_AGENT_SETTINGS.tools[group])
      ]
    }))
  }
}

function readSettings(storage) {
  if (!storage) return normalizeAgentSettings({}, { restoring: true })
  try {
    const raw = storage.getItem(AGENT_SETTINGS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return normalizeAgentSettings(parsed, {
      restoring: true,
      legacyTheme: storage.getItem('theme') || ''
    })
  } catch {
    return normalizeAgentSettings({}, { restoring: true })
  }
}

export function createAgentSettingsStore({
  storage = storageOrNull(),
  root = rootOrNull(),
  systemTheme = systemThemeOrNull()
} = {}) {
  const state = reactive(readSettings(storage))
  const systemDark = reactive({ value: Boolean(systemTheme?.matches) })
  const isDark = computed(() => state.theme === 'dark' || (state.theme === 'system' && systemDark.value))

  const persist = () => {
    if (!storage) return false
    try {
      const snapshot = normalizeAgentSettings(state)
      if (['auto', 'full_access'].includes(snapshot.approvalMode)) snapshot.approvalMode = 'ask'
      storage.setItem(AGENT_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot))
      return true
    } catch {
      return false
    }
  }

  const applyAppearance = () => {
    if (!root) return
    root.classList?.toggle?.('dark', isDark.value)
    if (root.dataset) {
      root.dataset.yufengTheme = isDark.value ? 'dark' : 'light'
      root.dataset.yufengThemePreference = state.theme
      root.dataset.yufengDensity = state.density
    }
    if (root.style) root.style.colorScheme = isDark.value ? 'dark' : 'light'
  }

  const replaceState = value => {
    const normalized = normalizeAgentSettings(value, {
      restoring: true,
      legacyTheme: storage?.getItem?.('theme') || ''
    })
    Object.assign(state, normalized)
    state.tools = { ...normalized.tools }
    return state
  }

  const reload = () => replaceState(readSettings(storage))
  const reset = () => {
    const defaults = normalizeAgentSettings({}, { restoring: true })
    Object.assign(state, defaults)
    state.tools = { ...defaults.tools }
    return state
  }

  const setTheme = value => {
    if (!THEMES.has(value)) return false
    state.theme = value
    return true
  }
  const setDensity = value => {
    if (!DENSITIES.has(value)) return false
    state.density = value
    return true
  }
  const setApprovalMode = value => {
    if (!APPROVAL_MODES.has(value)) return false
    state.approvalMode = value
    return true
  }
  const setAgentEngine = value => {
    if (!AGENT_ENGINES.has(value)) return false
    state.agentEngine = value
    return true
  }
  const setReasoningEffort = value => {
    if (!REASONING_EFFORTS.has(value)) return false
    state.reasoningEffort = value
    return true
  }
  const setMaxActionsPerTurn = value => {
    state.maxActionsPerTurn = boundedInteger(value, state.maxActionsPerTurn, 4, 64)
    return state.maxActionsPerTurn
  }
  const setToolEnabled = (group, enabled) => {
    if (!TOOL_GROUPS.has(group)) return false
    state.tools[group] = Boolean(enabled)
    return true
  }

  const onSystemThemeChange = event => {
    systemDark.value = Boolean(event?.matches)
  }
  systemTheme?.addEventListener?.('change', onSystemThemeChange)

  const stopPersistence = watch(state, persist, { deep: true, flush: 'sync' })
  const stopAppearance = watch([() => state.theme, () => state.density, isDark], applyAppearance, {
    immediate: true,
    flush: 'sync'
  })

  const dispose = () => {
    stopPersistence()
    stopAppearance()
    systemTheme?.removeEventListener?.('change', onSystemThemeChange)
  }

  return {
    state,
    ...toRefs(state),
    isDark,
    setTheme,
    setDensity,
    setApprovalMode,
    setAgentEngine,
    setReasoningEffort,
    setMaxActionsPerTurn,
    setToolEnabled,
    reload,
    reset,
    persist,
    dispose
  }
}

export const agentSettings = createAgentSettingsStore()
export const useAgentSettings = () => agentSettings
