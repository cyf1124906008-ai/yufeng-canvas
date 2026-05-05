const paths = require('./paths.cjs')
const manager = require('./manager.cjs')
const installer = require('./installer.cjs')
const { spawn } = require('child_process')

const ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1']
let comfyProcess = null
function isAllowedHost(hostname) { return ALLOWED_HOSTS.includes(String(hostname || '').toLowerCase()) }
function normalizeBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return 'http://127.0.0.1:8188'
  let url
  try { url = new URL(raw.trim()) } catch { return 'http://127.0.0.1:8188' }
  if (url.protocol !== 'http:' || !isAllowedHost(url.hostname)) return null
  return 'http://' + url.hostname + ':' + (url.port || '8188')
}
function getPythonCommand() { return process.platform === 'win32' ? { cmd: 'py', prefix: ['-3'] } : { cmd: 'python3', prefix: [] } }
function start() {
  if (comfyProcess && !comfyProcess.killed) { manager.setConfig({ running: true, error: '' }); return manager.getStatus() }
  if (!paths.mainPyExists()) {
    try { installer.install() } catch (error) { manager.appendLog('安装内置 ComfyUI 失败：' + error.message, 'error'); manager.setConfig({ error: error.message, running: false }); return manager.getStatus() }
  }
  const config = paths.readConfig() || {}
  const port = Number(config.port || 8188)
  const py = getPythonCommand()
  const args = [...py.prefix, 'main.py', '--listen', '127.0.0.1', '--port', String(port), '--input-directory', paths.getComfyInputPath(), '--output-directory', paths.getComfyOutputsPath(), '--extra-model-paths-config', paths.getExtraModelPathsConfigPath()]
  manager.appendLog('正在启动内置 ComfyUI：' + py.cmd + ' ' + args.join(' '), 'info')
  comfyProcess = spawn(py.cmd, args, { cwd: paths.getComfyEnginePath(), env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true })
  comfyProcess.stdout.on('data', chunk => manager.appendLog(String(chunk).trim().slice(0, 1000), 'info'))
  comfyProcess.stderr.on('data', chunk => manager.appendLog(String(chunk).trim().slice(0, 1000), 'warn'))
  comfyProcess.on('error', error => { manager.appendLog('ComfyUI 启动失败：' + error.message, 'error'); manager.setConfig({ running: false, error: 'ComfyUI 启动失败：' + error.message + '。请确认已安装 Python 3，并在模型目录放入模型权重。' }) })
  comfyProcess.on('exit', code => { manager.appendLog('ComfyUI 已退出，退出码：' + code, code === 0 ? 'info' : 'warn'); comfyProcess = null; manager.setConfig({ running: false }) })
  manager.setConfig({ running: true, baseUrl: 'http://127.0.0.1:' + port, error: '' })
  return manager.getStatus()
}
function stop() {
  if (comfyProcess && !comfyProcess.killed) { manager.appendLog('正在停止内置 ComfyUI', 'info'); comfyProcess.kill() }
  comfyProcess = null
  manager.setConfig({ running: false, error: '' })
  return manager.getStatus()
}
async function testConnection(rawUrl) {
  const baseUrl = normalizeBaseUrl(rawUrl)
  if (!baseUrl) { const error = '测试连接失败：仅允许 http://127.0.0.1、http://localhost 或 http://[::1]'; manager.appendLog(error, 'error'); manager.setConfig({ error, lastCheckedAt: Date.now() }); return { ok: false, error } }
  const url = baseUrl + '/object_info'
  manager.appendLog('正在测试连接 ' + url, 'info')
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const data = await resp.json()
    const count = Object.keys(data).length
    manager.appendLog('连接成功，检测到 ' + count + ' 个 Comfy 节点类型', 'info')
    manager.setConfig({ baseUrl, objectInfoCount: count, lastConnectedAt: Date.now(), error: '' })
    return { ok: true, objectInfoCount: count }
  } catch (error) {
    const msg = error.name === 'TimeoutError' ? '连接超时，请确认内置 ComfyUI 正在运行' : '连接失败：' + error.message
    manager.appendLog(msg, 'error')
    manager.setConfig({ error: msg, lastCheckedAt: Date.now() })
    return { ok: false, error: msg }
  }
}
module.exports = { start, stop, testConnection }
