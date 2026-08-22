import { InvariantRegistry } from '@deepseek-ai/dsh-invariants'
import * as invariantsCompanion from '@deepseek-ai/dsh-invariants/invariant'
import * as scopeCompanion from '@deepseek-ai/dsh-scope/invariant'

import { WorkbenchSession } from '../workbench/WorkbenchSession.js'
import { HARNESS_PLUGIN_IDS, HARNESS_SERVICES } from './constants.js'

function lifecycleEffect(ctx, config, id) {
  ctx.effect(() => {
    config.onActivate?.(id)
    return () => config.onDeactivate?.(id)
  }, `${id}.lifecycle`)
}

export const plannerServicePlugin = {
  name: HARNESS_PLUGIN_IDS.planner,
  apply(ctx, config) {
    lifecycleEffect(ctx, config, HARNESS_PLUGIN_IDS.planner)
    ctx.provide(HARNESS_SERVICES.plannerFactory, Object.freeze({
      create: config.create
    }))
  }
}

export const toolRegistryServicePlugin = {
  name: HARNESS_PLUGIN_IDS.tools,
  apply(ctx, config) {
    lifecycleEffect(ctx, config, HARNESS_PLUGIN_IDS.tools)
    ctx.provide(HARNESS_SERVICES.toolRegistry, Object.freeze({
      current: () => config.toolRegistry
    }))
  }
}

export const sessionFactoryServicePlugin = {
  name: HARNESS_PLUGIN_IDS.sessions,
  inject: [HARNESS_SERVICES.plannerFactory, HARNESS_SERVICES.toolRegistry],
  apply(ctx, config) {
    lifecycleEffect(ctx, config, HARNESS_PLUGIN_IDS.sessions)
    const plannerFactory = ctx.get(HARNESS_SERVICES.plannerFactory)
    const toolRegistry = ctx.get(HARNESS_SERVICES.toolRegistry)
    ctx.provide(HARNESS_SERVICES.sessionFactory, Object.freeze({
      create(options = {}) {
        const planner = plannerFactory.create()
        const session = new (config.SessionClass || WorkbenchSession)({
          ...options,
          planner,
          toolRegistry: toolRegistry.current()
        })
        return { planner, session }
      }
    }))
  }
}

export function createHarnessPluginDefinitions({
  plannerFactory,
  toolRegistry,
  SessionClass = WorkbenchSession,
  onActivate,
  onDeactivate
}) {
  const lifecycle = { onActivate, onDeactivate }
  return [
    {
      id: HARNESS_PLUGIN_IDS.invariants,
      plugin: InvariantRegistry,
      config: { enabled: true },
      inject: [],
      provides: ['invariants']
    },
    {
      id: HARNESS_PLUGIN_IDS.invariantsCompanion,
      plugin: invariantsCompanion,
      inject: ['invariants'],
      provides: []
    },
    {
      id: HARNESS_PLUGIN_IDS.scopeCompanion,
      plugin: scopeCompanion,
      inject: ['invariants'],
      provides: []
    },
    {
      id: HARNESS_PLUGIN_IDS.planner,
      plugin: plannerServicePlugin,
      config: { ...lifecycle, create: plannerFactory },
      inject: [],
      provides: [HARNESS_SERVICES.plannerFactory]
    },
    {
      id: HARNESS_PLUGIN_IDS.tools,
      plugin: toolRegistryServicePlugin,
      config: { ...lifecycle, toolRegistry },
      inject: [],
      provides: [HARNESS_SERVICES.toolRegistry]
    },
    {
      id: HARNESS_PLUGIN_IDS.sessions,
      plugin: sessionFactoryServicePlugin,
      config: { ...lifecycle, SessionClass },
      inject: [HARNESS_SERVICES.plannerFactory, HARNESS_SERVICES.toolRegistry],
      provides: [HARNESS_SERVICES.sessionFactory]
    }
  ]
}

export function createBootstrapSessionFactory({ plannerFactory, toolRegistry, SessionClass = WorkbenchSession }) {
  return Object.freeze({
    create(options = {}) {
      const planner = plannerFactory()
      const session = new SessionClass({ ...options, planner, toolRegistry })
      return { planner, session }
    }
  })
}
