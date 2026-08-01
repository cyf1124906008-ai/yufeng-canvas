import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  REASONING_EFFORT_OPTIONS,
  activePublicToolLabel,
  deriveReasoningStages,
  normalizeReasoningEffort,
  reasoningEffortView,
  reasoningProgress
} from '../src/components/settings/reasoningView.js'

test('reasoning effort exposes the exact supported levels and Chinese labels', () => {
  assert.deepEqual(REASONING_EFFORT_OPTIONS.map(option => option.id), [
    'auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
  ])
  assert.deepEqual(REASONING_EFFORT_OPTIONS.map(option => option.label), [
    '自动', '极速', '轻量', '标准', '深度', '极致', 'Max'
  ])
  assert.equal(normalizeReasoningEffort('XHIGH'), 'xhigh')
  assert.equal(normalizeReasoningEffort('unsupported'), 'auto')
  assert.equal(reasoningEffortView('max').tone, 'max')
})

test('advanced status derives four stages only from public plan, tool and observation state', () => {
  const understanding = deriveReasoningStages({ running: true })
  assert.deepEqual(understanding.map(stage => stage.status), ['running', 'pending', 'pending', 'pending'])

  const planning = deriveReasoningStages({
    running: true,
    plan: { steps: [{ id: 'one', step: 'Inspect', status: 'in_progress' }] }
  })
  assert.deepEqual(planning.map(stage => stage.status), ['completed', 'running', 'pending', 'pending'])

  const executing = deriveReasoningStages({
    running: true,
    plan: { steps: [{ step: 'Inspect', status: 'completed' }] },
    toolCalls: [{ id: 'tool-1', name: 'workspace.read', status: 'running' }]
  })
  assert.deepEqual(executing.map(stage => stage.status), ['completed', 'completed', 'running', 'pending'])
  assert.equal(activePublicToolLabel([{ name: 'workspace.read', status: 'running' }]), 'workspace.read')

  const verifying = deriveReasoningStages({
    running: true,
    toolCalls: [{ id: 'tool-1', name: 'workspace.read', status: 'completed' }],
    observations: [{ id: 'result-1', status: 'succeeded' }]
  })
  assert.deepEqual(verifying.map(stage => stage.status), ['completed', 'completed', 'completed', 'running'])
  assert.equal(reasoningProgress(verifying), 86)

  const finished = deriveReasoningStages({ running: false, status: 'completed' })
  assert.deepEqual(finished.map(stage => stage.status), ['completed', 'completed', 'completed', 'completed'])
})

test('reusable selector is controlled, compact, and reports unsupported-level fallback', async () => {
  const source = await readFile(new URL('../src/components/settings/ReasoningEffortSelector.vue', import.meta.url), 'utf8')

  assert.match(source, /modelValue: \{ type: String, default: 'auto' \}/)
  assert.match(source, /disabled: \{ type: Boolean, default: false \}/)
  assert.match(source, /'update:modelValue'/)
  assert.match(source, /update: value/)
  assert.match(source, /role="listbox"/)
  assert.match(source, /role="option"/)
  assert.match(source, /Provider 会回退到模型默认强度并写入日志/)
  assert.match(source, /@media \(max-width: 520px\)/)
  assert.doesNotMatch(source, /localStorage|useAgentSettings|useAgentWorkbench/)
})

test('Max status panel is visible only while running and never accepts hidden reasoning content', async () => {
  const source = await readFile(new URL('../src/components/settings/ReasoningStatusPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /normalizeReasoningEffort\(props\.effort\) === 'max' && props\.running/)
  for (const prop of ['effort', 'running', 'status', 'plan', 'toolCalls', 'observations']) {
    assert.match(source, new RegExp(`${prop}: \\{ type:`))
  }
  for (const label of ['理解任务', '制定计划', '执行工具', '验证结果']) {
    assert.match(JSON.stringify(deriveReasoningStages({})), new RegExp(label))
  }
  assert.match(source, /仅依据公开计划、工具调用与结果状态推导/)
  assert.match(source, /不展示或模拟隐藏思维链/)
  assert.doesNotMatch(source, /chainOfThought|reasoningContent|hiddenThoughts|思维过程/)
})

test('AgentWorkspace wires reasoning preference into the request runtime and public Max UI', async () => {
  const workspace = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../src/agent/runtime/useAgentWorkbench.js', import.meta.url), 'utf8')
  const providers = await readFile(new URL('../src/config/providers.js', import.meta.url), 'utf8')

  assert.match(workspace, /reasoningEffort: settings\.reasoningEffort/)
  assert.match(workspace, /<reasoning-status-panel/)
  assert.match(workspace, /@update-reasoning-effort="settings\.setReasoningEffort"/)
  assert.match(runtime, /createHeadlessChatClient\(\{[\s\S]*?reasoningEffort/)
  assert.match(providers, /adapted\.reasoning_effort = params\.reasoning_effort/)
})
