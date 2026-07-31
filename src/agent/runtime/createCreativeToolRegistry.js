import { ToolRegistry } from '../core/index.js'
import { createCanvasCreativeTools } from './canvasCreativeTools.js'

export function registerCreativeTools(registry, options = {}) {
  if (!registry?.register) throw new Error('需要可注册工具的 ToolRegistry')

  const tools = createCanvasCreativeTools(options)
  for (const [name, tool] of Object.entries(tools)) {
    registry.register(name, tool)
  }
  return registry
}

export function createCreativeToolRegistry(options = {}) {
  return registerCreativeTools(options.registry || new ToolRegistry(), options)
}

export default createCreativeToolRegistry
