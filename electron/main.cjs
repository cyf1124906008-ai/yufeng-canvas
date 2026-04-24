const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const packageJson = require('../package.json')

const rendererUrl = process.env.ELECTRON_RENDERER_URL

function createWindow() {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png')

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone', details)
  })

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => packageJson.version)

  ipcMain.handle('app:check-update', async () => {
    const repo = 'cyf1124906008-ai/yufeng-canvas'
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${packageJson.productName || packageJson.name}/${packageJson.version}`
      }
    })

    if (!response.ok) {
      throw new Error(`检查更新失败：${response.status}`)
    }

    const release = await response.json()
    const assets = Array.isArray(release.assets) ? release.assets : []
    const installerAsset = assets.find((asset) =>
      /\.exe$/i.test(asset.name || '') &&
      /setup/i.test(asset.name || '')
    ) || assets.find((asset) => /\.exe$/i.test(asset.name || ''))

    return {
      currentVersion: packageJson.version,
      latestVersion: String(release.tag_name || '').replace(/^v/i, ''),
      releaseName: release.name || release.tag_name || '',
      releaseUrl: release.html_url,
      downloadUrl: installerAsset?.browser_download_url || release.html_url,
      publishedAt: release.published_at || ''
    }
  })

  ipcMain.handle('app:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
