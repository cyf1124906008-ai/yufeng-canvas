const fs = require('fs')
const path = require('path')
const paths = require('./paths.cjs')
const manager = require('./manager.cjs')

function install() {
  const dirs = [
    paths.getComfyRoot(),
    paths.getComfyEnginePath(),
    paths.getComfyModelsPath(),
    paths.getComfyOutputsPath()
  ]

  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true })
  }

  const config = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:8188',
    port: 8188,
    version: '',
    installedAt: new Date().toISOString(),
    logs: [
      { time: Date.now(), level: 'info', message: '已创建引擎目录，后续版本将支持自动下载 ComfyUI' }
    ]
  }

  paths.writeConfig(config)
  manager.appendLog('引擎目录创建完成', 'info')

  return manager.getStatus()
}

module.exports = { install }
