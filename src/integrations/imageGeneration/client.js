/**
 * Frontend IPC bridge for main-process image generation.
 * Falls back to direct fetch when not running in Electron.
 */

const getImageGen = () => window.desktopApp?.imageGen

/**
 * Execute an image generation request via main process (Electron).
 * Returns { ok, data, error, status }.
 */
export async function ipcImageGenerate(config) {
  const ipc = getImageGen()
  if (!ipc) return null
  return ipc.generate(config)
}

/**
 * Retrieve a pending result from main process (for recovery after refresh).
 */
export async function ipcGetPendingResult(taskId) {
  const ipc = getImageGen()
  if (!ipc) return null
  return ipc.getPendingResult(taskId)
}

/**
 * Check if main-process image generation is available.
 */
export function isMainProcessImageGenAvailable() {
  return !!getImageGen()
}
