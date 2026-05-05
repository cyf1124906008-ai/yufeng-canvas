const path = require('path')
const fs = require('fs')
const { app } = require('electron')

function getEnginesRoot() { return path.join(app.getPath('userData'), 'engines') }
function getComfyRoot() { return path.join(getEnginesRoot(), 'comfyui') }
function getComfyEnginePath() { return path.join(getComfyRoot(), 'ComfyUI') }
function getComfyModelsPath() { return path.join(getComfyRoot(), 'models') }
function getComfyInputPath() { return path.join(getComfyRoot(), 'input') }
function getComfyOutputsPath() { return path.join(getComfyRoot(), 'outputs') }
function getComfyVenvPath() { return path.join(getComfyRoot(), '.venv') }
function getExtraModelPathsConfigPath() { return path.join(getComfyRoot(), 'extra_model_paths.yaml') }
function getConfigPath() { return path.join(getComfyRoot(), 'engine-config.json') }
function getDevBundledComfySourcePath() { return path.resolve(__dirname, '..', '..', '.reference-repos', 'ComfyUI') }
function getPackagedBundledComfySourcePath() { return path.join(process.resourcesPath || '', 'engines', 'ComfyUI') }
function getBundledComfySourcePath() {
  return [getPackagedBundledComfySourcePath(), getDevBundledComfySourcePath()].find(candidate => candidate && fs.existsSync(path.join(candidate, 'main.py'))) || ''
}
function getBundledDramaSourcePath() {
  return [path.join(process.resourcesPath || '', 'engines', 'huobao-drama'), path.resolve(__dirname, '..', '..', '.reference-repos', 'huobao-drama')].find(candidate => candidate && fs.existsSync(path.join(candidate, 'backend'))) || ''
}
function readConfig() {
  const p = getConfigPath()
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null }
}
function writeConfig(config) {
  const p = getConfigPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8')
}
function mainPyExists() { return fs.existsSync(path.join(getComfyEnginePath(), 'main.py')) }
module.exports = { getEnginesRoot, getComfyRoot, getComfyEnginePath, getComfyModelsPath, getComfyInputPath, getComfyOutputsPath, getComfyVenvPath, getExtraModelPathsConfigPath, getConfigPath, getBundledComfySourcePath, getBundledDramaSourcePath, readConfig, writeConfig, mainPyExists }
