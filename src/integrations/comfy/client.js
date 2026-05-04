const desktop = () => window.desktopApp?.comfy

export async function comfyGetStatus() {
  return desktop()?.getStatus() ?? null
}

export async function comfySetConfig(config) {
  return desktop()?.setConfig(config) ?? null
}

export async function comfyInstall() {
  return desktop()?.install() ?? null
}

export async function comfyStart() {
  return desktop()?.start() ?? null
}

export async function comfyStop() {
  return desktop()?.stop() ?? null
}

export async function comfyTestConnection(baseUrl) {
  return desktop()?.testConnection(baseUrl) ?? null
}

export async function comfyGetLogs() {
  return desktop()?.getLogs() ?? null
}

export async function comfyOpenFolder(key) {
  return desktop()?.openFolder(key) ?? null
}
