import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('composer exposes stop, guide, safe-stopping, and resume controls', async () => {
  const composer = await readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8')
  for (const copy of ['发送执行引导', '停止任务', '继续任务', '正在安全停止', '在安全检查点生效']) {
    assert.match(composer, new RegExp(copy))
  }
  assert.match(composer, /emit\(active\.value \? 'guide' : 'submit'/)
  assert.match(composer, /canResume/)
  assert.match(composer, /guidancePending/)
})

test('composer idle submit is icon-only while preserving accessible state labels', async () => {
  const composer = await readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8')

  assert.match(composer, /class="send-button"/)
  assert.match(composer, /:aria-label="canSubmit \? '运行任务' : '请输入任务后运行'"/)
  assert.match(composer, /:title="canSubmit \? '运行任务' : '请输入任务后运行'"/)
  assert.match(composer, /v-if="active \|\| stopping"/)
  assert.match(composer, /:disabled="stopping"/)
  assert.match(composer, /role="status" aria-live="polite"/)
  assert.doesNotMatch(composer, /<span>运行<\/span>/)
})

test('AgentWorkspace routes live input to guidance and stopped input to same-session resume', async () => {
  const workspace = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  assert.match(workspace, /@guide="guide"/)
  assert.match(workspace, /@resume="resumeTask"/)
  assert.match(workspace, /workbench\.guide\(normalized\)/)
  assert.match(workspace, /resumedPromise = workbench\.resume\(\)/)
  assert.match(workspace, /await workbench\.guide\(submitted\)/)
  assert.match(workspace, /workbench\.isStopping\.value/)
})

test('guidance messages are visibly distinguished in the activity feed', async () => {
  const view = await readFile(new URL('../src/components/workbench/workbenchView.js', import.meta.url), 'utf8')
  const feed = await readFile(new URL('../src/components/workbench/WorkbenchActivityFeed.vue', import.meta.url), 'utf8')
  assert.match(view, /guidance: raw\?\.guidance === true/)
  assert.match(feed, /activity\.guidance/)
  assert.match(feed, /执行引导/)
})
