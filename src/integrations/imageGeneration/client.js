/**
 * Frontend IPC bridge for main-process image generation.
 * Falls back to direct fetch when not running in Electron.
 *
 * Frontend-side timeout: after UX_TIMEOUT_MS, the returned Promise rejects
 * with a timeout error, but the main process keeps running the request.
 * The result is stored under the taskId and can be recovered later via
 * ipcGetPendingResult().
 */

const getImageGen = () => window.desktopApp?.imageGen

const UX_TIMEOUT_MS = 240_000

/**
 * Execute an image generation request via main process (Electron).
 * Returns { ok, data, error, status }.
 *
 * The caller receives a timeout error after UX_TIMEOUT_MS, but the main
 * process continues waiting for the provider response.  Recovery is
 * possible via ipcGetPendingResult(taskId).
 */
export async function ipcImageGenerate(config) {
  const ipc = getImageGen()
  if (!ipc) return null

  const taskId = config.taskId
  if (!taskId) {
    // No taskId — just fire and wait (no recovery possible)
    return ipc.generate(config)
  }

  // Race: main process vs. frontend UX timeout
  const backend = ipc.generate(config)

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(Object.assign(new Error('前端等待超时，但供应商请求仍在后台继续，刷新页面后可恢复结果'), { _frontendTimeout: true }))
    }, UX_TIMEOUT_MS)
  })

  try {
    return await Promise.race([backend, timeout])
  } catch (err) {
    // Frontend timeout — the backend request is still running in main process
    if (err._frontendTimeout) {
      throw err
    }
    // Backend error (non-timeout)
    throw err
  }
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
