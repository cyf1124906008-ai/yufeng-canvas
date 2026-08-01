import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getAgentRunHistoryStatus,
  normalizeAgentRunHistoryRecord,
  normalizeAgentRunHistoryRecords
} from '../src/components/agent/agentRunHistoryView.js'

test('normalizes persisted run records without mutating their payload', () => {
  const record = {
    id: 'history-1',
    updatedAt: '2026-08-01T08:00:00.000Z',
    snapshot: {
      goal: '制作一个 10 秒咖啡广告',
      status: 'completed',
      stepCount: 5,
      artifacts: [{ id: 'image-1' }, { id: 'video-1' }]
    }
  }

  const normalized = normalizeAgentRunHistoryRecord(record)

  assert.equal(normalized.id, 'history-1')
  assert.equal(normalized.goal, '制作一个 10 秒咖啡广告')
  assert.equal(normalized.label, '已完成')
  assert.equal(normalized.tone, 'success')
  assert.equal(normalized.stepCount, 5)
  assert.equal(normalized.artifactCount, 2)
  assert.ok(normalized.time > 0)
  assert.notEqual(normalized.timeLabel, '时间未记录')
  assert.equal(normalized.raw, record)
  assert.deepEqual(record.snapshot.artifacts, [{ id: 'image-1' }, { id: 'video-1' }])
})

test('accepts flat run snapshots and derives counts from timeline and final artifacts', () => {
  const normalized = normalizeAgentRunHistoryRecord({
    runId: 'run-flat',
    goal: '生成海报',
    status: 'failed',
    completedAt: 1785542400000,
    timeline: [{ step: 0 }, { step: 2 }, { step: 4 }],
    final: { artifactIds: ['one', 'two', 'three'] }
  })

  assert.equal(normalized.id, 'run-flat')
  assert.equal(normalized.label, '执行失败')
  assert.equal(normalized.tone, 'error')
  assert.equal(normalized.stepCount, 4)
  assert.equal(normalized.artifactCount, 3)
})

test('supports repository timestamps and persisted artifact manifest objects', () => {
  const normalized = normalizeAgentRunHistoryRecord({
    runId: 'persisted-run',
    goal: '生成产品视频',
    status: 'completed',
    historyCreatedAt: 1785542300000,
    historyUpdatedAt: 1785542400000,
    artifactManifest: {
      kind: 'yufeng-artifact-manifest',
      artifacts: [{ id: 'cover' }, { id: 'video' }]
    }
  })

  assert.equal(normalized.time, 1785542400000)
  assert.equal(normalized.artifactCount, 2)
})

test('normalizes unknown and malformed history values defensively', () => {
  assert.deepEqual(normalizeAgentRunHistoryRecords(null), [])

  const normalized = normalizeAgentRunHistoryRecord(null, 3)
  assert.equal(normalized.id, '')
  assert.equal(normalized.key, 'history-record-3')
  assert.equal(normalized.goal, '未提供用户目标')
  assert.equal(normalized.stepCount, 0)
  assert.equal(normalized.artifactCount, 0)
  assert.equal(normalized.timeLabel, '时间未记录')
  assert.deepEqual(getAgentRunHistoryStatus('custom'), {
    status: 'custom',
    label: 'custom',
    tone: 'idle'
  })
})

test('history panel remains display-only and Canvas-free', async () => {
  const source = await readFile(new URL('../src/components/agent/AgentRunHistoryPanel.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /stores\/(?:canvas|pinia)|useHeadlessCreativeAgent|useCreativeAgent/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|electron|desktopApp/)
  assert.match(source, /emit\('select'/)
  assert.match(source, /emit\('delete'/)
  assert.match(source, /emit\('clear'/)
})

test('history playback is explicitly read-only and destructive actions require Workspace confirmation', async () => {
  const runPanel = await readFile(new URL('../src/components/agent/AgentRunPanel.vue', import.meta.url), 'utf8')
  const workspace = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')

  assert.match(runPanel, /readOnly/)
  assert.match(runPanel, /!props\.readOnly/)
  assert.match(runPanel, /!props\.readOnly && Array\.isArray\(props\.snapshot\?\.artifacts\)/)
  assert.match(runPanel, /if \(props\.readOnly\) return null/)
  assert.match(workspace, /:read-only="viewingHistory"/)
  assert.match(workspace, /confirmDeleteHistory/)
  assert.match(workspace, /confirmClearHistory/)
  assert.match(workspace, /\$dialog\?\.warning/)
})
