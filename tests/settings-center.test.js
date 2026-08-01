import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('settings center exposes real desktop categories and integration points', async () => {
  const source = await readFile(new URL('../src/components/settings/SettingsCenter.vue', import.meta.url), 'utf8')

  for (const label of ['常规', '外观', 'Agent', '工具与权限', 'API 与模型', '自动化', '数据', '关于']) {
    assert.match(source, new RegExp(`label: '${label}'`))
  }
  assert.match(source, /<slot name="automations" \/>/)
  assert.match(source, /data-settings-slot="automation"/)
  assert.match(source, /'open-api-settings'/)
  assert.match(source, /exportUserDataToFile/)
  assert.match(source, /importUserDataFromFile/)
  assert.match(source, /backgroundMode/)
  assert.match(source, /launchAtLogin/)
  assert.match(source, /preventSleepDuringRuns/)
  assert.match(source, /workspaceRead/)
  assert.match(source, /workspaceWrite/)
  assert.match(source, /reasoningEffort/)
  assert.match(source, /settings\.setReasoningEffort\(option\.id\)/)
  assert.match(source, /不同模型支持的强度范围不同/)
  assert.match(source, /不支持所选档位时会回退/)
  assert.doesNotMatch(source, /创建虚假定时任务|尚未安装计划任务运行时/)
})

test('AgentWorkspace opens settings by category and passes reactive runtime preferences', async () => {
  const source = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')

  assert.match(source, /openSettings\('general'\)/)
  assert.match(source, /openSettings\('api'\)/)
  assert.match(source, /<settings-center/)
  assert.match(source, /@open-api-settings="showApiSettings = true"/)
  assert.match(source, /approvalMode: settings\.approvalMode/)
  assert.match(source, /toolGroups: settings\.tools/)
  assert.match(source, /maxActionsPerTurn: settings\.maxActionsPerTurn/)
  assert.match(source, /workbench\.setToolGroupEnabled\(group, enabled\)/)
  assert.match(source, /settings\.setApprovalMode\(mode\)/)
})

test('application theme and density share a single settings source', async () => {
  const [app, theme, main, css] = await Promise.all([
    readFile(new URL('../src/App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/stores/theme.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/workbench-preferences.css', import.meta.url), 'utf8')
  ])

  assert.match(app, /agentSettings\.isDark\.value/)
  assert.match(theme, /agentSettings\.isDark/)
  assert.match(main, /agentSettings\.reload\(\)/)
  assert.match(css, /\.agent-workbench\.theme-light/)
  assert.match(css, /\.agent-workbench\.density-compact/)
})
