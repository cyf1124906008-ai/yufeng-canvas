const path = require('path')
const fs = require('fs')
const { app } = require('electron')

function getEnginesRoot() {
  return path.join(app.getPath('userData'), 'engines')
}

function getComfyRoot() {
  return path.join(getEnginesRoot(), 'comfyui')
}

function getComfyEnginePath() {
  return path.join(getComfyRoot(), 'ComfyUI')
}

function getComfyModelsPath() {
  return path.join(getComfyRoot(), 'models')
}

function getComfyOutputsPath() {
  return path.join(getComfyRoot(), 'outputs')
}

function getConfigPath() {
  return path.join(getComfyRoot(), 'engine-config.json')
}

function readConfig() {
  const p = getConfigPath()
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function writeConfig(config) {
  const p = getConfigPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8')
}

function mainPyExists() {
  const p = path.join(getComfyEnginePath(), 'main.py')
  return fs.existsSync(p)
}

module.exports = {
  getEnginesRoot,
  getComfyRoot,
  getComfyEnginePath,
  getComfyModelsPath,
  getComfyOutputsPath,
  getConfigPath,
  readConfig,
  writeConfig,
  mainPyExists
}
