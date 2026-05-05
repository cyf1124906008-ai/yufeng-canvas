const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const paths = require('./paths.cjs')
const manager = require('./manager.cjs')

let dependencyProcess = null

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function shouldSkipCopy(src) {
  const normalized = src.replace(/\\/g, '/')
  return /\/(\.git|\.github|tests|tests-unit|output|input|models)\b/.test(normalized)
}

function copyComfySource(sourceDir, targetDir) {
  if (!sourceDir || !fs.existsSync(path.join(sourceDir, 'main.py'))) {
    throw new Error('没有找到内置 ComfyUI 源码，请确认应用资源里包含 ComfyUI。')
  }
  ensureDir(targetDir)
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (src) => !shouldSkipCopy(src)
  })
}

function writeExtraModelPathsConfig() {
  const base = paths.getComfyRoot().replace(/\\/g, '/')
  const lines = [
    'yufeng:',
    `  base_path: ${base}`,
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

function ensureRuntimeDirs() {
  const dirs = [
    paths.getComfyRoot(),
    paths.getComfyEnginePath(),
    paths.getComfyModelsPath(),
    paths.getComfyInputPath(),
    paths.getComfyOutputsPath(),
    path.join(paths.getComfyModelsPath(), 'checkpoints'),
    path.join(paths.getComfyModelsPath(), 'loras'),
    path.join(paths.getComfyModelsPath(), 'controlnet'),
    path.join(paths.getComfyModelsPath(), 'vae'),
    path.join(paths.getComfyModelsPath(), 'clip'),
    path.join(paths.getComfyModelsPath(), 'clip_vision'),
    path.join(paths.getComfyModelsPath(), 'upscale_models'),
    path.join(paths.getComfyModelsPath(), 'diffusion_models')
  ]
  dirs.forEach(ensureDir)
}

function install({ silent = false } = {}) {
  ensureRuntimeDirs()
  const source = paths.getBundledComfySourcePath()
  copyComfySource(source, paths.getComfyEnginePath())
  writeExtraModelPathsConfig()

  const existing = paths.readConfig() || {}
  paths.writeConfig({
    ...existing,
    enabled: true,
    baseUrl: existing.baseUrl || 'http://127.0.0.1:8188',
    port: existing.port || 8188,
    installedAt: existing.installedAt || new Date().toISOString(),
    bundledSource: source,
    enginePath: paths.getComfyEnginePath(),
    modelsPath: paths.getComfyModelsPath(),
    inputPath: paths.getComfyInputPath(),
    outputsPath: paths.getComfyOutputsPath(),
    logs: existing.logs || []
  })

  if (!silent) {
    manager.appendLog('已把内置 ComfyUI 源码安装到 YUFENG 本地引擎目录', 'info')
    manager.appendLog('模型权重不打包，请放入模型目录；YUFENG 会直接启动此内置 ComfyUI 后端', 'info')
  }
  return manager.getStatus()
}

function autoInstallIfAvailable() {
  try {
    if (paths.mainPyExists()) return manager.getStatus()
    if (!paths.getBundledComfySourcePath()) return manager.getStatus()
    return install({ silent: true })
  } catch (error) {
    manager.setConfig({ error: `内置 ComfyUI 自动装载失败：${error.message}` })
    return manager.getStatus()
  }
}

function scanModels() {
  ensureRuntimeDirs()
  const modelDirs = {
    checkpoints: path.join(paths.getComfyModelsPath(), 'checkpoints'),
    loras: path.join(paths.getComfyModelsPath(), 'loras'),
    controlnet: path.join(paths.getComfyModelsPath(), 'controlnet'),
    vae: path.join(paths.getComfyModelsPath(), 'vae'),
    diffusionModels: path.join(paths.getComfyModelsPath(), 'diffusion_models')
  }
  const exts = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf'])
  const counts = {}
  const files = {}
  for (const [key, dir] of Object.entries(modelDirs)) {
    const list = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(name => exts.has(path.extname(name).toLowerCase()))
      : []
    counts[key] = list.length
    files[key] = list.slice(0, 50)
  }
  const missing = []
  if (counts.checkpoints === 0 && counts.diffusionModels === 0) {
    missing.push('缺少基础模型：请把 SD/Flux checkpoint 或 diffusion model 放入 models/checkpoints 或 models/diffusion_models')
  }
  return { ok: true, modelsPath: paths.getComfyModelsPath(), counts, files, missing }
}

function getPythonCommand() {
  return process.platform === 'win32'
    ? { cmd: 'py', prefix: ['-3'] }
    : { cmd: 'python3', prefix: [] }
}

function installDependencies() {
  if (dependencyProcess && !dependencyProcess.killed) {
    return { ok: false, error: '依赖安装正在进行中' }
  }
  if (!paths.mainPyExists()) install()
  const requirements = path.join(paths.getComfyEnginePath(), 'requirements.txt')
  if (!fs.existsSync(requirements)) return { ok: false, error: '未找到 ComfyUI requirements.txt' }

  const py = getPythonCommand()
  const args = [...py.prefix, '-m', 'pip', 'install', '-r', requirements]
  manager.appendLog(`正在安装 ComfyUI Python 依赖：${py.cmd} ${args.join(' ')}`, 'info')
  dependencyProcess = spawn(py.cmd, args, {
    cwd: paths.getComfyEnginePath(),
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    windowsHide: true
  })
  dependencyProcess.stdout.on('data', chunk => manager.appendLog(String(chunk).trim().slice(0, 1000), 'info'))
  dependencyProcess.stderr.on('data', chunk => manager.appendLog(String(chunk).trim().slice(0, 1000), 'warn'))
  dependencyProcess.on('error', error => {
    manager.appendLog(`依赖安装失败：${error.message}`, 'error')
    manager.setConfig({ dependencyInstalling: false, error: `依赖安装失败：${error.message}` })
  })
  dependencyProcess.on('exit', code => {
    manager.appendLog(`依赖安装结束，退出码：${code}`, code === 0 ? 'info' : 'warn')
    dependencyProcess = null
    manager.setConfig({
      dependencyInstalling: false,
      dependencyInstalledAt: code === 0 ? new Date().toISOString() : undefined
    })
  })
  manager.setConfig({ dependencyInstalling: true, error: '' })
  return { ok: true }
}

module.exports = {
  install,
  autoInstallIfAvailable,
  scanModels,
  installDependencies
}
