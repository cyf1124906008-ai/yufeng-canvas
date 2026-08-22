export const DEEPSEEK_HARNESS_UPSTREAM = Object.freeze({
  name: 'DeepSeek Harness',
  repository: 'https://github.com/deepseek-ai/deepseek-harness',
  auditedCommit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
  architecture: 'Cordis embedded kernel',
  integration: 'phase-1'
})

export const DEEPSEEK_HARNESS_VERSIONS = Object.freeze({
  cordis: '4.0.1',
  scope: '0.1.1-rc.2',
  invariants: '0.1.1-rc.2'
})

export const HARNESS_SERVICES = Object.freeze({
  plannerFactory: 'dataeyesWorkbenchPlannerFactory',
  toolRegistry: 'dataeyesWorkbenchToolRegistry',
  sessionFactory: 'dataeyesWorkbenchSessionFactory'
})

export const HARNESS_PLUGIN_IDS = Object.freeze({
  invariants: 'deepseek.invariants',
  invariantsCompanion: 'deepseek.invariants.companion',
  scopeCompanion: 'deepseek.scope.companion',
  planner: 'dataeyes.planner',
  tools: 'dataeyes.tools',
  sessions: 'dataeyes.sessions'
})
