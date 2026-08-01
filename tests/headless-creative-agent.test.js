import test from 'node:test'
import assert from 'node:assert/strict'

import { useHeadlessCreativeAgent } from '../src/agent/runtime/useHeadlessCreativeAgent.js'
import { createHeadlessImageArtifactStore } from '../src/agent/runtime/headlessImageTool.js'
import { RunHistoryRepository } from '../src/agent/memory/index.js'

test('headless creative agent completes image generation and review without Canvas', async () => {
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'headless-image' })
  const generateImageTool = {
    execute: async () => {
      const artifactId = store.put({
        kind: 'image',
        mediaType: 'image',
        status: 'completed',
        source: 'https://media.example/poster.png',
        prompt: '海报',
        createdAt: Date.now()
      })
      return { status: 'completed', artifactId, artifactRef: `artifact:${artifactId}` }
    }
  }
  const analyzeImageTool = async input => ({
    status: 'completed',
    artifactId: input.artifactId,
    artifactRef: input.artifactRef,
    accepted: true,
    decision: 'accept',
    qualityUnverified: false,
    review: {
      artifactRef: input.artifactRef,
      hardFailures: [],
      technical: { decodable: true, width: 1024, height: 1024 }
    }
  })
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool,
    analyzeImageTool,
    plannerLlm: null
  })

  const result = await agent.run('生成一张黑银汽车海报')

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'finish'
  ])
  assert.equal(agent.snapshot.value.status, 'completed')
  assert.equal(agent.artifacts.value[0].id, 'headless-image')
  assert.equal(agent.artifacts.value[0].url, 'https://media.example/poster.png')
  assert.equal(agent.snapshot.value.artifacts[0].value.artifactId, 'headless-image')
  assert.doesNotMatch(JSON.stringify(agent.snapshot.value), /media\.example/)
})

test('headless creative agent cancellation remains available to the desktop UI', async () => {
  let started
  const generateImageTool = {
    execute: (_input, runtime) => new Promise((resolve, reject) => {
      started = true
      runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), { once: true })
    })
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    generateImageTool,
    analyzeImageTool: async () => ({}),
    plannerLlm: null
  })

  const pending = agent.run('生成图片')
  while (!started) await Promise.resolve()
  assert.equal(agent.cancel('用户停止'), true)
  await assert.rejects(pending)
  assert.equal(agent.snapshot.value.status, 'cancelled')
  assert.equal(agent.canRetry.value, false)
  assert.throws(() => agent.retry(), error => error.code === 'UNSAFE_AGENT_RETRY')
})

test('headless creative agent refuses programmatic retry after Provider acceptance', async () => {
  let calls = 0
  const generateImageTool = async () => {
    calls += 1
    const error = new Error('Provider accepted the request and is still working')
    error.code = 'VIDEO_TASK_PENDING'
    error.acceptedByProvider = true
    error.taskId = 'provider-task-1'
    throw error
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    generateImageTool,
    analyzeImageTool: async () => ({}),
    plannerLlm: null
  })

  await assert.rejects(agent.run('生成图片'), /still working/)
  assert.equal(agent.snapshot.value.error.acceptedByProvider, true)
  assert.equal(agent.canRetry.value, false)
  assert.throws(() => agent.retry(), error => error.code === 'UNSAFE_AGENT_RETRY')
  assert.equal(calls, 1)
})

test('headless creative agent autonomously continues from reviewed image to video', async () => {
  let id = 0
  const store = createHeadlessImageArtifactStore({ idFactory: record =>
    `${record.kind}-${++id}`
  })
  const generateImageTool = async () => {
    const artifactId = store.put({
      kind: 'image',
      mediaType: 'image',
      status: 'completed',
      source: 'https://media.example/frame.png'
    })
    return { artifactId, artifactRef: `artifact:${artifactId}` }
  }
  const analyzeImageTool = async input => ({
    artifactId: input.artifactId,
    artifactRef: input.artifactRef,
    accepted: true,
    decision: 'accept',
    review: { artifactRef: input.artifactRef, hardFailures: [] }
  })
  const generateVideoTool = async input => {
    assert.equal(input.imageArtifactId, 'image-1')
    const artifactId = store.put({
      kind: 'video',
      mediaType: 'video',
      status: 'completed',
      source: 'https://media.example/final.mp4'
    })
    return { artifactId, artifactRef: `artifact:${artifactId}` }
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool,
    analyzeImageTool,
    generateVideoTool,
    plannerLlm: null
  })

  const result = await agent.run('制作一个 5 秒汽车广告视频', { targetType: 'video' })
  assert.deepEqual(result.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'generate_video',
    'finish'
  ])
  assert.equal(agent.artifacts.value.at(-1).kind, 'video')
  assert.equal(agent.artifacts.value.at(-1).url, 'https://media.example/final.mp4')
})

test('completed runs persist as bounded local history and can be reopened read-only', async () => {
  const historyStorage = new Map()
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'history-image' })
  const generateImageTool = async () => {
    const artifactId = store.put({
      kind: 'image',
      mediaType: 'image',
      status: 'completed',
      source: 'https://media.example/history-poster.png',
      createdAt: Date.now()
    })
    return { artifactId, artifactRef: `artifact:${artifactId}` }
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool,
    analyzeImageTool: async input => ({
      artifactId: input.artifactId,
      artifactRef: input.artifactRef,
      accepted: true,
      decision: 'accept',
      review: { artifactRef: input.artifactRef, hardFailures: [] }
    }),
    plannerLlm: null,
    historyStorage,
    desktopAssets: null
  })

  await agent.run('生成一张可恢复的海报')
  await agent.waitForHistoryPersistence()

  assert.equal(agent.historyRecords.value.length, 1)
  const record = agent.historyRecords.value[0]
  assert.equal(record.status, 'completed')
  assert.equal(record.artifactManifest.artifacts[0].media.kind, 'remote_url')

  await agent.selectHistory(record.runId)
  assert.equal(agent.historySnapshot.value.status, 'completed')
  assert.equal(agent.historyArtifacts.value[0].url, 'https://media.example/history-poster.png')
})

test('desktop data-url artifacts are externalized and survive a new runtime without localStorage media bytes', async () => {
  const historyStorage = new Map()
  const mediaPayload = 'a'.repeat(256)
  const dataUrl = `data:image/png;base64,${mediaPayload}`
  let assetRef = ''
  const assetProof = 'b'.repeat(64)
  let saveCalls = 0
  const deletedRefs = []
  const desktopAssets = {
    saveDataUrl: async (value, runId) => {
      saveCalls += 1
      assert.equal(value, dataUrl)
      assetRef = `agent-${runId}/20260801/asset_1_abcd.png`
      return { ok: true, assetRef, assetProof }
    },
    readAsDataUrl: async (value, _runId, proof) => ({ ok: value === assetRef && proof === assetProof, dataUrl }),
    deleteRefs: async (_runId, values) => {
      deletedRefs.push(...values)
      return { ok: true, deleted: values.length, skipped: 0 }
    }
  }
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'local-image' })
  const first = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool: async () => {
      const artifactId = store.put({
        kind: 'image',
        mediaType: 'image',
        status: 'completed',
        source: dataUrl
      })
      return { artifactId, artifactRef: `artifact:${artifactId}` }
    },
    analyzeImageTool: async input => ({
      artifactId: input.artifactId,
      artifactRef: input.artifactRef,
      accepted: true,
      decision: 'accept',
      review: { artifactRef: input.artifactRef, hardFailures: [] }
    }),
    plannerLlm: null,
    historyStorage,
    desktopAssets
  })

  await first.run('生成一张本地保存的海报')
  await first.waitForHistoryPersistence()
  const runId = first.historyRecords.value[0].runId
  const serializedHistory = historyStorage.get('yufeng-agent-run-history-v1')
  assert.doesNotMatch(serializedHistory, /data:image|a{128}/)
  assert.ok(serializedHistory.includes(assetRef))
  assert.equal(saveCalls, 1)

  const second = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    generateImageTool: async () => ({}),
    analyzeImageTool: async () => ({}),
    plannerLlm: null,
    historyStorage,
    desktopAssets
  })
  await second.selectHistory(runId)

  assert.equal(second.historyArtifacts.value[0].id, 'local-image')
  assert.equal(second.historyArtifacts.value[0].url, dataUrl)

  assert.equal(second.deleteHistory(runId), true)
  await Promise.resolve()
  assert.deepEqual(deletedRefs, [{ ref: assetRef, proof: assetProof }])
})

test('signed Provider URLs are retained only as unavailable artifact metadata', async () => {
  const historyStorage = new Map()
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'signed-image' })
  const signedUrl = 'https://cdn.example/poster.png?access_token=secret123&X-Amz-Signature=abc'
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool: async () => {
      const artifactId = store.put({ kind: 'image', mediaType: 'image', source: signedUrl })
      return { artifactId, artifactRef: `artifact:${artifactId}` }
    },
    analyzeImageTool: async input => ({
      artifactId: input.artifactId,
      artifactRef: input.artifactRef,
      accepted: true,
      decision: 'accept',
      review: { artifactRef: input.artifactRef, hardFailures: [] }
    }),
    plannerLlm: null,
    historyStorage,
    desktopAssets: null
  })

  await agent.run('生成签名链接海报')
  await agent.waitForHistoryPersistence()

  const persisted = historyStorage.get('yufeng-agent-run-history-v1')
  assert.doesNotMatch(persisted, /secret123|X-Amz-Signature|access_token/)
  assert.equal(agent.historyRecords.value[0].artifactManifest.artifacts[0].media.kind, 'unavailable')
})

test('history I/O timeout never delays a completed creative run', async () => {
  const historyStorage = new Map()
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'timeout-image' })
  const never = new Promise(() => {})
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool: async () => {
      const artifactId = store.put({ kind: 'image', mediaType: 'image', source: 'data:image/png;base64,AAAA' })
      return { artifactId, artifactRef: `artifact:${artifactId}` }
    },
    analyzeImageTool: async input => ({
      artifactId: input.artifactId,
      artifactRef: input.artifactRef,
      accepted: true,
      decision: 'accept',
      review: { artifactRef: input.artifactRef, hardFailures: [] }
    }),
    plannerLlm: null,
    historyStorage,
    historyIoTimeoutMs: 10,
    desktopAssets: { saveDataUrl: () => never }
  })

  const startedAt = Date.now()
  await agent.run('历史 I/O 不能阻塞创作')
  assert.ok(Date.now() - startedAt < 500)
  assert.equal(agent.snapshot.value.status, 'completed')
  await agent.waitForHistoryPersistence()
  assert.equal(agent.historyRecords.value[0].status, 'completed')
})

test('deleting a run tombstones delayed history writes and cleans newly externalized media', async () => {
  const historyStorage = new Map()
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'delayed-image' })
  let assetRef = ''
  const assetProof = 'c'.repeat(64)
  const deleted = []
  let releaseSave
  let saveStarted = false
  const savePending = new Promise(resolve => { releaseSave = resolve })
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool: async () => {
      const artifactId = store.put({ kind: 'image', mediaType: 'image', source: 'data:image/png;base64,AAAA' })
      return { artifactId, artifactRef: `artifact:${artifactId}` }
    },
    analyzeImageTool: async input => ({
      artifactId: input.artifactId,
      artifactRef: input.artifactRef,
      accepted: true,
      decision: 'accept',
      review: { artifactRef: input.artifactRef, hardFailures: [] }
    }),
    plannerLlm: null,
    historyStorage,
    historyIoTimeoutMs: 1_000,
    desktopAssets: {
      saveDataUrl: () => {
        saveStarted = true
        return savePending
      },
      deleteRefs: async (_runId, descriptors) => {
        deleted.push(...descriptors)
        return { ok: true, deleted: descriptors.length, skipped: 0 }
      }
    }
  })

  await agent.run('删除不能被迟到写入复活')
  while (!saveStarted) await Promise.resolve()
  const runId = agent.snapshot.value.runId
  assetRef = `agent-${runId}/20260801/asset_2_abcd.png`
  assert.equal(agent.deleteHistory(runId), true)
  releaseSave({ ok: true, assetRef, assetProof })
  await agent.waitForHistoryPersistence()

  assert.equal(agent.historyRepository.get(runId), null)
  assert.deepEqual(deleted, [{ ref: assetRef, proof: assetProof }])
})

test('a run left active by a previous app session is marked interrupted without automatic resubmission', () => {
  const historyStorage = new Map()
  const repository = new RunHistoryRepository({ storage: historyStorage })
  repository.upsert({
    runId: 'crashed-run',
    goal: '未完成的供应商任务',
    status: 'running',
    snapshot: { runId: 'crashed-run', goal: '未完成的供应商任务', status: 'running' }
  })

  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    generateImageTool: async () => ({}),
    analyzeImageTool: async () => ({}),
    plannerLlm: null,
    historyStorage,
    desktopAssets: null
  })

  assert.equal(agent.historyRecords.value[0].status, 'interrupted')
  assert.equal(agent.historyRecords.value[0].snapshot.status, 'interrupted')
  assert.equal(agent.snapshot.value.status, 'idle')
})

test('history recovery failures never block headless agent initialization', () => {
  let listCalls = 0
  const activeRecord = {
    runId: 'flaky-history-run',
    goal: '恢复失败也要启动',
    status: 'running',
    snapshot: { runId: 'flaky-history-run', status: 'running' }
  }
  const repository = {
    list: () => {
      listCalls += 1
      if (listCalls === 1) return [activeRecord]
      const error = new Error('history reread failed')
      error.code = 'HISTORY_REREAD_FAILED'
      throw error
    },
    upsert: () => {
      const error = new Error('history recovery write failed')
      error.code = 'HISTORY_UPSERT_FAILED'
      throw error
    }
  }

  let recoveredAgent
  assert.doesNotThrow(() => {
    recoveredAgent = useHeadlessCreativeAgent({
      modelStore: {},
      modelRouter: {},
      generateImageTool: async () => ({}),
      analyzeImageTool: async () => ({}),
      plannerLlm: null,
      historyRepository: repository,
      desktopAssets: null
    })
  })
  assert.equal(recoveredAgent.snapshot.value.status, 'idle')
  assert.equal(recoveredAgent.historyRecords.value[0].status, 'interrupted')
  assert.deepEqual(
    recoveredAgent.runtimeLogs.value.map(log => log.details?.operation).filter(Boolean).sort(),
    ['list_recovered', 'upsert_interrupted']
  )

  let unavailableAgent
  assert.doesNotThrow(() => {
    unavailableAgent = useHeadlessCreativeAgent({
      modelStore: {},
      modelRouter: {},
      generateImageTool: async () => ({}),
      analyzeImageTool: async () => ({}),
      plannerLlm: null,
      historyRepository: {
        list: () => { throw new Error('history unavailable') },
        upsert: () => null
      },
      desktopAssets: null
    })
  })
  assert.deepEqual(unavailableAgent.historyRecords.value, [])
  assert.equal(unavailableAgent.snapshot.value.status, 'idle')
})

test('timed-out artifact externalization shares one save and cleans its late result', async () => {
  const historyStorage = new Map()
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'late-image' })
  let assetRef = ''
  const assetProof = 'd'.repeat(64)
  const deleted = []
  let saveCalls = 0
  let releaseSave
  const savePending = new Promise(resolve => { releaseSave = resolve })
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool: async () => {
      const artifactId = store.put({
        kind: 'image',
        mediaType: 'image',
        source: 'data:image/png;base64,AAAA'
      })
      return { artifactId, artifactRef: `artifact:${artifactId}` }
    },
    analyzeImageTool: async input => ({
      artifactId: input.artifactId,
      artifactRef: input.artifactRef,
      accepted: true,
      decision: 'accept',
      review: { artifactRef: input.artifactRef, hardFailures: [] }
    }),
    plannerLlm: null,
    historyStorage,
    historyIoTimeoutMs: 5,
    desktopAssets: {
      saveDataUrl: () => {
        saveCalls += 1
        return savePending
      },
      deleteRefs: async (_runId, descriptors) => {
        deleted.push(...descriptors)
        return { ok: true, deleted: descriptors.length, skipped: 0 }
      }
    }
  })

  await agent.run('迟到的本地保存结果不能变成孤儿文件')
  await agent.waitForHistoryPersistence()

  assert.equal(saveCalls, 1)
  assert.equal(agent.historyRecords.value[0].artifactManifest.artifacts[0].media.kind, 'unavailable')

  assetRef = `agent-${agent.snapshot.value.runId}/20260801/poster.png`
  releaseSave({ ok: true, assetRef, assetProof })
  for (let index = 0; index < 20 && deleted.length === 0; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  assert.equal(saveCalls, 1)
  assert.deepEqual(deleted, [{ ref: assetRef, proof: assetProof }])
})
