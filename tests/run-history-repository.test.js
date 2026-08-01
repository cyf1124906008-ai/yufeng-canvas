import test from 'node:test'
import assert from 'node:assert/strict'

import {
  RunHistoryRepository,
  RUN_HISTORY_MAX_ENTRIES,
  RUN_HISTORY_SCHEMA_VERSION,
  RUN_HISTORY_STORAGE_KEY,
  sanitizeRunHistoryValue
} from '../src/agent/memory/index.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    values
  }
}

test('upsert, list, and get persist isolated run snapshots', () => {
  const storage = createStorage()
  let timestamp = 100
  const repository = new RunHistoryRepository({ storage, now: () => ++timestamp })

  const first = repository.upsert({ runId: 'run-1', goal: '海报', status: 'completed' })
  repository.upsert({ id: 'run-2', goal: '视频', status: 'failed' })

  assert.equal(first.historyCreatedAt, 101)
  assert.equal(first.historyUpdatedAt, 101)
  assert.deepEqual(repository.list().map(run => run.runId), ['run-2', 'run-1'])
  assert.equal(repository.get('run-1').goal, '海报')
  assert.equal(JSON.parse(storage.values.get(RUN_HISTORY_STORAGE_KEY)).schemaVersion, RUN_HISTORY_SCHEMA_VERSION)

  const snapshot = repository.get('run-1')
  snapshot.goal = 'mutated'
  assert.equal(repository.get('run-1').goal, '海报')
})

test('upsert replaces an existing run and moves it to the front', () => {
  const storage = createStorage()
  let timestamp = 10
  const repository = new RunHistoryRepository({ storage, now: () => ++timestamp })
  repository.upsert({ runId: 'run-1', status: 'running' })
  repository.upsert({ runId: 'run-2', status: 'completed' })
  const updated = repository.upsert({ runId: 'run-1', status: 'failed' })

  assert.deepEqual(repository.list().map(run => run.runId), ['run-1', 'run-2'])
  assert.equal(repository.list().filter(run => run.runId === 'run-1').length, 1)
  assert.equal(updated.status, 'failed')
  assert.equal(updated.historyCreatedAt, 11)
  assert.equal(updated.historyUpdatedAt, 13)
})

test('history is capped at 50 entries and supports a lower configured bound', () => {
  const storage = createStorage()
  const repository = new RunHistoryRepository({ storage, maxEntries: 500 })
  for (let index = 1; index <= 55; index += 1) {
    repository.upsert({ runId: `run-${index}`, status: 'completed' })
  }

  assert.equal(RUN_HISTORY_MAX_ENTRIES, 50)
  assert.equal(repository.list().length, 50)
  assert.equal(repository.list()[0].runId, 'run-55')
  assert.equal(repository.list().at(-1).runId, 'run-6')
  assert.equal(repository.list(3).length, 3)

  const smaller = new RunHistoryRepository({ storage: createStorage(), maxEntries: 2 })
  smaller.upsert({ runId: 'one' })
  smaller.upsert({ runId: 'two' })
  smaller.upsert({ runId: 'three' })
  assert.deepEqual(smaller.list().map(run => run.runId), ['three', 'two'])
})

test('delete and clear update durable storage', () => {
  const storage = createStorage()
  const repository = new RunHistoryRepository({ storage })
  repository.upsert({ runId: 'run-1' })
  repository.upsert({ runId: 'run-2' })

  assert.equal(repository.delete('missing'), false)
  assert.equal(repository.delete('run-1'), true)
  assert.equal(repository.get('run-1'), null)
  assert.deepEqual(repository.list().map(run => run.runId), ['run-2'])

  repository.clear()
  assert.deepEqual(repository.list(), [])
  assert.equal(storage.values.has(RUN_HISTORY_STORAGE_KEY), false)
})

test('credentials and media bytes are recursively removed while artifact URLs remain', () => {
  const bareBase64 = 'QUJD'.repeat(40)
  const storage = createStorage()
  const repository = new RunHistoryRepository({ storage })
  repository.upsert({
    runId: 'safe-run',
    artifacts: [
      { url: 'https://cdn.example.test/final.png' },
      { url: 'https://cdn.example.test/private.png?access_token=secret&signature=abc' },
      { url: 'http://cdn.example.test/insecure.png' },
      { url: 'https://127.0.0.1/private.png' },
      { url: 'file:///Users/example/final.png' },
      { url: 'data:image/png;base64,secret-media' },
      { url: 'blob:https://example.test/transient' }
    ],
    provider: {
      apiKey: 'api-secret',
      authorization: 'Bearer auth-secret',
      access_token: 'access-secret',
      refreshToken: 'refresh-secret',
      clientSecret: 'client-secret',
      sessionToken: 'session-secret',
      cookie: 'cookie-secret',
      privateKey: 'private-key-secret',
      password: 'password-secret',
      b64_json: 'short-base64-media',
      imageData: 'short-image-media',
      response: bareBase64
    }
  })

  const run = repository.get('safe-run')
  assert.equal(run.artifacts[0].url, 'https://cdn.example.test/final.png')
  assert.equal(run.artifacts[1].url, '[unsafe-url-omitted]')
  assert.equal(run.artifacts[2].url, '[unsafe-url-omitted]')
  assert.equal(run.artifacts[3].url, '[unsafe-url-omitted]')
  assert.equal(run.artifacts[4].url, '[unsafe-url-omitted]')
  assert.equal(run.artifacts[5].url, '[media-data-omitted]')
  assert.equal(run.artifacts[6].url, '[transient-media-reference-omitted]')
  assert.equal(run.provider.apiKey, '[redacted]')
  assert.equal(run.provider.access_token, '[redacted]')
  assert.equal(run.provider.refreshToken, '[redacted]')
  assert.equal(run.provider.clientSecret, '[redacted]')
  assert.equal(run.provider.sessionToken, '[redacted]')
  assert.equal(run.provider.cookie, '[redacted]')
  assert.equal(run.provider.privateKey, '[redacted]')
  assert.equal(run.provider.password, '[redacted]')
  assert.equal(run.provider.b64_json, '[media-data-omitted]')
  assert.equal(run.provider.imageData, '[media-data-omitted]')
  assert.equal(run.provider.response, '[media-data-omitted]')

  const persisted = storage.values.get(RUN_HISTORY_STORAGE_KEY)
  assert.doesNotMatch(persisted, /api-secret|auth-secret|access-secret|refresh-secret/)
  assert.doesNotMatch(persisted, /signature=abc/)
  assert.doesNotMatch(persisted, /127\.0\.0\.1|file:\/\/|http:\/\/cdn/)
  assert.doesNotMatch(persisted, /client-secret|session-secret|cookie-secret|private-key-secret|password-secret/)
  assert.doesNotMatch(persisted, /secret-media|short-base64-media|short-image-media/)
  assert.doesNotMatch(persisted, new RegExp(bareBase64))
})

test('untrusted stored documents are sanitized again on read', () => {
  const storage = createStorage()
  storage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify({
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
    runs: [{ runId: 'legacy-run', clientSecret: 'stored-secret', payload: 'QUJD'.repeat(40) }]
  }))
  const repository = new RunHistoryRepository({ storage })

  assert.equal(repository.get('legacy-run').clientSecret, '[redacted]')
  assert.equal(repository.get('legacy-run').payload, '[media-data-omitted]')
})

test('invalid or incompatible documents fail closed as empty history', () => {
  const corruptStorage = createStorage()
  corruptStorage.setItem(RUN_HISTORY_STORAGE_KEY, '{not-json')
  assert.deepEqual(new RunHistoryRepository({ storage: corruptStorage }).list(), [])

  const futureStorage = createStorage()
  futureStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify({
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION + 1,
    runs: [{ runId: 'future-run' }]
  }))
  assert.deepEqual(new RunHistoryRepository({ storage: futureStorage }).list(), [])

  const oversizedStorage = createStorage()
  oversizedStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify({
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
    runs: [{ runId: 'oversized-run', text: 'very-long-text:'.repeat(20) }]
  }))
  assert.deepEqual(new RunHistoryRepository({
    storage: oversizedStorage,
    maxRecordLength: 100
  }).list(), [])
})

test('sanitization and record size bounds are enforced', () => {
  const cyclic = { value: 'ok' }
  cyclic.self = cyclic
  const safe = sanitizeRunHistoryValue({
    nested: { nested: { nested: cyclic } },
    list: [1, 2, 3, 4],
    text: 'abcdefgh'
  }, { maxDepth: 3, maxArrayLength: 2, maxStringLength: 4 })
  assert.equal(safe.nested.nested.nested, '[max-depth]')
  assert.deepEqual(safe.list, [1, 2])
  assert.equal(safe.text, 'abcd…')

  const ordinaryText = 'this is ordinary English prose and must remain readable in run history '.repeat(4)
  assert.equal(sanitizeRunHistoryValue(ordinaryText), ordinaryText)

  const repository = new RunHistoryRepository({
    storage: createStorage(),
    maxRecordLength: 100,
    sanitizerOptions: { maxStringLength: 1_000 }
  })
  assert.throws(
    () => repository.upsert({ runId: 'too-large', text: 'x'.repeat(200) }),
    error => error.code === 'RUN_HISTORY_RECORD_TOO_LARGE'
  )
  assert.deepEqual(repository.list(), [])
})

test('Map can be injected directly as storage', () => {
  const storage = new Map()
  const repository = new RunHistoryRepository({ storage })
  repository.upsert({ runId: 'map-run', status: 'completed' })

  assert.equal(repository.get('map-run').status, 'completed')
  repository.clear()
  assert.deepEqual(repository.list(), [])
})
