import test from 'node:test'
import assert from 'node:assert/strict'

import { ToolRegistry } from '../src/agent/core/index.js'
import {
  WorkbenchSession,
  defineTool,
  projectWorkbenchEvents,
  sanitizeWorkbenchValue
} from '../src/agent/workbench/index.js'

function deterministicRuntime() {
  let sequence = 0
  let timestamp = 1_800_000_000_000
  return {
    idFactory: prefix => `${prefix}-${++sequence}`,
    now: () => ++timestamp
  }
}

test('WorkbenchSession supports generic tools and multiple user turns', async () => {
  const runtime = deterministicRuntime()
  const registry = new ToolRegistry()
  const calls = []
  registry.register('read_workspace', defineTool({
    name: 'read_workspace',
    description: 'Read a workspace text file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    },
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async input => {
    calls.push(input)
    return {
      text: 'package name: yufeng',
      apiKey: 'must-not-persist',
      url: 'https://private.example/result'
    }
  }))

  let plannerCalls = 0
  let visibleTools
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: async ({ session: state, tools }) => {
      plannerCalls += 1
      visibleTools = tools
      if (state.turnCount === 1 && state.observations.length === 0) {
        return { type: 'tool_call', name: 'read_workspace', input: { path: 'package.json' } }
      }
      if (state.turnCount === 1) {
        return { type: 'message', content: '项目名称已经找到，还需要我继续吗？' }
      }
      return { type: 'finish', result: { summary: '检查结束', apiKey: 'also-secret' } }
    }
  })

  const firstTurn = await session.submitUserMessage('检查这个项目')

  assert.equal(firstTurn.status, 'awaiting_user')
  assert.equal(firstTurn.turnCount, 1)
  assert.deepEqual(calls, [{ path: 'package.json' }])
  assert.equal(firstTurn.observations[0].status, 'succeeded')
  assert.equal(firstTurn.observations[0].output.apiKey, '[redacted]')
  assert.equal(firstTurn.observations[0].output.url, '[media-reference-hidden]')
  assert.equal(visibleTools[0].name, 'read_workspace')
  assert.equal('execute' in visibleTools[0], false)
  assert.equal(JSON.stringify(visibleTools).includes('execute'), false)

  const completed = await session.submitUserMessage('不用了，结束任务')

  assert.equal(completed.status, 'completed')
  assert.equal(completed.turnCount, 2)
  assert.equal(completed.final.apiKey, '[redacted]')
  assert.equal(plannerCalls, 3)

  const serializedEvents = JSON.stringify(session.events())
  assert.doesNotMatch(serializedEvents, /must-not-persist|also-secret|private\.example/)
  const restoredProjection = projectWorkbenchEvents(JSON.parse(serializedEvents))
  assert.deepEqual(restoredProjection, session.snapshot())
})

test('a completed Workbench task can continue in the same session with separate display content', async () => {
  const runtime = deterministicRuntime()
  const plannerMessages = []
  const session = new WorkbenchSession({
    ...runtime,
    planner: ({ session: state }) => {
      plannerMessages.push(state.messages.map(message => ({
        role: message.role,
        content: message.content
      })))
      return {
        type: 'finish',
        result: { content: `第 ${state.turnCount} 轮完成` }
      }
    }
  })

  const first = await session.submitUserMessage(
    '分析附件\n\n<attachment name="notes.txt">内部正文</attachment>',
    { displayContent: '分析附件' }
  )
  assert.equal(first.status, 'completed')
  assert.equal(first.messages[0].displayContent, '分析附件')
  assert.equal(first.messages.length, 2)
  assert.deepEqual(first.messages.map(message => message.role), ['user', 'assistant'])
  assert.equal(first.messages[1].content, '第 1 轮完成')
  assert.equal(first.messages[1].final, true)
  assert.equal(first.final.content, '第 1 轮完成')

  const second = await session.submitUserMessage('继续检查结果')
  assert.equal(second.status, 'completed')
  assert.equal(second.turnCount, 2)
  assert.equal(second.messages.length, 4)
  assert.deepEqual(second.messages.map(message => message.role), ['user', 'assistant', 'user', 'assistant'])
  assert.deepEqual(second.messages.filter(message => message.final).map(message => message.content), [
    '第 1 轮完成',
    '第 2 轮完成'
  ])
  assert.equal(second.final.content, '第 2 轮完成')
  assert.equal(second.completedAt > first.completedAt, true)
  assert.deepEqual(plannerMessages[1], [
    { role: 'user', content: '分析附件\n\n<attachment name="notes.txt">内部正文</attachment>' },
    { role: 'assistant', content: '第 1 轮完成' },
    { role: 'user', content: '继续检查结果' }
  ])
  assert.deepEqual(projectWorkbenchEvents(session.events()).messages, second.messages)
})

test('dangerous tools pause for approval and execute only after approval', async () => {
  const runtime = deterministicRuntime()
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('delete_file', defineTool({
    name: 'delete_file',
    description: 'Delete one file',
    riskLevel: 'dangerous',
    approvalPolicy: 'on_danger'
  }, async input => {
    executions += 1
    return { deleted: input.path }
  }))
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length === 0
      ? { type: 'tool_call', name: 'delete_file', input: { path: 'tmp.txt' } }
      : { type: 'finish', result: { deleted: true } }
  })

  const waiting = await session.submitUserMessage('删除临时文件')

  assert.equal(waiting.status, 'awaiting_approval')
  assert.equal(waiting.toolCalls[0].riskLevel, 'dangerous')
  assert.equal(waiting.toolCalls[0].approvalStatus, 'pending')
  assert.equal(waiting.approvals[0].status, 'pending')
  assert.equal(executions, 0)

  const completed = await session.resolveApproval(waiting.pendingApproval.id, {
    status: 'approved',
    reason: '用户确认仅删除 tmp.txt'
  })

  assert.equal(executions, 1)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.approvals[0].status, 'approved')
  assert.equal(completed.observations[0].status, 'succeeded')
})

test('rejected approval becomes an observation and lets the planner explain or reroute', async () => {
  const runtime = deterministicRuntime()
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('publish_release', defineTool({
    name: 'publish_release',
    description: 'Publish a release externally',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { published: true }
  }))
  const plannerObservations = []
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: ({ session: state }) => {
      plannerObservations.push(state.observations)
      if (state.observations.length === 0) return { type: 'tool_call', name: 'publish_release' }
      return { type: 'message', content: '已取消发布，现有本地内容没有改变。' }
    }
  })

  const waiting = await session.submitUserMessage('发布这个版本')
  const resumed = await session.resolveApproval(waiting.pendingApproval.id, {
    status: 'rejected',
    reason: '先不要发到外部'
  })

  assert.equal(executions, 0)
  assert.equal(resumed.status, 'awaiting_user')
  assert.equal(resumed.approvals[0].status, 'rejected')
  assert.equal(resumed.observations[0].status, 'rejected')
  assert.equal(resumed.observations[0].error.code, 'TOOL_APPROVAL_REJECTED')
  assert.equal(plannerObservations.at(-1)[0].status, 'rejected')
  assert.match(resumed.messages.at(-1).content, /取消发布/)
})

test('a serialized pending approval cannot replay a side effect without raw in-memory input', async () => {
  const runtime = deterministicRuntime()
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('write_config', defineTool({
    name: 'write_config',
    riskLevel: 'dangerous',
    approvalPolicy: 'on_danger'
  }, async () => {
    executions += 1
    return { written: true }
  }))
  const planner = ({ session: state }) => state.observations.length === 0
    ? { type: 'tool_call', name: 'write_config', input: { path: 'app.json' } }
    : { type: 'finish', result: { ok: true } }
  const original = new WorkbenchSession({ ...runtime, toolRegistry: registry, planner })
  const waiting = await original.submitUserMessage('修改配置')
  const persisted = JSON.parse(JSON.stringify(original.events()))

  const restored = new WorkbenchSession({
    ...runtime,
    sessionId: original.sessionId,
    events: persisted,
    toolRegistry: registry,
    planner
  })
  await assert.rejects(
    restored.resolveApproval(waiting.pendingApproval.id, 'approved'),
    error => error.code === 'WORKBENCH_RAW_TOOL_INPUT_UNAVAILABLE'
  )
  assert.equal(executions, 0)
  assert.equal(restored.snapshot().status, 'awaiting_approval')

  const result = await restored.resolveApproval(waiting.pendingApproval.id, 'rejected')

  assert.equal(executions, 0)
  assert.equal(result.status, 'completed')
  assert.equal(result.eventCount, persisted.length + 4)
  assert.deepEqual(projectWorkbenchEvents(restored.events()), result)
})

test('tool failures are observations so the planner can recover within the same turn', async () => {
  const runtime = deterministicRuntime()
  const registry = new ToolRegistry()
  registry.register('run_check', defineTool({
    name: 'run_check',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    const error = new Error('command failed')
    error.code = 'COMMAND_FAILED'
    throw error
  }))
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length === 0
      ? { type: 'tool_call', name: 'run_check' }
      : { type: 'message', content: '检查命令失败，我可以换一种方式继续。' }
  })

  const result = await session.submitUserMessage('运行项目检查')

  assert.equal(result.status, 'awaiting_user')
  assert.equal(result.observations[0].status, 'failed')
  assert.equal(result.observations[0].error.code, 'COMMAND_FAILED')
  assert.equal(result.error, null)
})

test('invalid or endless planner actions fail the session with serializable events', async () => {
  const invalid = new WorkbenchSession({
    ...deterministicRuntime(),
    planner: () => ({ type: 'unsupported' })
  })
  await assert.rejects(
    invalid.submitUserMessage('开始'),
    error => error.code === 'INVALID_NEXT_ACTION'
  )
  assert.equal(invalid.snapshot().status, 'failed')

  const endless = new WorkbenchSession({
    ...deterministicRuntime(),
    maxActionsPerTurn: 2,
    planner: () => ({ type: 'tool_call', name: 'missing_tool' })
  })
  await assert.rejects(
    endless.submitUserMessage('继续调用'),
    error => error.code === 'MAX_ACTIONS_EXCEEDED'
  )
  assert.equal(endless.snapshot().observations.length, 2)
  assert.equal(endless.snapshot().status, 'failed')
  assert.doesNotThrow(() => JSON.stringify(endless.snapshot()))
  assert.doesNotThrow(() => JSON.stringify(endless.events()))
})

test('a session paused for approval can be cancelled without executing the tool', async () => {
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('external_write', defineTool({
    name: 'external_write',
    riskLevel: 'dangerous',
    approvalPolicy: 'on_danger'
  }, async () => { executions += 1 }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: () => ({ type: 'tool_call', name: 'external_write' })
  })

  await session.submitUserMessage('写入外部系统')
  assert.equal(session.cancel('用户取消任务'), true)
  assert.equal(session.snapshot().status, 'cancelled')
  assert.equal(executions, 0)
  assert.equal(session.cancel(), false)
})

test('Workbench keeps ordinary URL tool inputs intact but redacts embedded credentials', async () => {
  const calls = []
  const source = [
    'const secret = process.env.APP_SECRET',
    'const password = config.password',
    'const hardcodedToken = "ghp_1234567890abcdefghijklmnop"',
    'Docs: https://example.com/guide'
  ].join('\n')
  const registry = new ToolRegistry()
  registry.register('write_text', defineTool({
    name: 'write_text',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async input => {
    calls.push(input)
    return { content: 'OPENAI_API_KEY=sk-super-secret-value-1234567890', saved: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { ok: true } }
      : { type: 'tool_call', name: 'write_text', input: { content: source } }
  })

  const pending = await session.submitUserMessage('写入文档链接')
  await session.resolveApproval(pending.pendingApproval.id, 'approved')

  assert.equal(calls[0].content, source)
  assert.match(pending.toolCalls[0].input.content, /process\.env\.APP_SECRET/)
  assert.match(pending.toolCalls[0].input.content, /config\.password/)
  assert.doesNotMatch(pending.toolCalls[0].input.content, /ghp_1234567890/)
  assert.doesNotMatch(JSON.stringify(session.snapshot()), /super-secret|sk-super/)
  assert.match(session.snapshot().observations[0].output.content, /\[redacted\]|\[credential-redacted\]/)
})

test('Workbench text sanitizer redacts generic assignments and URI userinfo', () => {
  const sanitized = sanitizeWorkbenchValue({
    content: [
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'DATABASE_URL=postgres://admin:database-password@db.example/app',
      'https://user:basic-password@example.com/private',
      '{"password":"hunter2","client_secret":"plainsecret"}'
    ].join('\n'),
    AWS_SECRET_ACCESS_KEY: 'raw-aws-secret',
    databasePassword: 'raw-database-password',
    nested: {
      client_secret: 'raw-client-secret',
      nonsecretSetting: 'visible'
    }
  })
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, /wJalr|database-password|basic-password|hunter2|plainsecret|raw-aws-secret|raw-client-secret/)
  assert.match(sanitized.content, /AWS_SECRET_ACCESS_KEY=\[redacted\]/)
  assert.match(sanitized.content, /postgres:\/\/admin:\[redacted\]@/)
  assert.match(sanitized.content, /https:\/\/user:\[redacted\]@/)
  assert.match(sanitized.content, /"password":"\[redacted\]"/)
  assert.match(sanitized.content, /"client_secret":"\[redacted\]"/)
  assert.equal(sanitized.AWS_SECRET_ACCESS_KEY, '[redacted]')
  assert.equal(sanitized.databasePassword, '[redacted]')
  assert.equal(sanitized.nested.client_secret, '[redacted]')
  assert.equal(sanitized.nested.nonsecretSetting, 'visible')
})

test('Workbench rejects registered tools without an explicit ToolDefinition', () => {
  const registry = new ToolRegistry({ unsafe: async () => ({ ok: true }) })
  assert.throws(
    () => new WorkbenchSession({ planner: () => ({ type: 'finish' }), toolRegistry: registry }),
    error => error.code === 'WORKBENCH_TOOL_DEFINITION_REQUIRED'
  )
})
