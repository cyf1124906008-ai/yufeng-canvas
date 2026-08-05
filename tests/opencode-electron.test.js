import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mainSource = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')

const channels = [
  'get-status',
  'start',
  'stop',
  'health',
  'list-providers',
  'create-session',
  'session-status',
  'prompt',
  'abort'
]

test('Electron exposes a main-process OpenCode bridge with trusted-renderer checks', () => {
  assert.match(mainSource, /require\('\.\/opencode-runtime\.cjs'\)/)
  assert.match(mainSource, /let openCodeRuntime = null/)
  assert.match(preloadSource, /openCode:\s*\{/)

  for (const channel of channels) {
    assert.match(preloadSource, new RegExp(`app:opencode:${channel}`))
    const start = mainSource.indexOf(`ipcMain.handle('app:opencode:${channel}'`)
    const next = mainSource.indexOf('ipcMain.handle(', start + 1)
    const handler = start >= 0
      ? mainSource.slice(start, next >= 0 ? next : start + 1_500)
      : ''
    assert.notEqual(start, -1, `missing OpenCode IPC handler: ${channel}`)
    assert.match(handler, /requireTrustedRenderer\(event\)/)
  }
})
test('OpenCode IPC is opt-in, workspace-bound, and does not forward secrets', () => {
  assert.match(mainSource, /autoStart: false/)
  assert.match(mainSource, /credentialsForwarded: false/)
  assert.match(mainSource, /const requireOpenCodeRuntime = async \(\) =>/)
  assert.match(mainSource, /const identity = await currentWorkspaceIdentity\(\)/)
  assert.match(mainSource, /WORKSPACE_NOT_SET/)
  assert.match(mainSource, /OPEN_CODE_SECRET_ENV_PATTERN/)
  assert.match(mainSource, /buildOpenCodeEnvironment\(process\.env\)/)
  assert.match(mainSource, /sanitizeOpenCodeProviderCatalog/)
  assert.match(mainSource, /OPENCODE_URL_CREDENTIALS_UNSUPPORTED/)
  assert.match(mainSource, /OPENCODE_URL_QUERY_UNSUPPORTED/)
  assert.match(mainSource, /OPENCODE_REMOTE_UNSUPPORTED/)
  assert.match(mainSource, /defaultRoot: defaultWorkspaceRoot/)
  assert.match(mainSource, /fallbackRoot: path\.join\(app\.getPath\('userData'\), 'agent-tools', 'workspace'\)/)

  // The preload API accepts only structured operation inputs. It must never
  // expose process.env, shell commands, or an authorization header surface.
  assert.doesNotMatch(preloadSource, /process\.env/)
  assert.doesNotMatch(preloadSource, /authorization/i)
  assert.doesNotMatch(preloadSource, /api[_-]?key/i)
})
