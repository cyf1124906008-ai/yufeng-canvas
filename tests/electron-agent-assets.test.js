import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, truncate, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)

function loadAssetManager(userDataPath) {
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => userDataPath } }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve('../electron/assets/manager.cjs')
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

const pngDataUrl = `data:image/png;base64,${Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0
]).toString('base64')}`

test('Agent asset IPC policy binds proof to runId, honors retained refs, and enforces cumulative quota', async () => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'yufeng-agent-assets-'))
  try {
    const manager = loadAssetManager(userDataPath)
    const runId = 'run-security-1'
    const saved = await manager.saveAgentDataUrl(pngDataUrl, runId)

    assert.equal(saved.ok, true)
    assert.match(saved.assetRef, new RegExp(`^agent-${runId}/`))
    assert.match(saved.assetProof, /^[a-f0-9]{64}$/)

    const restored = await manager.readAgentAsDataUrl(saved.assetRef, runId, saved.assetProof)
    assert.equal(restored.ok, true)
    assert.match(restored.dataUrl, /^data:image\/png;base64,/)
    assert.equal((await manager.readAgentAsDataUrl(saved.assetRef, 'run-security-2', saved.assetProof)).ok, false)
    assert.equal((await manager.readAgentAsDataUrl(saved.assetPath, runId, saved.assetProof)).ok, false)

    const descriptor = { ref: saved.assetRef, proof: saved.assetProof }
    const retained = await manager.deleteAgentRefs(runId, [descriptor], [descriptor])
    assert.deepEqual({ deleted: retained.deleted, skipped: retained.skipped }, { deleted: 0, skipped: 1 })
    assert.equal((await manager.readAgentAsDataUrl(saved.assetRef, runId, saved.assetProof)).ok, true)

    const wrongOwner = await manager.deleteAgentRefs('run-security-2', [descriptor])
    assert.deepEqual({ deleted: wrongOwner.deleted, skipped: wrongOwner.skipped }, { deleted: 0, skipped: 1 })

    const runDir = path.join(manager.getAssetsRoot(), `agent-${runId}`)
    await mkdir(runDir, { recursive: true })
    const quotaFile = path.join(runDir, 'quota-reservation.bin')
    await writeFile(quotaFile, '')
    await truncate(quotaFile, manager.MAX_AGENT_RUN_BYTES)
    const overQuota = await manager.saveAgentDataUrl(pngDataUrl, runId)
    assert.equal(overQuota.ok, false)
    assert.match(overQuota.error, /累计空间/)

    const removed = await manager.deleteAgentRefs(runId, [descriptor])
    assert.deepEqual({ deleted: removed.deleted, skipped: removed.skipped }, { deleted: 1, skipped: 0 })
  } finally {
    await rm(userDataPath, { recursive: true, force: true })
  }
})

test('Agent asset IPC is separated from legacy absolute-path Canvas reads and checks renderer origin', async () => {
  const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')

  assert.match(preload, /agentAssets:/)
  assert.match(preload, /app:agent-assets:read-as-data-url/)
  assert.doesNotMatch(preload, /app:agent-assets:read-as-data-url'\s*,\s*assetPath/)
  assert.match(main, /requireTrustedRenderer\(event\)/)
  assert.match(main, /readAgentAsDataUrl\(assetRef, runId, assetProof\)/)
  assert.match(main, /deleteAgentRefs\(runId, assetRefs, retainedRefs\)/)
})
