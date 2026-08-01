'use strict'

const WORKSPACE_BOUND_FULL_ACCESS_ACTIONS = Object.freeze(new Set([
  'workspace.write',
  'workspace.patch',
  'workspace.revert_patch',
  'terminal.run'
]))

const emptyState = () => Object.freeze({
  granted: false,
  scope: 'app_renderer_lifecycle',
  workspaceBound: false
})

const normalizeWebContents = (webContents) => {
  if (!webContents || typeof webContents !== 'object' ||
      !Number.isSafeInteger(Number(webContents.id)) || Number(webContents.id) <= 0) {
    const error = new TypeError('full access grant requires a live webContents')
    error.code = 'INVALID_FULL_ACCESS_RENDERER'
    throw error
  }
  if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) {
    const error = new Error('full access renderer is no longer alive')
    error.code = 'FULL_ACCESS_RENDERER_DESTROYED'
    throw error
  }
  return webContents
}

const normalizeWorkspaceIdentity = (identity) => {
  if (identity == null) return null
  const workspaceRoot = String(identity.workspaceRoot || '').trim()
  const workspaceGeneration = Number(identity.workspaceGeneration)
  if (!workspaceRoot || !Number.isSafeInteger(workspaceGeneration) || workspaceGeneration < 0) {
    const error = new TypeError('full access grant requires a valid workspace identity')
    error.code = 'INVALID_FULL_ACCESS_WORKSPACE'
    throw error
  }
  return Object.freeze({ workspaceRoot, workspaceGeneration })
}

const sameWorkspaceIdentity = (left, right) => (
  left === null && right === null
) || Boolean(
  left && right &&
  left.workspaceRoot === right.workspaceRoot &&
  left.workspaceGeneration === right.workspaceGeneration
)

const publicState = (grant) => grant
  ? Object.freeze({
      granted: true,
      scope: 'app_renderer_lifecycle',
      workspaceBound: Boolean(grant.workspaceIdentity),
      grantedAt: grant.grantedAt
    })
  : emptyState()

/**
 * Main-process-only capability store. The exact webContents object is the key;
 * no bearer token is ever returned to the renderer or persisted to disk.
 */
class FullAccessGrantManager {
  constructor({ now = Date.now } = {}) {
    this.now = now
    this.grants = new Map()
  }

  grant(webContents, workspaceIdentity = null) {
    const renderer = normalizeWebContents(webContents)
    const grant = Object.freeze({
      workspaceIdentity: normalizeWorkspaceIdentity(workspaceIdentity),
      grantedAt: Number(this.now())
    })
    this.grants.set(renderer, grant)
    return publicState(grant)
  }

  get(webContents, { workspaceIdentity, validateWorkspace = false } = {}) {
    const renderer = normalizeWebContents(webContents)
    const grant = this.grants.get(renderer)
    if (!grant) return emptyState()
    if (validateWorkspace) {
      const current = normalizeWorkspaceIdentity(workspaceIdentity)
      if (!sameWorkspaceIdentity(grant.workspaceIdentity, current)) {
        this.grants.delete(renderer)
        return emptyState()
      }
    }
    return publicState(grant)
  }

  canBypass(webContents, {
    action,
    fullAccess = false,
    workspaceIdentity = null
  } = {}) {
    // Renderer input is only intent. It becomes authority solely when the
    // matching Main-process grant for this exact webContents is still valid.
    if (fullAccess !== true) return false
    const state = this.get(webContents, {
      workspaceIdentity,
      validateWorkspace: true
    })
    if (!state.granted) return false
    if (WORKSPACE_BOUND_FULL_ACCESS_ACTIONS.has(String(action || '')) && !state.workspaceBound) {
      return false
    }
    return true
  }

  revoke(webContents) {
    const renderer = normalizeWebContents(webContents)
    this.grants.delete(renderer)
    return emptyState()
  }

  clear() {
    this.grants.clear()
  }
}

module.exports = {
  FullAccessGrantManager,
  WORKSPACE_BOUND_FULL_ACCESS_ACTIONS,
  normalizeWorkspaceIdentity,
  sameWorkspaceIdentity
}
