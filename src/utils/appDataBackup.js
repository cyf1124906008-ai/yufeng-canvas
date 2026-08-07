import { DISTRIBUTION_CONFIG } from '../config/distribution.js'

const SNAPSHOT_KIND = 'yufeng-canvas.user-data'
const SNAPSHOT_VERSION = 1
const APP_NAME = DISTRIBUTION_CONFIG.branding.appName

const SYSTEM_ONLY_KEYS = new Set([
  'yufeng-home-welcome-seen'
])

const MEANINGFUL_KEY_PATTERNS = [
  /^ai-canvas-projects$/,
  /^image-expert-history$/,
  /^home-chat/,
  /^api-/,
  /^base-urls-/,
  /^custom-.*models/,
  /^selected-.*model/,
  /^yufeng-/,
  /^theme$/
]

const CRITICAL_RECOVERY_KEYS = [
  'ai-canvas-projects',
  'yufeng-image-expert-history',
  'image-expert-history',
  'yufeng-canvas-chat-history-v1',
  'home-chat-history',
  'api-keys-by-provider',
  'base-urls-by-provider',
  'custom-chat-models',
  'custom-image-models',
  'custom-video-models',
  'custom-chat-models-by-provider',
  'custom-image-models-by-provider',
  'custom-video-models-by-provider',
  'selected-chat-model',
  'selected-image-model',
  'selected-video-model',
  'api-provider',
  'theme'
]

const isEmptyJsonValue = (value) => {
  if (!value || typeof value !== 'string') return true

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.length === 0
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length === 0
    return parsed === null || parsed === ''
  } catch {
    return value.trim() === ''
  }
}

const isUsefulStorageValue = (value) => !isEmptyJsonValue(value)

const readStorageArea = (storage) => {
  const values = {}

  if (!storage) return values

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue
    values[key] = storage.getItem(key)
  }

  return values
}

const writeStorageArea = (storage, values = {}, { overwrite = false, repairMissing = false } = {}) => {
  if (!storage || !values || typeof values !== 'object') return 0

  let imported = 0

  Object.entries(values).forEach(([key, value]) => {
    if (typeof value !== 'string') return

    const currentValue = storage.getItem(key)
    const shouldRepairCriticalKey =
      repairMissing &&
      CRITICAL_RECOVERY_KEYS.includes(key) &&
      isUsefulStorageValue(value) &&
      !isUsefulStorageValue(currentValue)

    if (!overwrite && currentValue !== null && !shouldRepairCriticalKey) return

    storage.setItem(key, value)
    imported += 1
  })

  return imported
}

const hasMeaningfulValues = (values = {}) =>
  Object.entries(values).some(([key, value]) => {
    if (!value || SYSTEM_ONLY_KEYS.has(key)) return false
    return MEANINGFUL_KEY_PATTERNS.some((pattern) => pattern.test(key))
  })

export const hasMeaningfulLocalUserData = () => {
  try {
    return hasMeaningfulValues(readStorageArea(window.localStorage))
  } catch {
    return false
  }
}

export const createUserDataSnapshot = () => ({
  kind: SNAPSHOT_KIND,
  version: SNAPSHOT_VERSION,
  exportedAt: new Date().toISOString(),
  origin: typeof window !== 'undefined' ? window.location.origin : '',
  localStorage: readStorageArea(typeof window !== 'undefined' ? window.localStorage : null),
  sessionStorage: readStorageArea(typeof window !== 'undefined' ? window.sessionStorage : null)
})

export const isValidUserDataSnapshot = (snapshot) =>
  snapshot &&
  typeof snapshot === 'object' &&
  snapshot.kind === SNAPSHOT_KIND &&
  snapshot.localStorage &&
  typeof snapshot.localStorage === 'object'

export const importUserDataSnapshot = (snapshot, { overwrite = false, includeSession = true } = {}) => {
  if (!isValidUserDataSnapshot(snapshot)) {
    throw new Error(`这个文件不是有效的 ${APP_NAME} 数据包`)
  }

  const localStorageCount = writeStorageArea(window.localStorage, snapshot.localStorage, {
    overwrite,
    repairMissing: !overwrite
  })
  const sessionStorageCount = includeSession
    ? writeStorageArea(window.sessionStorage, snapshot.sessionStorage, { overwrite, repairMissing: !overwrite })
    : 0

  return {
    localStorageCount,
    sessionStorageCount
  }
}

export const backupUserDataNow = async () => {
  if (typeof window === 'undefined' || !window.desktopApp?.saveUserDataBackup) {
    return { ok: false, skipped: true }
  }

  const snapshot = createUserDataSnapshot()

  if (!hasMeaningfulValues(snapshot.localStorage)) {
    return { ok: false, skipped: true }
  }

  return window.desktopApp.saveUserDataBackup(snapshot)
}

export const restoreUserDataFromDiskIfNeeded = async () => {
  if (typeof window === 'undefined' || !window.desktopApp?.loadUserDataBackup) {
    return { restored: false, skipped: true }
  }

  const snapshot = await window.desktopApp.loadUserDataBackup()
  if (!isValidUserDataSnapshot(snapshot) || !hasMeaningfulValues(snapshot.localStorage)) {
    return { restored: false, skipped: true }
  }

  const result = importUserDataSnapshot(snapshot, { overwrite: false })
  return {
    restored: result.localStorageCount > 0 || result.sessionStorageCount > 0,
    ...result
  }
}

export const exportUserDataToFile = async () => {
  if (typeof window === 'undefined' || !window.desktopApp?.exportUserData) {
    throw new Error('当前环境不支持导出数据')
  }

  return window.desktopApp.exportUserData(createUserDataSnapshot())
}

export const importUserDataFromFile = async ({ overwrite = true } = {}) => {
  if (typeof window === 'undefined' || !window.desktopApp?.importUserData) {
    throw new Error('当前环境不支持导入数据')
  }

  const snapshot = await window.desktopApp.importUserData()
  if (!snapshot || snapshot.canceled) return { canceled: true }

  const result = importUserDataSnapshot(snapshot, { overwrite })
  await backupUserDataNow()
  return result
}

export const migrateLegacyLocalStorageKeys = () => {
  if (typeof window === 'undefined') return 0

  const migrations = [
    ['apiKey', 'api-keys-by-provider'],
    ['apiBaseUrl', 'base-urls-by-provider'],
    ['customChatModels', 'custom-chat-models'],
    ['customImageModels', 'custom-image-models'],
    ['customVideoModels', 'custom-video-models'],
    ['selectedChatModel', 'selected-chat-model'],
    ['selectedImageModel', 'selected-image-model'],
    ['selectedVideoModel', 'selected-video-model']
  ]

  let migrated = 0

  migrations.forEach(([legacyKey, currentKey]) => {
    const legacyValue = window.localStorage.getItem(legacyKey)
    if (!legacyValue || window.localStorage.getItem(currentKey)) return

    try {
      if (legacyKey === 'apiKey') {
        window.localStorage.setItem(currentKey, JSON.stringify({
          dataeyes: {
            default: legacyValue,
            chat: '',
            image: '',
            video: ''
          }
        }))
      } else if (legacyKey === 'apiBaseUrl') {
        window.localStorage.setItem(currentKey, JSON.stringify({
          dataeyes: {
            default: legacyValue,
            chat: '',
            image: '',
            video: ''
          }
        }))
      } else {
        window.localStorage.setItem(currentKey, legacyValue)
      }
      migrated += 1
    } catch {
      // Ignore invalid legacy entries; the current settings UI can still repair them.
    }
  })

  return migrated
}

export const startUserDataAutoBackup = ({ interval = 12_000 } = {}) => {
  if (typeof window === 'undefined') return () => {}

  let timer = null

  const scheduleBackup = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void backupUserDataNow()
    }, 700)
  }

  const intervalId = window.setInterval(() => {
    void backupUserDataNow()
  }, interval)

  window.addEventListener('storage', scheduleBackup)
  window.addEventListener('beforeunload', backupUserDataNow)
  window.addEventListener('pagehide', backupUserDataNow)
  scheduleBackup()

  return () => {
    window.clearTimeout(timer)
    window.clearInterval(intervalId)
    window.removeEventListener('storage', scheduleBackup)
    window.removeEventListener('beforeunload', backupUserDataNow)
    window.removeEventListener('pagehide', backupUserDataNow)
  }
}
