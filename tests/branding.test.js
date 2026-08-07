import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = relativePath => readFile(new URL(relativePath, import.meta.url), 'utf8')

test('DataEyes Code is the visible application and installer brand', async () => {
  const [packageSource, index, distribution, workflow] = await Promise.all([
    readSource('../package.json'),
    readSource('../index.html'),
    readSource('../src/config/distribution.js'),
    readSource('../.github/workflows/release-windows.yml')
  ])
  const manifest = JSON.parse(packageSource)

  assert.equal(manifest.productName, 'DataEyes Code')
  assert.equal(manifest.build.productName, 'DataEyes Code')
  assert.equal(manifest.build.artifactName, 'DataEyes-Code-Setup-${version}.${ext}')
  assert.equal(manifest.build.mac.artifactName, 'DataEyes-Code-${version}-mac-${arch}.${ext}')
  assert.equal(manifest.build.dmg.title, 'DataEyes Code ${version}')
  assert.equal(manifest.build.dmg.artifactName, 'DataEyes-Code-${version}-mac-${arch}.${ext}')
  assert.match(index, /<title>DataEyes Code<\/title>/)
  assert.match(distribution, /appName: 'DataEyes Code'/)
  assert.match(workflow, /name: dataeyes-code-windows-x64/)
  assert.match(workflow, /release\/DataEyes-Code-Setup-\*\.exe/)
})

test('brand rename preserves installed identity, storage, workspace, and integration contracts', async () => {
  const [packageSource, main, backup, settings, workbenchHistory, brandingDoc] = await Promise.all([
    readSource('../package.json'),
    readSource('../electron/main.cjs'),
    readSource('../src/utils/appDataBackup.js'),
    readSource('../src/stores/settings.js'),
    readSource('../src/agent/memory/WorkbenchSessionRepository.js'),
    readSource('../docs/dataeyes-code-branding.md')
  ])
  const manifest = JSON.parse(packageSource)

  assert.equal(manifest.name, 'yufeng-canvas')
  assert.equal(manifest.build.appId, 'ai.yufeng.canvas')
  assert.equal(manifest.repository.url, 'https://github.com/cyf1124906008-ai/yufeng-canvas.git')
  assert.ok(manifest.yufeng)
  assert.match(main, /const LEGACY_PRODUCT_NAME = 'YUFENG Agent'/)
  assert.match(main, /preferLegacyUserDataWhenBrandedProfileIsEmpty\(\)/)
  assert.match(main, /app\.setPath\('userData', legacyUserData\)/)
  assert.match(main, /path\.join\(documentsPath, 'DataEyes Code Workspace'\)/)
  assert.match(main, /path\.join\(documentsPath, 'YUFENG Agent Workspace'\)/)
  assert.match(main, /process\.env\.YUFENG_UPDATE_MIRROR_URL/)
  assert.match(main, /name: 'yufeng\.health'/)
  assert.match(main, /const userDataBackupKind = 'yufeng-canvas\.user-data'/)
  assert.match(backup, /const SNAPSHOT_KIND = 'yufeng-canvas\.user-data'/)
  assert.match(settings, /yufeng-agent-settings-v1/)
  assert.match(workbenchHistory, /yufeng-agent-workbench-history-v1/)
  assert.match(brandingDoc, /不要为了“字符串统一”批量重命名这些兼容标识/)
})
