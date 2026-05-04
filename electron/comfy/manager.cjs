const fs = require('fs')
const paths = require('./paths.cjs')

const defaultState = {
  enabled: false,
  installed: false,
  installing: false,
  running: false,
  starting: false,
  stopping: false,
  baseUrl: 'http://127.0.0.1:8188',
  port: 8188,
  installPath: '',
  enginePath: '',
  modelsPath: '',
  outputsPath: '',
  version: '',
  objectInfoCount: 0,
  lastCheckedAt: 0,
  error: '',
  logs: []
}

const MAX_LOGS = 200

function getStatus() {
  const state = { ...defaultState }
  const config = paths.readConfig()

  if (config) {
    state.installed = true
    state.enabled = config.enabled ?? false
    state.baseUrl = config.baseUrl || defaultState.baseUrl
    state.port = config.port || defaultState.port
    state.installPath = paths.getComfyRoot()
    state.enginePath = paths.getComfyEnginePath()
    state.modelsPath = paths.getComfyModelsPath()
    state.outputsPath = paths.getComfyOutputsPath()
    state.version = config.version || ''
  }

  if (fs.existsSync(paths.getComfyRoot())) {
    state.installPath = paths.getComfyRoot()
    state.enginePath = paths.getComfyEnginePath()
    state.modelsPath = paths.getComfyModelsPath()
    state.outputsPath = paths.getComfyOutputsPath()
  }

  state.lastCheckedAt = Date.now()
  return state
}

function setConfig(config) {
  const existing = paths.readConfig() || {}
  const merged = { ...existing, ...config }
  paths.writeConfig(merged)
  return getStatus()
}

function appendLog(message, level = 'info') {
  const config = paths.readConfig()
  if (!config) return
  const logs = config.logs || []
  logs.push({ time: Date.now(), level, message })
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  config.logs = logs
  paths.writeConfig(config)
}

function getLogs() {
  const config = paths.readConfig()
  return config?.logs || []
}

module.exports = {
  getStatus,
  setConfig,
  appendLog,
  getLogs
}
