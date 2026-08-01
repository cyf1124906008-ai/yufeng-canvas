import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hydrateArtifactManifest,
  hydrateArtifactStore,
  serializeArtifactManifest
} from '../src/agent/runtime/artifactPersistence.js'

test('remote artifacts round-trip through a bounded metadata-only manifest', async () => {
  const manifest = await serializeArtifactManifest([{
    id: 'image-1',
    kind: 'image',
    mediaType: 'image',
    status: 'completed',
    source: 'https://cdn.example/artifacts/image.png',
    prompt: '黑银汽车海报',
    model: 'image-model',
    apiKey: 'must-not-persist',
    providerResponse: { huge: true }
  }], { runId: 'run-1', projectId: 'project-1' })

  const serialized = JSON.stringify(manifest)
  assert.doesNotMatch(serialized, /must-not-persist|providerResponse|"huge"/)
  assert.match(serialized, /remote_url/)

  const hydrated = await hydrateArtifactManifest(JSON.parse(serialized))
  assert.equal(hydrated.runId, 'run-1')
  assert.equal(hydrated.artifacts[0].id, 'image-1')
  assert.equal(hydrated.artifacts[0].source, 'https://cdn.example/artifacts/image.png')
  assert.equal(hydrated.artifacts[0].mediaState, 'remote')
})

test('signed, insecure, and private remote URLs never enter a durable manifest', async () => {
  for (const source of [
    'https://cdn.example/image.png?access_token=secret&X-Amz-Signature=abc',
    'http://cdn.example/image.png',
    'https://127.0.0.1/private.png',
    'https://192.168.1.10/private.png',
    'https://localhost/private.png',
    'https://[::ffff:127.0.0.1]/private.png',
    'https://service.internal/private.png'
  ]) {
    await assert.rejects(
      serializeArtifactManifest([{ id: 'unsafe-remote', source }]),
      error => ['INVALID_REMOTE_URL', 'REMOTE_URL_CREDENTIALS_FORBIDDEN', 'PRIVATE_REMOTE_URL_FORBIDDEN'].includes(error.code)
    )
  }
})

test('data URLs and bare base64 must be externalized instead of entering a manifest', async () => {
  const payload = 'a'.repeat(256)
  await assert.rejects(
    serializeArtifactManifest([{
      id: 'image-data',
      kind: 'image',
      source: `data:image/png;base64,${payload}`
    }]),
    error => error.code === 'MEDIA_EXTERNALIZATION_REQUIRED'
  )
  await assert.rejects(
    serializeArtifactManifest([{
      id: 'image-base64',
      kind: 'image',
      source: payload
    }]),
    error => error.code === 'MEDIA_EXTERNALIZATION_REQUIRED'
  )
})

test('absolute asset paths require conversion to a safe relative asset reference', async () => {
  const absolutePath = '/Users/example/Library/Application Support/YUFENG Agent/yufeng-canvas/assets/run/20260801/image.png'
  const assetProof = 'd'.repeat(64)
  const record = { id: 'local-image', kind: 'image', assetPath: absolutePath, source: absolutePath, assetProof }

  await assert.rejects(
    serializeArtifactManifest([record], { runId: 'run-1' }),
    error => error.code === 'LOCAL_ASSET_REF_REQUIRED'
  )

  const manifest = await serializeArtifactManifest([record], {
    runId: 'run-1',
    toAssetRef: async (assetPath) => {
      assert.equal(assetPath, absolutePath)
      return 'agent-run-1/20260801/asset_1_abcd.png'
    }
  })
  const serialized = JSON.stringify(manifest)
  assert.doesNotMatch(serialized, /Users\/example|Application Support/)
  assert.deepEqual(manifest.artifacts[0].media, {
    kind: 'local_asset',
    ref: 'agent-run-1/20260801/asset_1_abcd.png',
    proof: assetProof
  })

  const unresolved = await hydrateArtifactManifest(manifest)
  assert.equal(unresolved.artifacts[0].source, '')
  assert.equal(unresolved.artifacts[0].assetRef, 'agent-run-1/20260801/asset_1_abcd.png')
  assert.equal(unresolved.artifacts[0].mediaState, 'needs_resolution')

  const resolved = await hydrateArtifactManifest(manifest, {
    resolveAssetRef: async (ref, _artifact, proof, runId) => {
      assert.equal(proof, assetProof)
      assert.equal(runId, 'run-1')
      return ({
      dataUrl: `data:image/png;base64,${'b'.repeat(256)}`,
      assetPath: `/trusted-assets/${ref}`
      })
    }
  })
  assert.match(resolved.artifacts[0].source, /^data:image\/png;base64,/)
  assert.equal(resolved.artifacts[0].assetPath, '/trusted-assets/agent-run-1/20260801/asset_1_abcd.png')
  assert.doesNotMatch(JSON.stringify(manifest), /base64/)
})

test('blob URLs and path traversal asset references are rejected', async () => {
  await assert.rejects(
    serializeArtifactManifest([{ id: 'blob-image', source: 'blob:https://app.example/temporary' }]),
    error => error.code === 'EPHEMERAL_MEDIA_SOURCE'
  )
  await assert.rejects(
    serializeArtifactManifest([{
      id: 'escape',
      assetRef: '../outside/secret.png',
      assetProof: 'e'.repeat(64)
    }], { runId: 'run-1' }),
    error => error.code === 'INVALID_ASSET_REF'
  )
  await assert.rejects(
    serializeArtifactManifest([{
      id: 'encoded-escape',
      assetRef: '%2e%2e/outside/secret.png',
      assetProof: 'e'.repeat(64)
    }], { runId: 'run-1' }),
    error => error.code === 'INVALID_ASSET_REF'
  )
  await assert.rejects(
    serializeArtifactManifest([{
      id: 'wrong-run',
      assetRef: 'agent-run-2/20260801/asset_1_abcd.png',
      assetProof: 'e'.repeat(64)
    }], { runId: 'run-1' }),
    error => error.code === 'ASSET_RUN_MISMATCH'
  )
})

test('hydration preserves stable ids when restoring into an explicit store boundary', async () => {
  const manifest = await serializeArtifactManifest([{
    id: 'video-1',
    kind: 'video',
    mediaType: 'video',
    source: 'https://cdn.example/video/final.mp4',
    sourceArtifactId: 'image-1'
  }])
  const restored = new Map()

  await hydrateArtifactStore(manifest, restored)

  assert.equal(restored.get('video-1').id, 'video-1')
  assert.equal(restored.get('video-1').sourceArtifactId, 'image-1')
  assert.equal(restored.get('video-1').source, 'https://cdn.example/video/final.mp4')
})

test('metadata fields never retain embedded media payloads', async () => {
  const manifest = await serializeArtifactManifest([{
    id: 'image-metadata',
    source: 'https://cdn.example/image.png',
    prompt: `data:image/png;base64,${'c'.repeat(256)}`,
    revisedPrompt: 'd'.repeat(256)
  }])

  assert.equal(manifest.artifacts[0].prompt, '[media-data-omitted]')
  assert.doesNotMatch(JSON.stringify(manifest), /c{64}/)
})
