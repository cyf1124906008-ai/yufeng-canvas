export const DATAEYES_STARTUP_STORAGE_KEY = 'dataeyes-code.startup-seen.v1'
export const DATAEYES_STARTUP_DEFAULT_HOLD_MS = 1260
export const DATAEYES_STARTUP_MAX_HOLD_MS = 1360
export const DATAEYES_STARTUP_EXIT_MS = 160
export const DATAEYES_STARTUP_REDUCED_HOLD_MS = 80

function resolveSessionStorage(storage) {
  if (storage !== undefined) return storage

  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

export function shouldShowDataEyesStartup(storage, key = DATAEYES_STARTUP_STORAGE_KEY) {
  const target = resolveSessionStorage(storage)
  if (!target) return true

  try {
    return target.getItem(key) !== '1'
  } catch {
    return true
  }
}

export function rememberDataEyesStartup(storage, key = DATAEYES_STARTUP_STORAGE_KEY) {
  const target = resolveSessionStorage(storage)
  if (!target) return false

  try {
    target.setItem(key, '1')
    return true
  } catch {
    return false
  }
}

export function prefersReducedStartupMotion(matchMedia) {
  const resolveMedia = typeof matchMedia === 'function'
    ? matchMedia
    : typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia.bind(globalThis)
      : null

  if (!resolveMedia) return false

  try {
    return resolveMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

export function resolveDataEyesStartupHold(duration, reducedMotion = false) {
  if (reducedMotion) return DATAEYES_STARTUP_REDUCED_HOLD_MS

  const requested = Number(duration)
  if (!Number.isFinite(requested)) return DATAEYES_STARTUP_DEFAULT_HOLD_MS

  return Math.min(DATAEYES_STARTUP_MAX_HOLD_MS, Math.max(0, Math.round(requested)))
}
