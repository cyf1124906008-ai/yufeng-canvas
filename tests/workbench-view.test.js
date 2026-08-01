import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildWorkbenchActivities,
  buildWorkbenchInspector,
  buildWorkbenchPlan,
  normalizeWorkbenchArtifacts,
  workbenchStatus
} from '../src/components/workbench/workbenchView.js'

test('workbench activity feed is empty until a real or injected event exists', () => {
  assert.deepEqual(buildWorkbenchActivities({ goal: 'A poster', status: 'idle' }), [])

  const activities = buildWorkbenchActivities({
    status: 'running',
    timeline: [
      { type: 'planning', step: 0, timestamp: 100 },
      { type: 'action', action: 'generate_image', step: 1, timestamp: 200 },
      { type: 'tool_started', action: 'generate_image', step: 1, timestamp: 300 }
    ]
  })

  assert.equal(activities.length, 3)
  assert.equal(activities[0].kind, 'plan')
  assert.equal(activities[1].title, '已选择：生成图片')
  assert.equal(activities[2].status, 'running')
  assert.equal(activities.some(item => item.status === 'completed'), false)
})

test('dynamic plan marks a tool complete only after tool_succeeded', () => {
  const before = buildWorkbenchActivities({
    timeline: [{ type: 'action', action: 'analyze_image', step: 2 }]
  })
  assert.deepEqual(buildWorkbenchPlan({}, before).map(item => item.status), ['planned'])

  const after = buildWorkbenchActivities({
    timeline: [
      { type: 'action', action: 'analyze_image', step: 2 },
      { type: 'tool_started', action: 'analyze_image', step: 2 },
      { type: 'tool_succeeded', action: 'analyze_image', step: 2 }
    ]
  })
  assert.deepEqual(buildWorkbenchPlan({}, after).map(item => item.status), ['completed'])
})

test('approval, terminal, and computer cards require explicit injected events', () => {
  const activities = buildWorkbenchActivities({}, [
    { id: 'approval-1', type: 'approval_required', message: 'Allow publish?' },
    { id: 'terminal-1', type: 'terminal_result', command: 'npm test', output: 'ok' },
    { id: 'computer-1', type: 'computer_result', output: 'Window inspected' }
  ])

  assert.deepEqual(activities.map(item => item.kind), ['approval', 'terminal', 'computer'])
  assert.equal(activities[0].status, 'pending_approval')
  assert.equal(activities[1].command, 'npm test')
  assert.equal(activities[2].output, 'Window inspected')
})

test('Workbench activities are ordered by actual timestamps instead of data group', () => {
  const activities = buildWorkbenchActivities({}, [
    { id: 'message-1', role: 'assistant', content: '最后回复', createdAt: 300 },
    { id: 'call-1', type: 'tool_call', name: 'workspace.read', status: 'running', createdAt: 100 },
    { id: 'observation-1', type: 'observation', toolCallId: 'call-1', toolName: 'workspace.read', status: 'succeeded', completedAt: 200 }
  ])
  assert.deepEqual(activities.map(item => item.id), ['call-1', 'observation-1', 'message-1'])
})

test('generic Workbench projection messages, tool calls, and observations map without adapter mocks', () => {
  const activities = buildWorkbenchActivities({}, [
    { id: 'message-1', role: 'user', content: 'Inspect this workspace', createdAt: 100 },
    { id: 'call-1', type: 'tool_call', name: 'terminal.exec', status: 'running', input: { command: 'npm test' } },
    { id: 'observation-1', type: 'observation', toolCallId: 'call-1', toolName: 'terminal.exec', status: 'succeeded', output: { stdout: 'ok' } }
  ])

  assert.equal(activities[0].kind, 'message')
  assert.equal(activities[0].message, 'Inspect this workspace')
  assert.equal(activities[1].kind, 'terminal')
  assert.equal(activities[1].command, 'npm test')
  assert.equal(activities[2].status, 'completed')
  assert.match(activities[2].output, /"stdout": "ok"/)
  assert.deepEqual(buildWorkbenchPlan({}, activities).map(item => item.status), ['completed'])
})

test('inspector leaves usage and file changes unreported instead of fabricating values', () => {
  const inspector = buildWorkbenchInspector({
    snapshot: { runId: 'run-1', status: 'running', stepCount: 2 },
    context: { provider: 'DataEyes' }
  })

  assert.equal(inspector.run.statusLabel, '执行中')
  assert.equal(inspector.run.stepCount, 2)
  assert.deepEqual(inspector.files, [])
  assert.equal(inspector.usage.inputTokens, null)
  assert.equal(inspector.usage.outputTokens, null)
  assert.equal(inspector.usage.cost, null)
})

test('artifact view uses only real artifact data and preserves final selection', () => {
  const artifacts = normalizeWorkbenchArtifacts([
    { id: 'image-1', kind: 'image', source: 'https://media.example/poster.png' },
    { id: 'video-1', kind: 'video', source: 'javascript:alert(1)' }
  ], { final: { artifactId: 'image-1' } })

  assert.equal(artifacts[0].url, 'https://media.example/poster.png')
  assert.equal(artifacts[0].isFinal, true)
  assert.equal(artifacts[1].url, '')
  assert.equal(workbenchStatus('interrupted').label, '已中断')
})

test('workbench components are controlled and Workspace uses the real Workbench runtime', async () => {
  const [sidebar, composer, activity, inspector, workspace] = await Promise.all([
    readFile(new URL('../src/components/workbench/WorkbenchSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchActivityFeed.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchInspector.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  ])

  for (const source of [sidebar, composer, activity, inspector]) {
    assert.doesNotMatch(source, /useHeadlessCreativeAgent|useCreativeAgent|stores\/pinia|stores\/canvas|@vue-flow/)
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|desktopApp/)
    assert.match(source, /defineProps/)
    assert.match(source, /defineEmits/)
  }

  assert.match(workspace, /useAgentWorkbench/)
  assert.match(workspace, /workbench\.messages\.value/)
  assert.match(workspace, /workbench\.toolCalls\.value/)
  assert.match(workspace, /workbench\.pendingApproval\.value/)
  assert.match(workspace, /const submit = async/)
  assert.match(workspace, /const approve = async/)
  assert.match(workspace, /const reject = async/)
  assert.match(workspace, /defineExpose/)
  assert.doesNotMatch(workspace, /useHeadlessCreativeAgent/)
  assert.doesNotMatch(workspace, /AgentRunPanel|agent-hero|GOAL IN/)
})

test('workbench visual contract keeps desktop rails, fixed session composer, and mobile drawers', async () => {
  const [activity, composer, inspector, sidebar, workspace] = await Promise.all([
    readFile(new URL('../src/components/workbench/WorkbenchActivityFeed.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchInspector.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  ])

  assert.match(workspace, /grid-template-columns: 252px minmax\(0, 1fr\) 286px/)
  assert.match(workspace, /grid-template-rows: minmax\(0, 1fr\) auto/)
  assert.match(workspace, /@media \(max-width: 1180px\)/)
  assert.match(workspace, /@media \(max-width: 880px\)/)
  assert.match(sidebar, /position: fixed/)
  assert.match(inspector, /position: fixed/)
  assert.match(composer, /wb-composer-shell/)
  assert.match(activity, /approval-card/)
  assert.match(activity, /terminal-card/)
  assert.match(activity, /computer-card/)
})
