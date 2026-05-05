const fs = require('fs')
const path = require('path')
const paths = require('./paths.cjs')
const manager = require('./manager.cjs')

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }
function shouldSkipCopy(src) {
  const normalized = src.replace(/\\/g, '/')
  return //(.git|.github|tests|tests-unit|output|input|models)/.test(normalized)
}
function copyComfySource(sourceDir, targetDir) {
  if (!sourceDir || !fs.existsSync(path.join(sourceDir, 'main.py'))) throw new Error('没有找到内置 ComfyUI 源码，请确认 .reference-repos/ComfyUI 或应用 resources/engines/ComfyUI 存在')
  ensureDir(targetDir)
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true, filter: (src) => !shouldSkipCopy(src) })
}
function writeExtraModelPathsConfig() {
  const base = paths.getComfyRoot().replace(/\\/g, '/')
  const lines = [
    'yufeng:',
    '  base_path: ' + base,
    '  checkpoints: models/checkpoints',
    '  clip: models/clip',
    '  clip_vision: models/clip_vision',
    '  configs: models/configs',
    '  controlnet: models/controlnet',
    '  embeddings: models/embeddings',
    '  loras: models/loras',
    '  upscale_models: models/upscale_models',
    '  vae: models/vae',
    '  unet: models/unet',
    '  diffusion_models: models/diffusion_models',
    ''
  ]
  fs.writeFileSync(paths.getExtraModelPathsConfigPath(), lines.join('\n'), 'utf-8')
}
function install() {
  const dirs = [paths.getComfyRoot(), paths.getComfyEnginePath(), paths.getComfyModelsPath(), paths.getComfyInputPath(), paths.getComfyOutputsPath(), 'checkpoints', 'loras', 'controlnet', 'vae', 'clip', 'clip_vision', 'upscale_models', 'diffusion_models'].map(item => item.includes(':') || item.startsWith('\\') ? item : (item === paths.getComfyRoot() || item === paths.getComfyEnginePath() || item === paths.getComfyModelsPath() || item === paths.getComfyInputPath() || item === paths.getComfyOutputsPath() ? item : path.join(paths.getComfyModelsPath(), item)))
  dirs.forEach(ensureDir)
  const source = paths.getBundledComfySourcePath()
  copyComfySource(source, paths.getComfyEnginePath())
  writeExtraModelPathsConfig()
  paths.writeConfig({ enabled: true, baseUrl: 'http://127.0.0.1:8188', port: 8188, installedAt: new Date().toISOString(), bundledSource: source, enginePath: paths.getComfyEnginePath(), modelsPath: paths.getComfyModelsPath(), inputPath: paths.getComfyInputPath(), outputsPath: paths.getComfyOutputsPath(), logs: [] })
  manager.appendLog('已把内置 ComfyUI 源码安装到 YUFENG 本地引擎目录', 'info')
  manager.appendLog('模型权重不打包，请放入模型目录；YUFENG 会直接启动此内置 ComfyUI 后端', 'info')
  return manager.getStatus()
}
module.exports = { install }
