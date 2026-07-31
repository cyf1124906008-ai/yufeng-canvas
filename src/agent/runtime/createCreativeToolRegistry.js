import { ToolRegistry } from '../core/index.js'
import { createCanvasCreativeTools } from './canvasCreativeTools.js'
import { createAnalyzeImageTool } from './analyzeImageTool.js'

export function registerCreativeTools(registry, options = {}) {
  if (!registry?.register) throw new Error('需要可注册工具的 ToolRegistry')

  const tools = createCanvasCreativeTools(options)
  for (const [name, tool] of Object.entries(tools)) {
    registry.register(name, tool)
  }
  registry.register('analyze_image', {
    metadata: {
      description: '检查真实图片结果，复算质量分数并决定采用或重做',
      capability: 'image_understanding'
    },
    execute: createAnalyzeImageTool(options)
  })
  return registry
}

export function createCreativeToolRegistry(options = {}) {
  return registerCreativeTools(options.registry || new ToolRegistry(), options)
}

export default createCreativeToolRegistry
