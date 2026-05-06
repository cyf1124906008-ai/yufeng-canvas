<template>
  <!-- Canvas page | 画布页面 -->
  <div
    class="canvas-shell h-screen w-screen flex flex-col bg-[var(--bg-primary)]"
    :class="{ 'is-perf-lite': canvasPerfLite }"
  >
    <!-- Header | 顶部导航 -->
    <AppHeader class="canvas-header">
      <template #left>
        <button
          @click="goBack"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
        >
          <n-icon :size="20"><ChevronBackOutline /></n-icon>
        </button>
        <n-dropdown :options="projectOptions" @select="handleProjectAction">
          <button class="flex items-center gap-1 hover:bg-[var(--bg-tertiary)] px-2 py-1 rounded-lg transition-colors">
            <span class="font-medium">{{ projectName }}</span>
            <n-icon :size="16"><ChevronDownOutline /></n-icon>
          </button>
        </n-dropdown>
      </template>
      <template #right>
        <span v-if="activeRunLabel" class="live-run-chip" title="当前运行耗时">
          <i></i>
          运行中 {{ activeRunLabel }}
        </span>
        <button
          @click="startCanvasTour"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          title="使用指引"
        >
          <n-icon :size="20"><HelpCircleOutline /></n-icon>
        </button>
        <button
          @click="showRuntimeLogs = !showRuntimeLogs"
          class="relative p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          :class="{ 'text-[var(--accent-color)]': runtimeLogs.length > 0 }"
          title="运行日志"
          data-tour="runtime-logs"
        >
          <n-icon :size="20"><DocumentTextOutline /></n-icon>
          <span v-if="runtimeErrorCount" class="log-error-dot">{{ runtimeErrorCount }}</span>
        </button>
        <button
          @click="showDownloadModal = true"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          :class="{ 'text-[var(--accent-color)]': hasDownloadableAssets }"
          title="批量下载素材"
          data-tour="download-assets"
        >
          <n-icon :size="20"><DownloadOutline /></n-icon>
        </button>
        <button
          v-if="selectedImageNodeUrl"
          @click="openImageSplitter"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-emerald-400"
          title="九宫格拆图"
        >
          <n-icon :size="20"><GridOutline /></n-icon>
        </button>
        <button
          @click="showApiSettings = true"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          :class="{ 'text-[var(--accent-color)]': hasAnyApiConfigured }"
          title="API 设置"
          data-tour="canvas-settings"
        >
          <n-icon :size="20"><SettingsOutline /></n-icon>
        </button>
      </template>
    </AppHeader>

    <!-- Main canvas area | 主画布区域 -->
    <div ref="canvasAreaRef" class="flex-1 relative overflow-hidden">
      <div class="canvas-ambient one"></div>
      <div class="canvas-ambient two"></div>
      <!-- Vue Flow canvas | Vue Flow 画布 -->
      <VueFlow
        :key="flowKey"
        v-model:nodes="nodes"
        v-model:edges="edges"
        v-model:viewport="viewport"
        :node-types="nodeTypes"
        :edge-types="edgeTypes"
        :default-edge-options="defaultEdgeOptions"
        :default-viewport="canvasViewport"
        :min-zoom="0.1"
        :max-zoom="2"
        :snap-to-grid="true"
        :snap-grid="[20, 20]"
        :only-render-visible-elements="true"
        @connect="onConnect"
        @node-click="onNodeClick"
        @node-context-menu="onNodeContextMenu"
        @pane-click="onPaneClick"
        @pane-context-menu="onPaneContextMenu"
        @viewport-change="handleViewportChange"
        @edges-change="onEdgesChange"
        class="canvas-flow"
      >
        <Background v-if="showCanvasBackground" :gap="20" :size="1" />
        <MiniMap
          v-if="showMiniMap"
          position="bottom-right"
          :pannable="true"
          :zoomable="true"
          :class="['canvas-minimap', { 'is-raised': !!selectedNode }]"
          node-color="#14b8a6"
          node-stroke-color="#0f766e"
          mask-color="rgba(15, 118, 110, 0.14)"
        />
      </VueFlow>

      <!-- Left toolbar | 左侧工具栏 -->
      <aside class="canvas-toolbar absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-2 z-10" data-tour="canvas-toolbar">
        <button
          @click="openNodeMenuFromToolbar"
          class="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          title="添加节点"
          data-tour="add-node"
        >
          <n-icon :size="20"><AddOutline /></n-icon>
        </button>
        <button
          @click="showWorkflowPanel = true"
          class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors"
          title="工作流模板"
          data-tour="workflow-panel"
        >
          <n-icon :size="20"><AppsOutline /></n-icon>
        </button>
        <div class="w-full h-px bg-[var(--border-color)] my-1"></div>
        <button
          v-for="tool in tools"
          :key="tool.id"
          @click="tool.action"
          :disabled="tool.disabled && tool.disabled()"
          class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          :title="tool.name"
        >
          <n-icon :size="20"><component :is="tool.icon" /></n-icon>
        </button>
      </aside>

      <!-- Node menu popup | 节点菜单弹窗 -->
      <div
        v-if="showNodeMenu"
        class="node-menu-pop absolute z-40"
        :style="nodeMenuStyle"
        data-tour="node-menu"
      >
        <div class="node-menu-head">
          <strong>{{ nodeMenuTitle }}</strong>
          <span>搜索、分类、最近使用，像 ComfyUI 一样快速搭流程</span>
        </div>
        <input
          v-model="nodeMenuQuery"
          class="node-menu-search"
          placeholder="搜索：提示词 / 生图 / 视频 / 输出"
          @keydown.escape="showNodeMenu = false"
        />
        <div class="node-menu-tabs">
          <button
            v-for="category in nodeMenuCategories"
            :key="category.key"
            type="button"
            :class="{ active: selectedNodeCategory === category.key }"
            @click="selectedNodeCategory = category.key"
          >
            {{ category.label }}
            <span>{{ getNodeCategoryCount(category.key) }}</span>
          </button>
        </div>
        <div v-if="recentNodeTypes.length && !nodeMenuQuery.trim()" class="node-menu-section">
          <p>最近使用</p>
          <div class="recent-node-row">
            <button
              v-for="nodeType in recentNodeTypeOptions"
              :key="nodeType.type"
              type="button"
              class="recent-node-chip"
              :style="{ '--node-color': nodeType.color }"
              @click="addNewNode(nodeType.type)"
            >
              {{ nodeType.name }}
            </button>
          </div>
        </div>
        <button
          v-for="nodeType in filteredNodeTypeOptions"
          :key="nodeType.type"
          @click="addNewNode(nodeType.type)"
          class="node-menu-item"
        >
          <span class="node-menu-icon" :style="{ '--node-color': nodeType.color }">
            <n-icon :size="20"><component :is="nodeType.icon" /></n-icon>
          </span>
          <span class="node-menu-copy">
            <strong>{{ nodeType.name }}</strong>
            <small>{{ nodeType.description }}</small>
          </span>
        </button>
      </div>

      <div
        v-if="showCanvasContextMenu"
        class="canvas-context-menu absolute z-50"
        :style="canvasContextMenuStyle"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <button type="button" @click="openNodeMenuAtContext">添加节点</button>
        <button type="button" @click="pasteFromClipboard">粘贴</button>
        <button type="button" @click="autoLayoutNodes">整理布局</button>
        <button type="button" @click="fitCanvasFromContext">适应视图</button>
      </div>

      <div
        v-if="showNodeContextMenu"
        class="canvas-context-menu node-context-menu absolute z-50"
        :style="nodeContextMenuStyle"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <p>{{ contextNode?.data?.label || nodeTypeLabel(contextNode?.type) }}</p>
        <button v-if="contextNode?.data?.error" type="button" @click="retryContextNodeWithFallback">
          自动修复参数并重试
        </button>
        <button type="button" :disabled="!contextNodeCanRun" @click="runContextNode">
          {{ contextNodeCanRun ? '运行 / 重新运行' : '此节点无运行入口' }}
        </button>
        <button type="button" @click="duplicateContextNode">复制节点</button>
        <button type="button" @click="deleteContextNode">删除节点</button>
        <button type="button" @click="copyContextNodeOutput">查看 / 复制输出</button>
        <button v-if="contextNode?.type === 'image' && contextNode?.data?.url" type="button" @click="createContextImageWorkflow('image')">
          从此图继续生图
        </button>
        <button v-if="contextNode?.type === 'image' && contextNode?.data?.url" type="button" @click="createContextImageWorkflow('video')">
          从此图生成视频
        </button>
      </div>

      <!-- Bottom controls | 底部控制 -->
      <div class="zoom-dock absolute bottom-4 left-4 flex items-center gap-2 p-1" data-tour="zoom-dock">
        <!-- <button
          @click="showGrid = !showGrid"
          :class="showGrid ? 'bg-[var(--accent-color)] text-white' : 'hover:bg-[var(--bg-tertiary)]'"
          class="p-2 rounded transition-colors"
          title="切换网格"
        >
          <n-icon :size="16"><GridOutline /></n-icon>
        </button> -->
        <button
          @click="fitView({ padding: 0.2 })"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          title="适应视图"
        >
          <n-icon :size="16"><LocateOutline /></n-icon>
        </button>
        <div class="flex items-center gap-1 px-2">
          <button @click="zoomOut" class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
            <n-icon :size="14"><RemoveOutline /></n-icon>
          </button>
          <span class="text-xs min-w-[40px] text-center">{{ Math.round(viewport.zoom * 100) }}%</span>
          <button @click="zoomIn" class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
            <n-icon :size="14"><AddOutline /></n-icon>
          </button>
        </div>
      </div>

      <aside v-if="showRuntimeLogs" class="runtime-log-panel absolute right-4 top-4 z-30" data-tour="runtime-log-panel">
        <div class="runtime-log-head">
          <div>
            <p class="runtime-log-kicker">RUN LOG</p>
            <h3>运行日志</h3>
            <p v-if="activeRunLabel" class="runtime-live-line">
              {{ activeRunCount }} 个任务运行中 · 已用 {{ activeRunLabel }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button class="runtime-log-clear" @click="clearRuntimeLogs">清空</button>
            <button class="runtime-log-close" @click="showRuntimeLogs = false">×</button>
          </div>
        </div>
        <div v-if="runtimeLogs.length === 0" class="runtime-log-empty">
          暂无日志。开始生成后，请求、任务 ID、轮询和错误会显示在这里。
        </div>
        <div v-else class="runtime-log-list">
          <article
            v-for="log in runtimeLogs"
            :key="log.id"
            class="runtime-log-item"
            :class="`is-${log.level}`"
          >
            <div class="runtime-log-line">
              <div class="runtime-log-tags">
                <span class="runtime-log-level">{{ log.level }}</span>
                <span v-if="getLogDuration(log)" class="runtime-log-chip">{{ getLogDuration(log) }}</span>
                <span v-if="getLogTaskId(log)" class="runtime-log-chip is-task">Task {{ getLogTaskId(log) }}</span>
              </div>
              <time>{{ formatLogTime(log.timestamp) }}</time>
            </div>
            <p>{{ log.message }}</p>
            <pre v-if="getVisibleLogMeta(log)">{{ getVisibleLogMeta(log) }}</pre>
          </article>
        </div>
      </aside>

      <aside
        v-if="selectedNode && showInspectorPanel"
        class="node-inspector-panel absolute z-30"
        :class="{ 'is-log-open': showRuntimeLogs, 'is-collapsed': inspectorCollapsed }"
        data-tour="node-inspector"
      >
        <div class="inspector-head">
          <div>
            <p>INSPECTOR</p>
            <h3>{{ nodeTypeLabel(selectedNode.type) }}</h3>
          </div>
          <div class="inspector-head-actions">
            <span :class="['node-status-pill', selectedNodeStatus]">{{ selectedNodeStatus }}</span>
            <button class="inspector-close" :title="inspectorCollapsed ? '展开检查器' : '折叠检查器'" @click="inspectorCollapsed = !inspectorCollapsed">
              {{ inspectorCollapsed ? '▣' : '—' }}
            </button>
            <button class="inspector-close" title="关闭检查器" @click="showInspectorPanel = false">×</button>
          </div>
        </div>
        <div v-if="!inspectorCollapsed" class="inspector-body">
          <label>
            <span>节点名称</span>
            <input :value="selectedNode.data?.label || ''" @input="updateSelectedNodeField('label', $event.target.value)" />
          </label>
          <label v-if="hasNodeField('content')">
            <span>Prompt / 内容</span>
            <textarea :value="selectedNode.data?.content || selectedNode.data?.prompt || ''" @input="updateSelectedPrompt($event.target.value)"></textarea>
          </label>
          <label v-if="selectedNode.type === 'imageConfig' || selectedNode.type === 'videoConfig'">
            <span>Negative Prompt</span>
            <textarea :value="selectedNode.data?.negative_prompt || selectedNode.data?.negativePrompt || ''" @input="updateSelectedNodeField('negative_prompt', $event.target.value)"></textarea>
          </label>
          <div class="inspector-grid">
            <label>
              <span>模型</span>
              <select :value="selectedNode.data?.model || ''" @change="updateSelectedNodeField('model', $event.target.value)">
                <option value="">使用默认模型</option>
                <option
                  v-for="model in selectedNodeModelOptions"
                  :key="model.key"
                  :value="model.key"
                >
                  {{ model.label || model.key }}
                </option>
              </select>
            </label>
            <label>
              <span>尺寸 / 比例</span>
              <select :value="selectedNode.data?.size || selectedNode.data?.ratio || ''" @change="updateSelectedSize($event.target.value)">
                <option
                  v-for="option in selectedNodeSizeOptions"
                  :key="option.key"
                  :value="option.key"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label>
              <span>Seed</span>
              <input :value="selectedNode.data?.seed || ''" @input="updateSelectedNodeField('seed', $event.target.value)" />
            </label>
            <label>
              <span>状态</span>
              <select :value="selectedNodeStatus" @change="updateSelectedNodeField('status', $event.target.value)">
                <option value="idle">idle</option>
                <option value="running">running</option>
                <option value="success">success</option>
                <option value="error">error</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
            <label v-if="selectedNode.type === 'imageConfig'">
              <span>画质</span>
              <select :value="selectedNode.data?.quality || 'standard'" @change="updateSelectedNodeField('quality', $event.target.value)">
                <option value="auto">自动</option>
                <option value="standard">标准画质</option>
                <option value="hd">高清</option>
                <option value="high">高质量</option>
              </select>
            </label>
            <label v-if="selectedNode.type === 'imageConfig'">
              <span>数量</span>
              <select :value="selectedNode.data?.n || selectedNode.data?.count || 1" @change="updateSelectedCount(Number($event.target.value))">
                <option :value="1">1 张</option>
                <option :value="2">2 张</option>
                <option :value="3">3 张</option>
                <option :value="4">4 张</option>
              </select>
            </label>
            <label v-if="selectedNode.type === 'videoConfig'">
              <span>时长</span>
              <select :value="selectedNode.data?.dur || selectedNode.data?.duration || 5" @change="updateSelectedDuration(Number($event.target.value))">
                <option :value="5">5 秒</option>
                <option :value="8">8 秒</option>
                <option :value="10">10 秒</option>
              </select>
            </label>
          </div>
          <div v-if="selectedNode.data?.url" class="inspector-preview">
            <img v-if="selectedNode.type === 'image'" :src="selectedNode.data.url" alt="节点输出预览" />
            <video v-else-if="selectedNode.type === 'video'" :src="selectedNode.data.url" controls></video>
          </div>
          <div v-if="selectedNode.type === 'image' && selectedNode.data?.url" class="inspector-output-actions">
            <button class="primary" @click="createSelectedImageWorkflow('image')">用这张图继续生图</button>
            <button @click="createSelectedImageWorkflow('video')">用这张图生成视频</button>
            <button @click="copySelectedNodeOutput">复制图片链接</button>
          </div>
          <div class="inspector-actions">
            <template v-if="selectedNode.type !== 'image' || !selectedNode.data?.url">
              <button @click="markSelectedNodeRunning">运行节点</button>
              <button @click="markSelectedNodeRunning">重新运行</button>
            </template>
            <button @click="duplicateSelectedNode">复制节点</button>
            <button @click="deleteSelectedNode">删除节点</button>
            <button @click="copySelectedNodeOutput">查看输出</button>
            <button @click="saveProject">保存结果</button>
          </div>
        </div>
      </aside>

      <!-- Workspace launchers | 默认只保留小入口，避免遮挡画布 -->
      <div class="absolute left-20 top-4 z-20 flex flex-wrap gap-2">
        <button
          v-if="!showStudioCockpit"
          class="rounded-full border border-emerald-300/25 bg-slate-950/75 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-xl backdrop-blur hover:bg-slate-900"
          @click="showStudioCockpit = true"
        >
          AI 控制台
        </button>
        <button
          v-if="!showEngineWorkspace"
          class="rounded-full border border-cyan-300/25 bg-slate-950/75 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-xl backdrop-blur hover:bg-slate-900"
          @click="showEngineWorkspace = true"
        >
          云端工作流 + 短剧
        </button>
      </div>

      <!-- Studio cockpit | AI 创作工作区主控台 -->
      <section v-if="showStudioCockpit" class="studio-cockpit absolute left-20 top-14 z-20 w-[520px] max-w-[calc(100vw-8rem)] rounded-3xl border border-emerald-400/25 bg-slate-950/[0.82] text-white backdrop-blur-xl shadow-2xl overflow-hidden">
        <div class="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-transparent">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-400 text-slate-950 font-bold">Y</span>
                <div>
                  <div class="text-sm font-semibold">YUFENG AI 创作工作区</div>
                  <div class="text-[11px] text-emerald-100/75">云端模型 · AI 操控画布 · 短剧工作区</div>
                </div>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="text-[10px] px-2 py-1 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-300/30">v1.0.1</span>
              <button class="rounded-full border border-white/10 bg-white/[0.08] px-2 py-1 text-[10px] text-white/70 hover:bg-white/[0.14]" @click="showStudioCockpit = false">收起</button>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
            <div class="rounded-2xl bg-white/[0.08] px-2 py-2 border border-white/10">
              <b class="block text-base text-white">{{ studioStats.nodeCount }}</b>
              <span class="text-white/60">节点</span>
            </div>
            <div class="rounded-2xl bg-white/[0.08] px-2 py-2 border border-white/10">
              <b class="block text-base text-white">{{ studioStats.edgeCount }}</b>
              <span class="text-white/60">连线</span>
            </div>
            <div class="rounded-2xl bg-white/[0.08] px-2 py-2 border border-white/10">
              <b class="block text-base text-white">{{ studioStats.shotCount }}</b>
              <span class="text-white/60">分镜</span>
            </div>
            <div class="rounded-2xl bg-white/[0.08] px-2 py-2 border border-white/10">
              <b class="block text-base text-white">{{ studioStats.comfyCount }}</b>
              <span class="text-white/60">工作流</span>
            </div>
          </div>
        </div>

        <div class="p-3 grid grid-cols-2 gap-2">
          <button
            v-for="action in studioActions"
            :key="action.id"
            class="group text-left rounded-2xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.11] hover:border-emerald-300/40 transition-all p-3"
            @click="runStudioAction(action.id)"
          >
            <div class="flex items-center justify-between gap-2 mb-1">
              <strong class="text-sm text-white">{{ action.title }}</strong>
              <span class="text-[10px] rounded-full px-2 py-0.5 border border-emerald-300/25 text-emerald-100/80">{{ action.badge }}</span>
            </div>
            <p class="text-[11px] leading-relaxed text-white/60">{{ action.desc }}</p>
          </button>
        </div>

        <div class="px-3 pb-3 flex flex-wrap gap-2">
          <button class="px-3 py-1.5 text-xs rounded-xl bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300 transition-colors" @click="openCanvasComposer">
            自然语言操控 Ctrl/⌘ K
          </button>
          <button class="px-3 py-1.5 text-xs rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 transition-colors" @click="showWorkflowPanel = true">
            导入 / 添加工作流模板
          </button>
          <button class="px-3 py-1.5 text-xs rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 transition-colors" @click="showApiSettings = true">
            模型 API 设置
          </button>
        </div>
      </section>

      <YufengEngineWorkspace v-if="showEngineWorkspace" @action="handleEngineWorkspaceAction" @close="showEngineWorkspace = false" />

      <!-- Bottom AI composer | 底部 AI 输入：默认收起，按 Ctrl/⌘+K 呼出 -->
      <div
        class="composer-dock absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        :class="{ 'is-open': showCanvasComposer || isProcessing }"
        data-tour="canvas-composer"
      >
        <button
          v-if="!showCanvasComposer && !isProcessing"
          type="button"
          class="composer-trigger"
          title="打开 AI 输入（Ctrl/⌘ + K）"
          @click="openCanvasComposer"
        >
          <span class="composer-trigger-orb">AI</span>
          <span>AI 创作</span>
          <kbd>Ctrl K</kbd>
        </button>

        <!-- Processing indicator | 处理中指示器 -->
        <div
          v-if="isProcessing"
          class="processing-card mb-3 p-3 animate-pulse"
        >
          <div class="flex items-center gap-2 text-sm text-[var(--accent-color)] mb-2">
            <n-spin :size="14" />
            <span>正在生成提示词...</span>
          </div>
          <div v-if="currentResponse" class="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
            {{ currentResponse }}
          </div>
        </div>

        <template v-if="showCanvasComposer">
          <div class="composer-card p-3">
            <textarea
              ref="composerTextareaRef"
              v-model="chatInput"
              :placeholder="inputPlaceholder"
              :disabled="isProcessing"
              class="w-full bg-transparent resize-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] min-h-[40px] max-h-[120px] disabled:opacity-50"
              rows="1"
              @keydown.enter.exact="handleEnterKey"
              @keydown.enter.ctrl="sendMessage"
              @keydown.meta.enter="sendMessage"
              @keydown.escape.stop.prevent="closeCanvasComposer"
            />
            <div class="flex items-center justify-between mt-2">
              <div class="flex items-center gap-2">
                <button
                  @click="handlePolish"
                  :disabled="isProcessing || !chatInput.trim()"
                  class="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="AI 润色提示词"
                >
                  ✨ AI 润色
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] transition-colors"
                  title="关闭输入条（Esc）"
                  @click="closeCanvasComposer"
                >
                  收起
                </button>
              </div>
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <n-switch v-model:value="autoExecute" size="small" />
                  自动执行
                </label>
                <button
                  @click="sendMessage"
                  :disabled="isProcessing"
                  class="w-8 h-8 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <n-spin v-if="isProcessing" :size="16" />
                  <n-icon v-else :size="20" color="white"><SendOutline /></n-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- Quick suggestions | 快捷建议 -->
          <div class="canvas-suggestions flex flex-wrap items-center justify-center gap-2 mt-2">
            <span class="text-xs text-[var(--text-secondary)]">推荐：</span>
            <button
              v-for="tag in suggestions"
              :key="tag"
              @click="applyComposerSuggestion(tag)"
              class="px-2 py-0.5 text-xs rounded-full bg-[var(--bg-secondary)]/80 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors"
            >
              {{ tag }}
            </button>
            <button class="p-1 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" @click="refreshSuggestions" title="换一批">
              <n-icon :size="14"><RefreshOutline /></n-icon>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- API Settings Modal | API 设置弹窗 -->
    <ApiSettings v-model:show="showApiSettings" />

    <!-- Rename Modal | 重命名弹窗 -->
    <n-modal v-model:show="showRenameModal" preset="dialog" title="重命名项目">
      <n-input v-model:value="renameValue" placeholder="请输入项目名称" />
      <template #action>
        <n-button @click="showRenameModal = false">取消</n-button>
        <n-button type="primary" @click="confirmRename">确定</n-button>
      </template>
    </n-modal>

    <!-- Delete Confirm Modal | 删除确认弹窗 -->
    <n-modal v-model:show="showDeleteModal" preset="dialog" title="删除项目" type="warning">
      <p>确定要将项目「{{ projectName }}」移到回收站吗？30 天内可以在首页回收站恢复。</p>
      <template #action>
        <n-button @click="showDeleteModal = false">取消</n-button>
        <n-button type="error" @click="confirmDelete">移到回收站</n-button>
      </template>
    </n-modal>

    <!-- AI Command Confirm Modal | AI 命令确认弹窗 -->
    <n-modal v-model:show="showCommandConfirmModal" preset="dialog" title="AI 指令确认" type="warning">
      <p v-if="pendingCommandPlan" class="mb-2">{{ pendingCommandPlan.summary }}</p>
      <p class="text-xs text-[var(--text-secondary)]">
        共 {{ pendingCommandPlan?.commands?.length || 0 }} 条操作，包含需要确认的风险操作。
      </p>
      <template #action>
        <n-button @click="cancelCommandPlan">取消</n-button>
        <n-button type="primary" @click="confirmCommandPlan">确认执行</n-button>
      </template>
    </n-modal>

    <!-- Download Modal | 下载弹窗 -->
    <DownloadModal v-model:show="showDownloadModal" />
    <ImageSplitterModal v-model:show="showImageSplitter" :image-url="splitterImageUrl" :source-node-id="splitterSourceNodeId" />

    <!-- Workflow Panel | 工作流面板 -->
    <WorkflowPanel v-model:show="showWorkflowPanel" @add-workflow="handleAddWorkflow" />

    <GuidedTour
      v-model:show="showCanvasTour"
      :steps="canvasTourSteps"
      :storage-key="canvasTourStorageKey"
      @step-change="handleCanvasTourStep"
      @finish="completeCanvasTour"
      @skip="completeCanvasTour"
    />
  </div>
</template>

<script setup>
/**
 * Canvas view component | 画布视图组件
 * Main infinite canvas with Vue Flow integration
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, markRaw } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { NIcon, NSwitch, NDropdown, NMessageProvider, NSpin, NModal, NInput, NButton } from 'naive-ui'
import {
  ChevronBackOutline,
  ChevronDownOutline,
  SettingsOutline,
  AddOutline,
  ImageOutline,
  SendOutline,
  RefreshOutline,
  TextOutline,
  VideocamOutline,
  ColorPaletteOutline,
  BookmarkOutline,
  ArrowUndoOutline,
  ArrowRedoOutline,
  GridOutline,
  LocateOutline,
  RemoveOutline,
  DownloadOutline,
  AppsOutline,
  ChatbubbleOutline,
  DocumentTextOutline,
  HelpCircleOutline
} from '@vicons/ionicons5'
import { nodes, edges, runtimeLogs, clearRuntimeLogs, addRuntimeLog, addNode, addNodes, addEdge, addEdges, updateNode, removeNode, duplicateNode, initSampleData, loadProject, saveProject, detachCurrentProject, canvasViewport, updateViewport, undo, redo, canUndo, canRedo, manualSaveHistory, startBatchOperation, endBatchOperation } from '../stores/canvas'
import { loadAllModels } from '../stores/models'
import { useChat, useWorkflowOrchestrator } from '../hooks'
import { useModelStore } from '../stores/pinia'
import { projects, initProjectsStore, updateProject, renameProject, deleteProject, duplicateProject, currentProject, currentProjectId as projectStoreCurrentId } from '../stores/projects'
import { initTaskStore } from '../stores/tasks'

// API Settings component | API 设置组件
import ApiSettings from '../components/ApiSettings.vue'
import DownloadModal from '../components/DownloadModal.vue'
import ImageSplitterModal from '../components/ImageSplitterModal.vue'
import WorkflowPanel from '../components/WorkflowPanel.vue'
import YufengEngineWorkspace from '../components/workspace/YufengEngineWorkspace.vue'
import AppHeader from '../components/AppHeader.vue'
import GuidedTour from '../components/GuidedTour.vue'
import { CANVAS_PROMPT_SUGGESTIONS } from '../config/promptLibrary'
import { buildCanvasSnapshot, buildCanvasAgentSystemPrompt, parseAgentCommandResponse, classifyCommandRisk, buildLocalCommandPlan } from '../integrations/canvas/agentPlanner'

import { executeCommandBatch, validateCommandBatch } from '../integrations/canvas/commands'


// API Config state | API 配置状态
const modelStore = useModelStore()
const hasAnyApiConfigured = computed(() => modelStore.hasAnyApiKey)
const isChatConfigured = computed(() => !!modelStore.currentChatApiKey)

// Initialize models on page load | 页面加载时初始化模型
onMounted(() => {
  loadAllModels()
})

// Chat templates | 问答模板
const CHAT_TEMPLATES = {
  imagePrompt: {
    name: '生图提示词',
    systemPrompt: '你是一个专业的AI绘画提示词专家。将用户输入的内容美化成高质量的生图提示词，包含风格、光线、构图、细节等要素。必须保持用户原始语言：如果用户用中文输入，就用中文输出；如果用户用英文输入，就用英文输出。不要把中文翻译成英文，除非用户明确要求翻译。直接返回润色后的提示词，不要解释。',
  },
  videoPrompt: {
    name: '视频提示词',
    systemPrompt: '你是一个专业的AI视频提示词专家。将用户输入的内容美化成高质量的视频生成提示词，包含运动、场景、镜头等要素。必须保持用户原始语言：如果用户用中文输入，就用中文输出；如果用户用英文输入，就用英文输出。不要把中文翻译成英文，除非用户明确要求翻译。直接返回润色后的提示词，不要解释。',
  }
}

// Current template | 当前模板
const currentTemplate = ref('imagePrompt')

// Chat hook with image prompt template | 问答 hook
const {
  loading: chatLoading,
  status: chatStatus,
  currentResponse,
  send: sendChat
} = useChat({
  systemPrompt: CHAT_TEMPLATES.imagePrompt.systemPrompt
})

// Workflow orchestrator hook | 工作流编排 hook
const {
  isAnalyzing: workflowAnalyzing,
  isExecuting: workflowExecuting,
  currentStep: workflowStep,
  totalSteps: workflowTotalSteps,
  executionLog: workflowLog,
  analyzeIntent,
  executeWorkflow,
  createTextToImageWorkflow,
  createMultiAngleStoryboard,
  WORKFLOW_TYPES
} = useWorkflowOrchestrator()

// Custom node components | 自定义节点组件
import TextNode from '../components/nodes/TextNode.vue'
import ImageConfigNode from '../components/nodes/ImageConfigNode.vue'
import VideoNode from '../components/nodes/VideoNode.vue'
import ImageNode from '../components/nodes/ImageNode.vue'
import VideoConfigNode from '../components/nodes/VideoConfigNode.vue'
import LLMConfigNode from '../components/nodes/LLMConfigNode.vue'
import ComfyWorkflowNode from '../components/nodes/ComfyWorkflowNode.vue'
import ImageRoleEdge from '../components/edges/ImageRoleEdge.vue'
import PromptOrderEdge from '../components/edges/PromptOrderEdge.vue'
import ImageOrderEdge from '../components/edges/ImageOrderEdge.vue'

const router = useRouter()
const route = useRoute()

// Vue Flow instance | Vue Flow 实例
const { viewport, zoomIn, zoomOut, fitView, updateNodeInternals, setCenter } = useVueFlow()

// Register custom node types | 注册自定义节点类型
const nodeTypes = {
  text: markRaw(TextNode),
  imageConfig: markRaw(ImageConfigNode),
  video: markRaw(VideoNode),
  image: markRaw(ImageNode),
  videoConfig: markRaw(VideoConfigNode),
  llmConfig: markRaw(LLMConfigNode),
  comfyWorkflow: markRaw(ComfyWorkflowNode)
}

// Register custom edge types | 注册自定义边类型
const edgeTypes = {
  imageRole: markRaw(ImageRoleEdge),
  promptOrder: markRaw(PromptOrderEdge),
  imageOrder: markRaw(ImageOrderEdge)
}

const defaultEdgeOptions = {
  animated: false,
  style: {
    stroke: 'rgba(45, 212, 191, 0.92)',
    strokeWidth: 3.2
  }
}

// UI state | UI状态
const showNodeMenu = ref(false)
const showEngineWorkspace = ref(false)
const showStudioCockpit = ref(false)
const chatInput = ref('')
const autoExecute = ref(false)
const showCanvasComposer = ref(false)
const composerTextareaRef = ref(null)
const isMobile = ref(false)
const showGrid = ref(true)
const canvasPerfLite = ref(false)
const showApiSettings = ref(false)
const isProcessing = ref(false)
const nodeMenuQuery = ref('')
const canvasAreaRef = ref(null)
const nodeMenuScreenPosition = ref({ x: 80, y: 120 })
const nodeMenuCanvasPosition = ref(null)
const selectedNodeCategory = ref('all')
const recentNodeTypes = ref([])
const showCanvasContextMenu = ref(false)
const canvasContextMenuPosition = ref({ x: 0, y: 0 })
const canvasContextCanvasPosition = ref(null)
const showNodeContextMenu = ref(false)
const nodeContextMenuPosition = ref({ x: 0, y: 0 })
const contextNodeId = ref(null)

// Flow key for forcing re-render on project switch | 项目切换时强制重新渲染的 key
const flowKey = ref(Date.now())

// Modal state | 弹窗状态
const showRenameModal = ref(false)
const showDeleteModal = ref(false)
const showDownloadModal = ref(false)
const showImageSplitter = ref(false)
const splitterImageUrl = ref('')
const splitterSourceNodeId = ref('')
const showWorkflowPanel = ref(false)
const showRuntimeLogs = ref(false)
const showCanvasTour = ref(false)
const pendingCommandPlan = ref(null)
const showCommandConfirmModal = ref(false)
const showInspectorPanel = ref(true)
const inspectorCollapsed = ref(false)
const selectedNodeId = ref(null)
const renameValue = ref('')
const canvasTourStorageKey = 'yufeng-canvas-canvas-tour-v1'
const runtimeNow = ref(Date.now())
const processingStartedAt = ref(0)
let runtimeTicker = null



const studioActions = [
  {
    id: 'txt2img',
    title: '文生图工作流',
    badge: 'Native',
    desc: '创建 Prompt 节点 + 图片生成节点，并自动连线。'
  },
  {
    id: 'image2video',
    title: '图到视频链路',
    badge: 'Video',
    desc: '创建图片生成到视频生成的连续生产流程。'
  },
  {
    id: 'dramaShots',
    title: '短剧 8 分镜',
    badge: 'Drama',
    desc: '创建短剧项目结构、镜头表和 8 个首帧节点。'
  },
  {
    id: 'productLaunch',
    title: '产品发布套装',
    badge: 'Batch',
    desc: '产品图、海报、社媒、视频首帧一次搭好。'
  },
  {
    id: 'characterBible',
    title: '角色一致性',
    badge: 'IP',
    desc: '创建角色设定、三视图、表情表和视频测试节点。'
  }
]

const studioStats = computed(() => ({
  nodeCount: nodes.value.length,
  edgeCount: edges.value.length,
  comfyCount: nodes.value.filter(node => node.type === 'comfyWorkflow').length,
  shotCount: Array.isArray(currentProject.value?.drama?.shots) ? currentProject.value.drama.shots.length : 0
}))

const selectedNode = computed(() =>
  nodes.value.find((node) => node.id === selectedNodeId.value) || null
)

const contextNode = computed(() =>
  nodes.value.find((node) => node.id === contextNodeId.value) || null
)

const executableNodeTypes = new Set(['llmConfig', 'imageConfig', 'videoConfig'])

const contextNodeCanRun = computed(() =>
  executableNodeTypes.has(contextNode.value?.type)
)

const selectedNodeStatus = computed(() => {
  if (!selectedNode.value) return 'idle'
  if (selectedNode.value.data?.disabled) return 'disabled'
  if (selectedNode.value.data?.loading) return 'running'
  return selectedNode.value.data?.status || (selectedNode.value.data?.url ? 'success' : 'idle')
})

const nodeTypeLabel = (type) => ({
  text: 'Prompt Node',
  llmConfig: 'Agent Node',
  image: 'Output Node',
  imageConfig: 'Image Generation Node',
  video: 'Video Output Node',
  videoConfig: 'Video Generation Node'
}[type] || '节点')

const commonImageSizes = [
  { label: '1:1 1024x1024', key: '1024x1024' },
  { label: '4:3 1440x1080', key: '1440x1080' },
  { label: '3:4 1080x1440', key: '1080x1440' },
  { label: '16:9 1920x1080', key: '1920x1080' },
  { label: '9:16 1080x1920', key: '1080x1920' },
  { label: '2K 2048x2048', key: '2048x2048' },
  { label: '4K 4096x4096', key: '4096x4096' }
]

const commonVideoRatios = [
  { label: '16:9 横屏', key: '16:9' },
  { label: '9:16 竖屏', key: '9:16' },
  { label: '1:1 方图', key: '1:1' },
  { label: '4:3 横图', key: '4:3' },
  { label: '3:4 竖图', key: '3:4' }
]

const selectedNodeModelOptions = computed(() => {
  if (!selectedNode.value) return []
  if (selectedNode.value.type === 'videoConfig') return modelStore.allVideoModels
  if (selectedNode.value.type === 'imageConfig' || selectedNode.value.type === 'image') return modelStore.allImageModels
  if (selectedNode.value.type === 'text' || selectedNode.value.type === 'llmConfig') return modelStore.allChatModels
  return []
})

const selectedNodeSizeOptions = computed(() => {
  if (selectedNode.value?.type === 'videoConfig') return commonVideoRatios
  return commonImageSizes
})

const hasNodeField = (field) => {
  if (!selectedNode.value) return false
  return field in (selectedNode.value.data || {}) || ['text', 'imageConfig', 'videoConfig', 'llmConfig'].includes(selectedNode.value.type)
}

const updateSelectedNodeField = (field, value) => {
  if (!selectedNode.value) return
  updateNode(selectedNode.value.id, { [field]: value, updatedAt: Date.now() })
}

const updateSelectedPrompt = (value) => {
  if (!selectedNode.value) return
  const field = selectedNode.value.type === 'text' ? 'content' : 'prompt'
  updateSelectedNodeField(field, value)
}

const updateSelectedSize = (value) => {
  if (!selectedNode.value) return
  const field = selectedNode.value.type === 'videoConfig' ? 'ratio' : 'size'
  updateSelectedNodeField(field, value)
}

const updateSelectedCount = (value) => {
  if (!selectedNode.value) return
  updateSelectedNodeField('n', Number(value) || 1)
}

const updateSelectedDuration = (value) => {
  if (!selectedNode.value) return
  updateSelectedNodeField('dur', Number(value) || 5)
}

const markNodeRunning = (node) => {
  if (!node) return
  if (!executableNodeTypes.has(node.type)) {
    window.$message?.info('这个节点没有独立运行入口，可以运行它连接的生成节点。')
    return
  }

  updateNode(node.id, {
    autoExecute: true,
    status: 'running',
    loading: false,
    error: '',
    startedAt: Date.now(),
    updatedAt: Date.now()
  })
  window.$message?.info('已触发节点重新运行')
}

const markSelectedNodeRunning = () => {
  markNodeRunning(selectedNode.value)
}

const duplicateSelectedNode = () => {
  if (!selectedNode.value) return
  const id = duplicateNode(selectedNode.value.id)
  selectedNodeId.value = id || selectedNode.value.id
  window.$message?.success('已复制节点')
}

const deleteSelectedNode = () => {
  if (!selectedNode.value) return
  removeNode(selectedNode.value.id)
  selectedNodeId.value = null
  window.$message?.success('已删除节点')
}

const copyNodeOutput = async (node) => {
  if (!node) return
  const output = node.data?.url || node.data?.outputContent || node.data?.content || node.data?.prompt || ''
  try {
    await navigator.clipboard?.writeText(output)
    window.$message?.success('已复制节点输出')
  } catch {
    window.$message?.info(output || '当前节点暂无输出')
  }
}

const copySelectedNodeOutput = async () => {
  await copyNodeOutput(selectedNode.value)
}

const createSelectedImageWorkflow = (mode) => {
  const sourceNode = selectedNode.value

  if (!sourceNode || sourceNode.type !== 'image' || !sourceNode.data?.url) {
    window.$message?.warning('请先选择一张已经生成的图片')
    return
  }

  const nodeX = sourceNode.position?.x || 0
  const nodeY = sourceNode.position?.y || 0
  const isVideo = mode === 'video'

  startBatchOperation()
  const textNodeId = addNode('text', { x: nodeX + 320, y: nodeY - 120 }, {
    content: '',
    label: isVideo ? '图生视频提示词' : '图生图提示词'
  })

  const configNodeId = addNode(isVideo ? 'videoConfig' : 'imageConfig', { x: nodeX + 660, y: nodeY }, isVideo
    ? {
        label: '图生视频',
        prompt: ''
      }
    : {
        label: '图生图配置',
        prompt: '',
        size: sourceNode.data?.size || '2048x2048'
      }
  )

  addEdge({
    source: sourceNode.id,
    target: configNodeId,
    sourceHandle: 'right',
    targetHandle: 'left',
    ...(isVideo ? { type: 'imageRole', data: { imageRole: 'first_frame_image' } } : {})
  })

  addEdge({
    source: textNodeId,
    target: configNodeId,
    sourceHandle: 'right',
    targetHandle: 'left'
  })
  endBatchOperation()

  selectedNodeId.value = configNodeId
  showInspectorPanel.value = true
  window.setTimeout(() => updateNodeInternals([textNodeId, configNodeId]), 50)
  window.$message?.success(isVideo ? '已创建图生视频工作流' : '已创建图生图工作流')
}

const hasWebGLSupport = () => {
  if (typeof document === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

const detectCanvasPerfLite = () => {
  if (typeof window === 'undefined') return true

  const savedMode = localStorage.getItem('yufeng-canvas-performance-mode')
  if (savedMode === 'lite') return true
  if (savedMode === 'full') return false

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const lowCore = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4
  const largeCanvas = window.innerWidth * window.innerHeight > 2_600_000
  const weakGraphics = !hasWebGLSupport()

  if (reduceMotion) return true

  const constrainedCpuAndMemory = lowCore && lowMemory
  const constrainedGraphics = weakGraphics && (lowCore || lowMemory)
  const overloadedViewport = largeCanvas && constrainedCpuAndMemory

  return Boolean(constrainedCpuAndMemory || constrainedGraphics || overloadedViewport)
}

const canvasTourSteps = [
  {
    target: '.canvas-header',
    title: '这是当前项目的控制栏',
    body: '左侧可以返回首页、重命名或管理当前项目；右侧放着指引、日志、素材下载和模型设置。画布内所有生成问题，都优先从右侧这些入口排查。',
    side: 'bottom'
  },
  {
    target: '[data-tour="canvas-toolbar"]',
    title: '画布左侧是工具栏',
    body: '这里负责添加节点、打开公共工作流、插入文字、图片、文生图、视频生成等模块。新用户先从绿色加号或工作流按钮开始最稳。',
    side: 'right'
  },
  {
    target: '[data-tour="add-node"]',
    title: '手动添加一个节点',
    body: '点绿色加号会弹出节点菜单。适合你想自己搭流程，比如先放提示词，再连图片配置，再连结果节点。',
    side: 'right'
  },
  {
    target: '[data-tour="node-menu"]',
    title: '节点菜单怎么选',
    body: '文本节点用于写提示词；文生图配置节点用于选择图片模型、尺寸和参数；视频生成配置节点用于文生视频或图生视频；图片/视频节点用于承接结果或作为参考素材。',
    hint: '普通用户不知道从哪开始时，优先用“文生图配置”或“视频生成配置”。',
    side: 'right'
  },
  {
    target: '[data-tour="workflow-panel"]',
    title: '公共工作流一键导入',
    body: '这里是给普通用户最快上手的入口。点击模板会直接把配置好的节点放到画布上，再替换成自己的提示词或素材。',
    side: 'right'
  },
  {
    target: '[data-tour="workflow-panel-open"]',
    title: '公共工作流面板',
    body: '这里会按分类展示已经配置好的案例工作流。点任意卡片会把节点、连线和默认参数一次性放到画布，后续只需要改提示词、模型和比例。',
    hint: '这比手动添加节点更适合新手，也适合做产品演示。',
    side: 'right'
  },
  {
    target: '[data-tour="canvas-composer"]',
    title: '底部输入框会帮你搭流程',
    body: '输入一句需求后，默认会创建提示词和生成配置节点；打开“自动执行”后，会尝试分析你的意图并直接启动对应工作流。AI 润色会调用文本模型优化提示词。',
    hint: '如果用户只是想快速生成，先在这里输入一句完整需求。需要精细控制，再去节点里改比例、模型和参考图。',
    side: 'top'
  },
  {
    target: '[data-tour="runtime-logs"]',
    title: '模型请求日志在右上角',
    body: '生成失败、扣费但没返回、视频任务轮询等问题，都优先打开这里看。它会记录请求地址、模型、任务 ID、耗时和原始响应。',
    side: 'left'
  },
  {
    target: '[data-tour="runtime-log-panel"]',
    title: '日志面板怎么判断问题',
    body: '看到 SUCCESS 说明请求至少打到了供应商；看到 ERROR 要看状态码和返回信息；视频任务会显示任务 ID、轮询次数和最终地址。复制这块内容给作者，排查会快很多。',
    side: 'left'
  },
  {
    target: '[data-tour="download-assets"]',
    title: '结果素材从这里下载',
    body: '画布里有图片或视频结果后，这里会变成可用状态，用来批量导出生成素材。',
    side: 'left'
  },
  {
    target: '[data-tour="canvas-settings"]',
    title: '模型不通就回到设置',
    body: '图片、视频、文本模型可以分别配置 Key 和模型名。换供应商、换模型、排查 500 或 Network Error，都从这里开始。模型名必须和供应商后台完全一致。',
    side: 'left'
  },
  {
    target: '[data-tour="zoom-dock"]',
    title: '左下角控制画布视图',
    body: '节点多了以后，用这里缩放和适应视图。它只改变看画布的方式，不会影响你的节点和生成结果。',
    side: 'right'
  }
]

// Check if has downloadable assets | 检查是否有可下载素材
const hasDownloadableAssets = computed(() => {
  return nodes.value.some(n =>
    (n.type === 'image' || n.type === 'video') && n.data?.url
  )
})

const selectedImageNodeUrl = computed(() => {
  const selected = nodes.value.find(n => n.type === 'image' && n.data?.selected && n.data?.url)
  return selected?.data?.url || ''
})

const selectedImageNodeId = computed(() => {
  const selected = nodes.value.find(n => n.type === 'image' && n.data?.selected && n.data?.url)
  return selected?.id || ''
})

function openImageSplitter() {
  if (!selectedImageNodeUrl.value) {
    window.$message?.warning('请先选中一个图片节点')
    return
  }
  splitterImageUrl.value = selectedImageNodeUrl.value
  splitterSourceNodeId.value = selectedImageNodeId.value
  showImageSplitter.value = true
}

const showCanvasBackground = computed(() => showGrid.value && !canvasPerfLite.value)

const showMiniMap = computed(() => {
  if (isMobile.value || canvasPerfLite.value) return false
  if (showRuntimeLogs.value) return false
  return nodes.value.length <= 24
})

const runtimeErrorCount = computed(() => runtimeLogs.value.filter((log) => log.level === 'error').length)

const formatLogTime = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

const formatDuration = (durationMs) => {
  const value = Number(durationMs)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`
}

const activeRunningNodes = computed(() =>
  nodes.value.filter((node) => (node.type === 'image' || node.type === 'video') && node.data?.loading)
)

const activeRunCount = computed(() => {
  const transientTaskCount = isProcessing.value || workflowExecuting.value || workflowAnalyzing.value ? 1 : 0
  return activeRunningNodes.value.length + transientTaskCount
})

const activeRunStartedAt = computed(() => {
  const nodeStarts = activeRunningNodes.value
    .map((node) => Number(node.data?.startedAt || node.data?.createdAt || 0))
    .filter(Boolean)

  if ((isProcessing.value || workflowExecuting.value || workflowAnalyzing.value) && processingStartedAt.value) {
    nodeStarts.push(processingStartedAt.value)
  }

  return nodeStarts.length ? Math.min(...nodeStarts) : 0
})

const activeRunLabel = computed(() => {
  if (!activeRunStartedAt.value) return ''
  return formatDuration(runtimeNow.value - activeRunStartedAt.value)
})

const startRuntimeTicker = () => {
  if (runtimeTicker || typeof window === 'undefined') return

  runtimeNow.value = Date.now()
  runtimeTicker = window.setInterval(() => {
    runtimeNow.value = Date.now()
  }, 1000)
}

const stopRuntimeTicker = () => {
  if (!runtimeTicker || typeof window === 'undefined') return

  window.clearInterval(runtimeTicker)
  runtimeTicker = null
}

watch(
  [isProcessing, workflowExecuting, workflowAnalyzing],
  ([processing, executing, analyzing]) => {
    const active = processing || executing || analyzing
    if (active && !processingStartedAt.value) {
      processingStartedAt.value = Date.now()
    } else if (!active) {
      processingStartedAt.value = 0
    }
  }
)

watch(
  activeRunCount,
  (count) => {
    if (count > 0) {
      startRuntimeTicker()
    } else {
      stopRuntimeTicker()
      runtimeNow.value = Date.now()
    }
  },
  { immediate: true }
)

const getLogDuration = (log) => {
  const duration = log?.meta?.durationMs ?? log?.meta?.elapsedMs ?? log?.durationMs
  return formatDuration(duration)
}

const getLogTaskId = (log) => {
  const taskId = log?.meta?.taskId || log?.meta?.task_id || log?.meta?.id
  if (!taskId || typeof taskId !== 'string') return ''
  return taskId.length > 16 ? `${taskId.slice(0, 6)}...${taskId.slice(-6)}` : taskId
}

const getVisibleLogMeta = (log) => {
  if (!log?.meta || !Object.keys(log.meta).length) return ''
  const hiddenKeys = new Set(['durationMs', 'elapsedMs'])
  const visibleMeta = Object.fromEntries(
    Object.entries(log.meta).filter(([key]) => !hiddenKeys.has(key))
  )
  return Object.keys(visibleMeta).length ? JSON.stringify(visibleMeta, null, 2) : ''
}


// Project info | 项目信息
const projectName = computed(() => {
  const project = projects.value.find(p => p.id === route.params.id)
  return project?.name || '未命名项目'
})

// Project dropdown options | 项目下拉选项
const projectOptions = [
  { label: '重命名', key: 'rename' },
  { label: '复制', key: 'duplicate' },
  { label: '删除', key: 'delete' }
]

// Toolbar tools | 工具栏工具
const tools = [
  { id: 'text', name: '文本', icon: TextOutline, action: () => addNewNode('text') },
  { id: 'image', name: '图片', icon: ImageOutline, action: () => addNewNode('image') },
  { id: 'imageConfig', name: '文生图', icon: ColorPaletteOutline, action: () => addNewNode('imageConfig') },
  { id: 'videoConfig', name: '视频生成', icon: VideocamOutline, action: () => addNewNode('videoConfig') },
  { id: 'undo', name: '撤销', icon: ArrowUndoOutline, action: () => undo(), disabled: () => !canUndo() },
  { id: 'redo', name: '重做', icon: ArrowRedoOutline, action: () => redo(), disabled: () => !canRedo() }
]

// Node type options for menu | 节点类型菜单选项
const nodeTypeOptions = [
  { type: 'text', category: 'prompt', name: '提示词 / 文本', description: '写 Prompt、分镜、备注，可连接生图/视频节点', icon: TextOutline, color: '#38bdf8' },
  { type: 'llmConfig', category: 'agent', name: '文本模型', description: '让语言模型润色提示词、拆方向、生成文案', icon: ChatbubbleOutline, color: '#a78bfa' },
  { type: 'imageConfig', category: 'generate', name: '图片生成', description: '文生图 / 图生图配置，支持模型、比例、数量参数', icon: ColorPaletteOutline, color: '#22c55e' },
  { type: 'videoConfig', category: 'generate', name: '视频生成', description: '文生视频 / 图生视频，支持首帧、尾帧、比例、时长', icon: VideocamOutline, color: '#f59e0b' },
  { type: 'image', category: 'output', name: '图片输出 / 参考图', description: '承载生成结果或参考图，可继续图生图/图生视频', icon: ImageOutline, color: '#8b5cf6' },
  { type: 'video', category: 'output', name: '视频输出', description: '承载视频结果，支持预览、下载、继续编排', icon: VideocamOutline, color: '#ef4444' }
]

const nodeMenuCategories = [
  { key: 'all', label: '全部' },
  { key: 'prompt', label: '提示词' },
  { key: 'generate', label: '生成' },
  { key: 'output', label: '输出' },
  { key: 'agent', label: 'Agent' }
]

const nodeMenuTitle = computed(() => nodeMenuCanvasPosition.value ? '在这里添加节点' : '添加节点')

const nodeMenuStyle = computed(() => ({
  left: `${nodeMenuScreenPosition.value.x}px`,
  top: `${nodeMenuScreenPosition.value.y}px`
}))

const canvasContextMenuStyle = computed(() => ({
  left: `${canvasContextMenuPosition.value.x}px`,
  top: `${canvasContextMenuPosition.value.y}px`
}))

const nodeContextMenuStyle = computed(() => ({
  left: `${nodeContextMenuPosition.value.x}px`,
  top: `${nodeContextMenuPosition.value.y}px`
}))

const getNodeCategoryCount = (category) => {
  if (category === 'all') return nodeTypeOptions.length
  return nodeTypeOptions.filter((nodeType) => nodeType.category === category).length
}

const recentNodeTypeOptions = computed(() =>
  recentNodeTypes.value
    .map((type) => nodeTypeOptions.find((nodeType) => nodeType.type === type))
    .filter(Boolean)
)

const filteredNodeTypeOptions = computed(() => {
  const query = nodeMenuQuery.value.trim().toLowerCase()
  const category = selectedNodeCategory.value
  const scopedOptions = category === 'all'
    ? nodeTypeOptions
    : nodeTypeOptions.filter((nodeType) => nodeType.category === category)

  if (!query) return scopedOptions

  return scopedOptions.filter((nodeType) => {
    return `${nodeType.name} ${nodeType.description} ${nodeType.type}`.toLowerCase().includes(query)
  })
})

// Input placeholder | 输入占位符
const inputPlaceholder = '你可以试着说"帮我生成一个二次元的卡通角色"'

// Quick suggestions | 快捷建议
const legacySuggestions = CANVAS_PROMPT_SUGGESTIONS.slice(0, 4)

// Add new node | 添加新节点
const suggestionPool = CANVAS_PROMPT_SUGGESTIONS

const suggestions = ref([])

const refreshSuggestions = () => {
  suggestions.value = [...suggestionPool].sort(() => Math.random() - 0.5).slice(0, 5)
}

const focusCanvasComposer = () => {
  nextTick(() => {
    composerTextareaRef.value?.focus?.()
  })
}

const openCanvasComposer = () => {
  showCanvasComposer.value = true
  focusCanvasComposer()
}

const closeCanvasComposer = () => {
  showCanvasComposer.value = false
}

const toggleCanvasComposer = () => {
  showCanvasComposer.value = !showCanvasComposer.value
  if (showCanvasComposer.value) {
    focusCanvasComposer()
  }
}

const applyComposerSuggestion = (tag) => {
  chatInput.value = tag
  openCanvasComposer()
}

const isEditableShortcutTarget = (target) => {
  if (!target) return false
  const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement
  if (!element) return false
  const tagName = element.tagName?.toLowerCase?.()
  return ['input', 'textarea', 'select'].includes(tagName)
    || element.isContentEditable
    || !!element.closest?.('[contenteditable="true"], input, textarea, select')
}

const handleCanvasKeydown = (event) => {
  if (isEditableShortcutTarget(event.target)) return

  const key = event.key?.toLowerCase?.()
  if ((event.ctrlKey || event.metaKey) && key === 'k') {
    event.preventDefault()
    toggleCanvasComposer()
    return
  }

  if (event.key === 'Escape') {
    if (showNodeContextMenu.value) {
      showNodeContextMenu.value = false
      event.preventDefault()
      return
    }
    if (showCanvasContextMenu.value) {
      showCanvasContextMenu.value = false
      event.preventDefault()
      return
    }
    if (showNodeMenu.value) {
      showNodeMenu.value = false
      event.preventDefault()
      return
    }
    if (showCanvasComposer.value) {
      closeCanvasComposer()
      event.preventDefault()
    }
  }
}

const clampMenuPosition = (clientX, clientY, width = 340, height = 460) => {
  const padding = 12
  const rect = canvasAreaRef.value?.getBoundingClientRect?.()
  const maxWidth = rect?.width || window.innerWidth
  const maxHeight = rect?.height || window.innerHeight
  return {
    x: Math.min(Math.max(clientX, padding), maxWidth - width - padding),
    y: Math.min(Math.max(clientY, padding), maxHeight - height - padding)
  }
}

const clientToCanvasPanelPoint = (clientX, clientY) => {
  const rect = canvasAreaRef.value?.getBoundingClientRect?.()
  return {
    x: clientX - (rect?.left || 0),
    y: clientY - (rect?.top || 0)
  }
}

const screenToCanvasPosition = (clientX, clientY) => {
  const rect = canvasAreaRef.value?.getBoundingClientRect?.()
  const offsetX = rect ? clientX - rect.left : clientX
  const offsetY = rect ? clientY - rect.top : clientY

  return {
    x: (offsetX - viewport.value.x) / viewport.value.zoom,
    y: (offsetY - viewport.value.y) / viewport.value.zoom
  }
}

const getViewportCenterPosition = () => {
  const rect = canvasAreaRef.value?.getBoundingClientRect?.()
  const centerX = (rect?.left || 0) + (rect?.width || window.innerWidth) / 2
  const centerY = (rect?.top || 0) + (rect?.height || window.innerHeight) / 2
  return screenToCanvasPosition(centerX, centerY)
}

const rememberNodeType = (type) => {
  recentNodeTypes.value = [type, ...recentNodeTypes.value.filter((item) => item !== type)].slice(0, 4)
  try {
    localStorage.setItem('yufeng-canvas-recent-node-types', JSON.stringify(recentNodeTypes.value))
  } catch {
    // Recent nodes are a UI convenience only.
  }
}

const openNodeMenu = ({ clientX, clientY, canvasPosition = null } = {}) => {
  const fallback = clampMenuPosition(80, window.innerHeight / 2 - 220)
  const panelPoint = clientX == null || clientY == null ? null : clientToCanvasPanelPoint(clientX, clientY)
  nodeMenuScreenPosition.value = !panelPoint
    ? fallback
    : clampMenuPosition(panelPoint.x, panelPoint.y)
  nodeMenuCanvasPosition.value = canvasPosition
  showNodeMenu.value = true
  showCanvasContextMenu.value = false
  showNodeContextMenu.value = false
}

const openNodeMenuFromToolbar = (event) => {
  if (showNodeMenu.value && !nodeMenuCanvasPosition.value) {
    showNodeMenu.value = false
    return
  }

  openNodeMenu({
    clientX: 80,
    clientY: Math.max(96, Math.min(window.innerHeight - 480, event?.clientY ? event.clientY - 40 : window.innerHeight / 2 - 220)),
    canvasPosition: null
  })
}

const addNewNode = async (type, position = nodeMenuCanvasPosition.value) => {
  const targetPosition = position || getViewportCenterPosition()
  const normalizedPosition = {
    x: Math.round(targetPosition.x - 120),
    y: Math.round(targetPosition.y - 80)
  }

  // Add node at chosen viewport/pointer position | 在鼠标或视口位置添加节点
  const nodeId = addNode(type, normalizedPosition)

  // Set highest z-index | 设置最高层级
  const maxZIndex = Math.max(0, ...nodes.value.map(n => n.zIndex || 0))
  nodes.value = nodes.value.map((node) => node.id === nodeId ? { ...node, zIndex: maxZIndex + 1 } : node)

  // Force Vue Flow to recalculate node dimensions | 强制 Vue Flow 重新计算节点尺寸
  setTimeout(() => {
    updateNodeInternals(nodeId)
  }, 50)

  showNodeMenu.value = false
  showCanvasContextMenu.value = false
  nodeMenuQuery.value = ''
  nodeMenuCanvasPosition.value = null
  selectedNodeId.value = nodeId
  showInspectorPanel.value = true
  inspectorCollapsed.value = false
  rememberNodeType(type)
}

const onPaneContextMenu = (event) => {
  const nativeEvent = event?.event || event
  if (!nativeEvent) return
  nativeEvent.preventDefault?.()
  nativeEvent.stopPropagation?.()
  const panelPoint = clientToCanvasPanelPoint(nativeEvent.clientX, nativeEvent.clientY)
  const position = clampMenuPosition(panelPoint.x, panelPoint.y, 190, 190)
  canvasContextMenuPosition.value = position
  canvasContextCanvasPosition.value = screenToCanvasPosition(nativeEvent.clientX, nativeEvent.clientY)
  showCanvasContextMenu.value = true
  showNodeContextMenu.value = false
  showNodeMenu.value = false
}

const onNodeContextMenu = (event) => {
  const nativeEvent = event?.event || event
  const node = event?.node
  if (!nativeEvent || !node) return
  nativeEvent.preventDefault?.()
  nativeEvent.stopPropagation?.()
  contextNodeId.value = node.id
  selectedNodeId.value = node.id
  const panelPoint = clientToCanvasPanelPoint(nativeEvent.clientX, nativeEvent.clientY)
  const position = clampMenuPosition(panelPoint.x, panelPoint.y, 220, 280)
  nodeContextMenuPosition.value = position
  showNodeContextMenu.value = true
  showCanvasContextMenu.value = false
  showNodeMenu.value = false
}

const openNodeMenuAtContext = () => {
  nodeMenuScreenPosition.value = clampMenuPosition(canvasContextMenuPosition.value.x, canvasContextMenuPosition.value.y)
  nodeMenuCanvasPosition.value = canvasContextCanvasPosition.value
  showNodeMenu.value = true
  showCanvasContextMenu.value = false
  showNodeContextMenu.value = false
}

const fitCanvasFromContext = () => {
  fitView({ padding: 0.2 })
  showCanvasContextMenu.value = false
}

const pasteFromClipboard = async () => {
  showCanvasContextMenu.value = false
  try {
    const text = await navigator.clipboard?.readText?.()
    if (!text?.trim()) {
      window.$message?.info('剪贴板没有可粘贴的文本')
      return
    }
    const nodeId = addNode('text', canvasContextCanvasPosition.value || getViewportCenterPosition(), {
      content: text,
      label: '粘贴文本'
    })
    selectedNodeId.value = nodeId
    showInspectorPanel.value = true
    window.setTimeout(() => updateNodeInternals(nodeId), 50)
  } catch {
    window.$message?.warning('无法读取剪贴板')
  }
}

const autoLayoutNodes = () => {
  showCanvasContextMenu.value = false
  if (!nodes.value.length) return
  const columns = 3
  nodes.value = nodes.value.map((node, index) => ({
    ...node,
    position: {
      x: 80 + (index % columns) * 380,
      y: 80 + Math.floor(index / columns) * 260
    },
    data: {
      ...node.data,
      updatedAt: Date.now()
    }
  }))
  window.$message?.success('已整理节点布局')
  nextTick(() => fitView({ padding: 0.2 }))
}

const runContextNode = () => {
  if (!contextNode.value) return
  markNodeRunning(contextNode.value)
  showNodeContextMenu.value = false
}

const duplicateContextNode = () => {
  if (!contextNode.value) return
  const id = duplicateNode(contextNode.value.id)
  selectedNodeId.value = id || contextNode.value.id
  showNodeContextMenu.value = false
  window.$message?.success('已复制节点')
}

const deleteContextNode = () => {
  if (!contextNode.value) return
  removeNode(contextNode.value.id)
  selectedNodeId.value = null
  showNodeContextMenu.value = false
  window.$message?.success('已删除节点')
}

const retryContextNodeWithFallback = () => {
  if (!contextNode.value) return
  const node = contextNode.value
  showNodeContextMenu.value = false

  // Clear error state and mark for auto-retry
  updateNode(node.id, {
    error: '',
    loading: false,
    status: 'idle',
    updatedAt: Date.now()
  })

  // Find the connected config node and trigger its run
  const configEdge = edges.value.find((e) => e.target === node.id || e.source === node.id)
  if (!configEdge) {
    markNodeRunning(node)
    return
  }

  const configNodeId = node.type === 'image' || node.type === 'video'
    ? edges.value
        .filter((e) => e.target === node.id || (e.target === node.type + 'Config' && e.source === node.id))
        .map((e) => nodes.value.find((n) => n.id === e.source || n.id === e.target))
        .find((n) => n && (n.type === 'imageConfig' || n.type === 'videoConfig'))
    : null

  if (configNodeId) {
    markNodeRunning(configNodeId)
  } else {
    markNodeRunning(node)
  }

  window.$message?.info('已清除错误状态，请通过配置节点重新运行。')
}

const copyContextNodeOutput = async () => {
  if (!contextNode.value) return
  selectedNodeId.value = contextNode.value.id
  await copyNodeOutput(contextNode.value)
  showNodeContextMenu.value = false
}

const createContextImageWorkflow = (mode) => {
  if (!contextNode.value) return
  selectedNodeId.value = contextNode.value.id
  createSelectedImageWorkflow(mode)
  showNodeContextMenu.value = false
}

// Handle add workflow from panel | 处理从面板添加工作流
const handleAddWorkflow = ({ workflow, options }) => {
  // Calculate viewport center position | 计算视口中心位置
  const viewportCenterX = -viewport.value.x / viewport.value.zoom + (window.innerWidth / 2) / viewport.value.zoom
  const viewportCenterY = -viewport.value.y / viewport.value.zoom + (window.innerHeight / 2) / viewport.value.zoom

  // Create nodes from workflow template | 从工作流模板创建节点
  const startPosition = { x: viewportCenterX - 300, y: viewportCenterY - 200 }
  const { nodes: newNodes, edges: newEdges } = workflow.createNodes(startPosition, options)

  // Start batch operation manually | 手动开始批量操作
  startBatchOperation()

  // Add nodes to canvas in batch | 批量将节点添加到画布
  const nodeSpecs = newNodes.map(node => ({
    type: node.type,
    position: node.position,
    data: node.data
  }))
  const nodeIds = addNodes(nodeSpecs, false)

  // Map old node IDs to new IDs | 映射旧节点ID到新ID
  const idMap = {}
  newNodes.forEach((node, index) => {
    idMap[node.id] = nodeIds[index]
  })

  // Add edges to canvas in batch | 批量将边添加到画布
  const edgeSpecs = newEdges.map(edge => ({
    source: idMap[edge.source] || edge.source,
    target: idMap[edge.target] || edge.target,
    sourceHandle: edge.sourceHandle || 'right',
    targetHandle: edge.targetHandle || 'left',
    type: edge.type,
    data: edge.data
  }))

  // Add edges (autoBatch=false to use manual batch) | 添加边（autoBatch=false 以使用手动批量）
  addEdges(edgeSpecs, false)

  // End batch operation and save to history | 结束批量操作并保存到历史
  endBatchOperation()

  // Delay node internals update | 延迟节点内部更新
  setTimeout(() => {
    // Update node internals | 更新节点内部
    nodeIds.forEach(nodeId => {
      updateNodeInternals(nodeId)
    })
  }, 100)

  window.$message?.success(`已添加工作流: ${workflow.name}`)
}

// Handle connection | 处理连接
const onConnect = (params) => {
  // Check connection types | 检查连接类型
  const sourceNode = nodes.value.find(n => n.id === params.source)
  const targetNode = nodes.value.find(n => n.id === params.target)

  if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
    window.$message?.warning('不能连接到同一个节点')
    return
  }

  if (sourceNode?.type === 'image' && targetNode?.type === 'videoConfig') {
    // Use imageRole edge type | 使用图片角色边类型
    addEdge({
      ...params,
      type: 'imageRole',
      data: { imageRole: 'first_frame_image', edgeKind: 'image-role' } // Default to first frame | 默认首帧
    })
  } else if (sourceNode?.type === 'text' && (targetNode?.type === 'imageConfig' || targetNode?.type === 'videoConfig')) {
    // Use promptOrder edge type | 使用提示词顺序边类型
    // Calculate next order number | 计算下一个顺序号
    const existingTextEdges = edges.value.filter(e =>
      e.target === params.target && e.type === 'promptOrder'
    )
    const nextOrder = existingTextEdges.length + 1

    addEdge({
      ...params,
      type: 'promptOrder',
      data: { promptOrder: nextOrder, edgeKind: 'prompt' }
    })
  } else if (sourceNode?.type === 'image' && targetNode?.type === 'imageConfig') {
    // Use imageOrder edge type | 使用图片顺序边类型
    // Calculate next order number | 计算下一个顺序号
    const existingImageEdges = edges.value.filter(e =>
      e.target === params.target && e.type === 'imageOrder'
    )

    // Get @ mentioned image count from connected TextNodes | 获取已连接 TextNode 中 @ 提及的图片数量
    let mentionedImageCount = 0
    const connectedTextEdges = edges.value.filter(e => e.target === params.target)
    for (const edge of connectedTextEdges) {
      const sourceNode = nodes.value.find(n => n.id === edge.source)
      if (sourceNode?.type === 'text') {
        const content = sourceNode.data?.content || ''
        // Count @ mentions of image nodes | 统计图片节点的 @ 提及
        const mentionRegex = /@\[([^\]|]+)(?:\|([^\]]+))?\]/g
        let match
        while ((match = mentionRegex.exec(content)) !== null) {
          const mentionedNode = nodes.value.find(n => n.id === match[1])
          if (mentionedNode?.type === 'image') {
            mentionedImageCount++
          }
        }
      }
    }

    // Next order = existing edges + mentioned image count + 1 | 下一个序号 = 现有边数 + @提及图片数 + 1
    const nextOrder = existingImageEdges.length + mentionedImageCount + 1

    addEdge({
      ...params,
      type: 'imageOrder',
      data: { imageOrder: nextOrder, edgeKind: 'image-reference' }
    })
  } else if (sourceNode?.type === 'llmConfig' && targetNode?.type === 'imageConfig') {
    // LLM output as prompt for image generation | LLM 输出作为图片生成提示词
    const existingTextEdges = edges.value.filter(e =>
      e.target === params.target && e.type === 'promptOrder'
    )
    const nextOrder = existingTextEdges.length + 1

    addEdge({
      ...params,
      type: 'promptOrder',
      data: { promptOrder: nextOrder, edgeKind: 'prompt' }
    })
  } else if (sourceNode?.type === 'llmConfig' && targetNode?.type === 'videoConfig') {
    // LLM output as prompt for video generation | LLM 输出作为视频生成提示词
    addEdge({
      ...params,
      type: 'promptOrder',
      data: { promptOrder: 1, edgeKind: 'prompt' }
    })
  } else {
    addEdge(params)
  }
}
const onNodeClick = (event) => {
  selectedNodeId.value = event.node?.id || null
  if (selectedNodeId.value) {
    showInspectorPanel.value = true
  }
  // nodes.value.forEach(node => {
  //   updateNode(node.id, { selected: false })
  // })

  // // Select clicked node | 选中的节点
  // const clickedNode = nodes.value.find(n => n.id === event.node.id)
  // if (clickedNode) {
  //   updateNode(event.node.id, { selected: true })
  // }
}

// Handle viewport change | 处理视口变化
const handleViewportChange = (newViewport) => {
  updateViewport(newViewport)
}

// Handle edges change | 处理边变化
const onEdgesChange = (changes) => {
  // Check if any edge is being removed | 检查是否有边被删除
  const hasRemoval = changes.some(change => change.type === 'remove')

  if (hasRemoval) {
    // Trigger history save after edge removal | 边删除后触发历史保存
    nextTick(() => {
      manualSaveHistory()
    })
  }
}

// Handle pane click | 处理画布点击
const onPaneClick = () => {
  showNodeMenu.value = false
  showCanvasContextMenu.value = false
  showNodeContextMenu.value = false
  selectedNodeId.value = null
  // Clear all selections | 清除所有选中
  // nodes.value = nodes.value.map(node => ({
  //   ...node,
  //   selected: false
  // }))
}

// Handle project action | 处理项目操作
const handleProjectAction = (key) => {
  switch (key) {
    case 'rename':
      renameValue.value = projectName.value
      showRenameModal.value = true
      break
    case 'duplicate':
      duplicateCurrentProject()
      break
    case 'delete':
      showDeleteModal.value = true
      break
  }
}

// Confirm rename | 确认重命名
const confirmRename = () => {
  const projectId = route.params.id
  if (renameValue.value.trim()) {
    renameProject(projectId, renameValue.value.trim())
    window.$message?.success('已重命名')
  }
  showRenameModal.value = false
}

// Confirm delete | 确认删除
const confirmDelete = () => {
  const projectId = route.params.id
  if (!projectId || projectId === 'new') {
    detachCurrentProject()
    showDeleteModal.value = false
    window.$message?.success('未保存画布已清空')
    router.push({ path: '/', query: { section: 'projects' } })
    return
  }

  saveProject()
  const deleted = deleteProject(projectId)
  showDeleteModal.value = false
  if (deleted) {
    detachCurrentProject()
    window.$message?.success('已移到回收站，可在 30 天内恢复')
  } else {
    window.$message?.warning('项目不存在或已被删除')
  }
  router.push({ path: '/', query: { section: 'projects' } })
}

const confirmCommandPlan = () => {
  const plan = pendingCommandPlan.value
  if (!plan) return
  const batchErr = validateCommandBatch(plan.commands)
  if (batchErr) {
    window.$message?.error(batchErr.message)
    addRuntimeLog('error', `AI 指令确认前校验失败: ${batchErr.message}`, { commands: plan.commands })
    showCommandConfirmModal.value = false
    pendingCommandPlan.value = null
    return
  }
  const result = executeCommandBatch(plan.commands)
  if (result.ok) {
    addRuntimeLog('info', `AI 已执行: ${plan.summary}`, { commands: plan.commands })
    window.$message?.success(plan.summary)
  } else {
    addRuntimeLog('error', `AI 执行失败: ${result.message}`)
    window.$message?.error(result.message)
  }
  showCommandConfirmModal.value = false
  pendingCommandPlan.value = null
}

const cancelCommandPlan = () => {
  showCommandConfirmModal.value = false
  pendingCommandPlan.value = null
}

const executeCanvasCommandPlan = (plan) => {
  const batchErr = validateCommandBatch(plan.commands)
  if (batchErr) {
    window.$message?.error(batchErr.message)
    addRuntimeLog('error', `AI 指令校验失败: ${batchErr.message}`, { commands: plan.commands })
    return false
  }

  const { needsConfirm } = classifyCommandRisk(plan.commands)
  if (needsConfirm) {
    pendingCommandPlan.value = plan
    showCommandConfirmModal.value = true
    return true
  }

  const result = executeCommandBatch(plan.commands)
  if (result.ok) {
    addRuntimeLog('info', `AI 已执行: ${plan.summary}`, { commands: plan.commands, nodeIds: result.nodeIds, edgeIds: result.edgeIds })
    window.$message?.success(plan.summary)
    return true
  }

  addRuntimeLog('error', `AI 执行失败: ${result.message}`, { commands: plan.commands })
  window.$message?.error(result.message)
  return false
}


const makeStudioNodePlan = (summary, commands) => ({
  summary,
  commands,
  requiresConfirmation: false
})

const runStudioAction = (actionId) => {
  const snapshot = buildCanvasSnapshot()
  const y = snapshot.nodes.length
    ? Math.max(...snapshot.nodes.map(node => Number(node.position?.y) || 0)) + 240
    : 180

  const actionPlans = {
    txt2img: makeStudioNodePlan('已创建文生图工作流', [
      { name: 'addNode', params: { ref: 'prompt', type: 'text', position: { x: 120, y }, data: { label: '创作需求', content: '描述你想生成的照片、海报、角色或场景。' } } },
      { name: 'addNode', params: { ref: 'image', type: 'imageConfig', position: { x: 520, y }, data: { label: '文生图', prompt: '高质量视觉作品，主体清晰，构图明确，光影自然，细节丰富', size: '1024x1024', quality: 'high' } } },
      { name: 'connectNodes', params: { source: 'prompt', target: 'image' } }
    ]),
    image2video: makeStudioNodePlan('已创建图到视频生产链路', [
      { name: 'addNode', params: { ref: 'prompt', type: 'text', position: { x: 120, y }, data: { label: '镜头描述', content: '先生成首帧，再用首帧驱动视频。写清主体、镜头运动、氛围和时长。' } } },
      { name: 'addNode', params: { ref: 'image', type: 'imageConfig', position: { x: 500, y }, data: { label: '首帧生成', prompt: '电影感首帧，主体清晰，构图明确，适合视频延展', size: '1920x1080', quality: 'high' } } },
      { name: 'addNode', params: { ref: 'video', type: 'videoConfig', position: { x: 880, y }, data: { label: '图生视频', prompt: '自然镜头运动，画面稳定，保持主体一致性', ratio: '16:9', duration: 5 } } },
      { name: 'connectNodes', params: { source: 'prompt', target: 'image' } },
      { name: 'connectNodes', params: { source: 'image', target: 'video' } }
    ]),
    productLaunch: makeStudioNodePlan('已创建产品发布全套物料工作流', [
      { name: 'addNode', params: { ref: 'brief', type: 'text', position: { x: 120, y }, data: { label: '产品 Brief', content: '产品名称、卖点、人群、使用场景、品牌色、投放平台。' } } },
      { name: 'addNode', params: { ref: 'packshot', type: 'imageConfig', position: { x: 500, y }, data: { label: '产品主图', prompt: '商业产品摄影，干净背景，质感真实，适合电商主图', size: '1024x1024', quality: 'high' } } },
      { name: 'addNode', params: { ref: 'poster', type: 'imageConfig', position: { x: 880, y }, data: { label: '广告海报', prompt: '品牌广告海报，标题区清晰，产品突出，高级排版', size: '1080x1920', quality: 'high' } } },
      { name: 'addNode', params: { ref: 'tvc', type: 'videoConfig', position: { x: 1260, y }, data: { label: 'TVC 首帧到视频', prompt: '产品广告短片，镜头推进，光影高级，节奏明确', ratio: '9:16', duration: 5 } } },
      { name: 'connectNodes', params: { source: 'brief', target: 'packshot' } },
      { name: 'connectNodes', params: { source: 'packshot', target: 'poster' } },
      { name: 'connectNodes', params: { source: 'poster', target: 'tvc' } }
    ]),
    characterBible: makeStudioNodePlan('已创建角色库和一致性工作流', [
      { name: 'createCharacterBible', params: {} }
    ])
  }

  if (actionId === 'dramaShots') {
    runCanvasQuickAction('创建一个古装短剧第一集，生成8个分镜、角色设定、场景设定、首帧节点和视频节点')
    return
  }

  const plan = actionPlans[actionId]
  if (!plan) return
  const executed = executeCanvasCommandPlan(plan)
  if (executed) nextTick(() => fitView({ padding: 0.18, duration: 500 }))
}

const focusCanvasNodeById = (nodeId) => {
  const node = nodes.value.find(item => item.id === nodeId)
  if (!node) {
    window.$message?.warning('没有找到对应画布节点')
    return
  }
  selectedNodeId.value = node.id
  nextTick(() => {
    if (typeof setCenter === 'function') {
      setCenter((node.position?.x || 0) + 180, (node.position?.y || 0) + 100, { zoom: Math.max(viewport.value.zoom || 0.8, 0.75), duration: 500 })
    } else {
      fitView({ padding: 0.25, duration: 500 })
    }
  })
}

const updateDramaShotStatus = ({ shotId, status }) => {
  const project = currentProject.value
  if (!project?.drama?.shots?.length) {
    window.$message?.warning('当前项目没有镜头表')
    return
  }
  const allowed = new Set(['pending', 'firstFrameReady', 'videoRunning', 'videoReady', 'redo', 'locked'])
  if (!allowed.has(status)) {
    window.$message?.warning('不支持的镜头状态')
    return
  }
  const shots = project.drama.shots.map(shot => shot.id === shotId ? { ...shot, status, updatedAt: Date.now() } : shot)
  updateProject(project.id, { drama: { ...(project.drama || {}), shots } })
  const shot = shots.find(item => item.id === shotId)
  const nodeId = shot?.nodeIds?.text
  if (nodeId) updateNode(nodeId, { shotStatus: status, updatedAt: Date.now() })
  window.$message?.success('镜头状态已更新')
}

const handleEngineWorkspaceAction = (action, payload) => {
  if (action === 'openCloudModelSettings' || action === 'openComfySettings') {
    showApiSettings.value = true
    return
  }

  if (action === 'openWorkflowImport') {
    showWorkflowPanel.value = true
    return
  }

  if (action === 'focusNode') {
    focusCanvasNodeById(payload)
    return
  }

  if (action === 'updateDramaShotStatus') {
    updateDramaShotStatus(payload || {})
    return
  }

  if (action === 'createDramaWorkspace') {
    const plan = makeStudioNodePlan('已创建短剧工作区', [
      { name: 'createDramaProject', params: { title: 'AI 短剧项目', premise: '一个可继续扩展的 YUFENG 短剧项目。' } },
      { name: 'createCharacterBible', params: {} },
      { name: 'createSceneBible', params: {} },
      { name: 'createEpisodeOutline', params: {} }
    ])
    const executed = executeCanvasCommandPlan(plan)
    if (executed) nextTick(() => fitView({ padding: 0.18, duration: 500 }))
    return
  }

  if (action === 'createDramaShots') {
    runCanvasQuickAction('创建一个都市悬疑短剧第一集，生成8个分镜、角色设定、场景设定、首帧节点和视频节点')
    return
  }

  if (action === 'createCharacterBible') {
    runStudioAction('characterBible')
  }
}

const runCanvasQuickAction = (prompt) => {
  const plan = buildLocalCommandPlan(prompt, buildCanvasSnapshot())
  if (!plan) {
    chatInput.value = prompt
    openCanvasComposer()
    return
  }
  const executed = executeCanvasCommandPlan(plan)
  if (executed) nextTick(() => fitView({ padding: 0.18, duration: 500 }))
}

const handleInitialCanvasAction = (rawAction) => {
  let action = rawAction
  try {
    const parsed = JSON.parse(rawAction)
    action = parsed?.action || rawAction
  } catch {
    action = rawAction
  }

  const allowed = new Set(['dramaShots', 'productLaunch', 'image2video', 'txt2img', 'characterBible'])
  if (!allowed.has(action)) return

  runStudioAction(action)
  showStudioCockpit.value = false
  showEngineWorkspace.value = false
  window.$message?.success('已在画布创建可执行生产线')
}

const duplicateCurrentProject = () => {
  const projectId = route.params.id
  if (!projectId || projectId === 'new') {
    window.$message?.warning('当前画布还未保存，暂不能复制项目')
    return
  }

  saveProject()
  const newProjectId = duplicateProject(projectId)
  if (!newProjectId) {
    window.$message?.warning('项目不存在或已被删除')
    return
  }

  window.$message?.success('已复制项目')
  router.push(`/canvas/${newProjectId}`)
}

// Handle Enter key | 处理回车键
const handleEnterKey = (e) => {
  e.preventDefault()
  sendMessage()
}

// Handle AI polish | 处理 AI 润色
const handlePolish = async () => {
  const input = chatInput.value.trim()
  if (!input) return

  // Check API configuration | 检查 API 配置
  if (!isChatConfigured.value) {
    window.$message?.warning('请先配置 API Key')
    showApiSettings.value = true
    return
  }

  if (!modelStore.selectedChatModel) {
    window.$message?.warning('请先在 API 设置的模型配置里添加文本模型')
    showApiSettings.value = true
    return
  }

  isProcessing.value = true
  const originalInput = chatInput.value

  try {
    // Call chat API to polish the prompt | 调用 AI 润色提示词
    const result = await sendChat(input, true, {
      model: modelStore.selectedChatModel,
      systemPrompt: CHAT_TEMPLATES[currentTemplate.value]?.systemPrompt || CHAT_TEMPLATES.imagePrompt.systemPrompt
    })

    if (result) {
      chatInput.value = result
      window.$message?.success('提示词已润色')
    }
  } catch (err) {
    chatInput.value = originalInput
    window.$message?.error(err.message || '润色失败')
  } finally {
    isProcessing.value = false
  }
}

// Send message | 发送消息
const sendMessage = async () => {
  const input = chatInput.value.trim()
  if (!input) return

  isProcessing.value = true
  const content = chatInput.value
  chatInput.value = ''

  try {
    // Calculate position to avoid overlap | 计算位置避免重叠
    let maxY = 0
    if (nodes.value.length > 0) {
      maxY = Math.max(...nodes.value.map(n => n.position.y))
    }
    const baseX = 100
    const baseY = maxY + 200

    if (autoExecute.value) {
      // Auto-execute mode: try Canvas Agent Planner first, fallback to workflow orchestrator
      window.$message?.info('正在分析指令...')

      try {
        const snapshot = buildCanvasSnapshot()
        const localPlan = buildLocalCommandPlan(content, snapshot)
        let parsed

        if (localPlan) {
          parsed = { ok: true, plan: localPlan }
        } else {
          if (!isChatConfigured.value) {
            throw new Error('请先配置 API Key')
          }
          const systemPrompt = buildCanvasAgentSystemPrompt(snapshot)
          const response = await sendChat(content, true, { systemPrompt })
          parsed = parseAgentCommandResponse(response)
        }

        if (parsed.ok && parsed.plan.commands.length > 0) {
          const { plan } = parsed
          const batchErr = validateCommandBatch(plan.commands)
          if (batchErr) throw new Error(batchErr.message)

          executeCanvasCommandPlan(plan)
        } else {
          // Fallback: parsed failed or no commands, use old workflow orchestrator
          throw new Error(parsed.error || '无可执行命令')
        }
      } catch (_agentErr) {
        // Fallback to analyzeIntent + executeWorkflow
        try {
          const result = await analyzeIntent(content)
          const workflowParams = {
            workflow_type: result?.workflow_type || WORKFLOW_TYPES.TEXT_TO_IMAGE,
            image_prompt: result?.image_prompt || content,
            video_prompt: result?.video_prompt || content,
            character: result?.character,
            shots: result?.shots
          }
          window.$message?.info(`执行工作流: ${result?.description || '文生图'}`)
          await executeWorkflow(workflowParams, { x: baseX, y: baseY })
          window.$message?.success('工作流已启动')
        } catch (err2) {
          window.$message?.warning('使用默认文生图工作流')
          await createTextToImageWorkflow(content, { x: baseX, y: baseY })
        }
      }
    } else {
      // Manual mode: just create nodes | 手动模式：仅创建节点
      const textNodeId = addNode('text', { x: baseX, y: baseY }, {
        content: content,
        label: '提示词'
      })

      const imageConfigNodeId = addNode('imageConfig', { x: baseX + 400, y: baseY }, {
        label: '文生图'
      })

      addEdge({
        source: textNodeId,
        target: imageConfigNodeId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
    }
    closeCanvasComposer()
  } catch (err) {
    window.$message?.error(err.message || '创建失败')
  } finally {
    isProcessing.value = false
  }
}

// Go back to home | 返回首页
const goBack = () => {
  saveProject()
  router.push({ path: '/', query: { section: 'projects' } })
}

const completeCanvasTour = () => {
  showNodeMenu.value = false
  showWorkflowPanel.value = false
  showRuntimeLogs.value = false
  localStorage.setItem(canvasTourStorageKey, 'done')
}

const startCanvasTour = () => {
  showCanvasTour.value = true
}

const handleCanvasTourStep = (step) => {
  showNodeMenu.value = step?.target === '[data-tour="node-menu"]'
  showWorkflowPanel.value = step?.target === '[data-tour="workflow-panel-open"]'
  showRuntimeLogs.value = step?.target === '[data-tour="runtime-log-panel"]'
}

// Check if mobile | 检测是否移动端
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

// Load project by ID | 根据ID加载项目
const loadProjectById = (projectId) => {
  // Update flow key to force VueFlow re-render | 更新 key 强制 VueFlow 重新渲染
  flowKey.value = Date.now()

  if (projectId && projectId !== 'new') {
    projectStoreCurrentId.value = projectId
    loadProject(projectId)
  } else {
    // New project - clear canvas and detach from previous project.
    projectStoreCurrentId.value = null
    detachCurrentProject()
  }
}

// Watch for route changes | 监听路由变化
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      // Save current project before switching | 切换前保存当前项目
      if (oldId) {
        saveProject()
      }
      // Load new project | 加载新项目
      loadProjectById(newId)
    }
  }
)

// Initialize | 初始化
onMounted(() => {
  canvasPerfLite.value = detectCanvasPerfLite()
  checkMobile()
  refreshSuggestions()
  try {
    const storedRecent = JSON.parse(localStorage.getItem('yufeng-canvas-recent-node-types') || '[]')
    recentNodeTypes.value = Array.isArray(storedRecent) ? storedRecent.slice(0, 4) : []
  } catch {
    recentNodeTypes.value = []
  }
  window.addEventListener('resize', checkMobile)
  window.addEventListener('keydown', handleCanvasKeydown)

  // Initialize projects store | 初始化项目存储
  initProjectsStore()
  initTaskStore()

  // Load project data | 加载项目数据
  loadProjectById(route.params.id)

  const initialAction = sessionStorage.getItem('yufeng-canvas-initial-action')
  if (initialAction) {
    sessionStorage.removeItem('yufeng-canvas-initial-action')
    nextTick(() => {
      handleInitialCanvasAction(initialAction)
    })
  }

  // Check for initial prompt from home page | 检查来自首页的初始提示词
  const initialPrompt = sessionStorage.getItem('ai-canvas-initial-prompt')
  if (initialPrompt) {
    sessionStorage.removeItem('ai-canvas-initial-prompt')
    chatInput.value = initialPrompt
    // Auto-send the message | 自动发送消息
    nextTick(() => {
      sendMessage()
    })
  }

  const shouldStartCanvasTour = sessionStorage.getItem('yufeng-canvas-start-canvas-tour')
    || !localStorage.getItem(canvasTourStorageKey)
  if (shouldStartCanvasTour) {
    sessionStorage.removeItem('yufeng-canvas-start-canvas-tour')
    window.setTimeout(() => {
      showCanvasTour.value = true
    }, 1100)
  }
})

// Cleanup on unmount | 卸载时清理
onUnmounted(() => {
  stopRuntimeTicker()
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('keydown', handleCanvasKeydown)
  // Save project before leaving | 离开前保存项目
  saveProject()
})
</script>

<style>
/* Import Vue Flow styles | 引入 Vue Flow 样式 */
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/minimap/dist/style.css';

.canvas-flow {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 18% 16%, rgba(45, 212, 191, 0.18), transparent 28%),
    radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.14), transparent 30%),
    radial-gradient(circle at 72% 82%, rgba(132, 204, 22, 0.1), transparent 26%),
    linear-gradient(rgba(15, 23, 42, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.055) 1px, transparent 1px),
    linear-gradient(rgba(20, 184, 166, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(20, 184, 166, 0.055) 1px, transparent 1px),
    linear-gradient(135deg, rgba(247, 252, 255, 0.96), rgba(238, 250, 246, 0.9) 52%, rgba(248, 250, 252, 0.96));
  background-size: auto, auto, auto, 80px 80px, 80px 80px, 20px 20px, 20px 20px, auto;
  background-position: center, center, center, -1px -1px, -1px -1px, -1px -1px, -1px -1px, center;
}

.dark .canvas-flow {
  background:
    radial-gradient(circle at 18% 16%, rgba(45, 212, 191, 0.16), transparent 28%),
    radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.14), transparent 30%),
    radial-gradient(circle at 72% 82%, rgba(34, 197, 94, 0.1), transparent 26%),
    linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px),
    linear-gradient(rgba(45, 212, 191, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(45, 212, 191, 0.06) 1px, transparent 1px),
    linear-gradient(135deg, #07111f 0%, #0b1d1d 52%, #101827 100%);
  background-size: auto, auto, auto, 80px 80px, 80px 80px, 20px 20px, 20px 20px, auto;
  background-position: center, center, center, -1px -1px, -1px -1px, -1px -1px, -1px -1px, center;
}

.canvas-shell.is-perf-lite .canvas-flow {
  background:
    linear-gradient(rgba(15, 23, 42, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px),
    linear-gradient(135deg, #f8fbff 0%, #f3faf8 52%, #f8fafc 100%);
  background-size: 40px 40px, 40px 40px, auto;
  background-position: -1px -1px, -1px -1px, center;
}

.dark .canvas-shell.is-perf-lite .canvas-flow {
  background:
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(135deg, #07111f 0%, #0a1a1c 52%, #101827 100%);
  background-size: 40px 40px, 40px 40px, auto;
  background-position: -1px -1px, -1px -1px, center;
}

.canvas-flow::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.6;
  background-image:
    radial-gradient(circle, rgba(15, 118, 110, 0.22) 0 0.8px, transparent 1.2px),
    radial-gradient(circle, rgba(14, 165, 233, 0.18) 0 0.8px, transparent 1.2px);
  background-size: 34px 34px, 58px 58px;
  mask-image: radial-gradient(ellipse at 54% 45%, #000 0 58%, transparent 88%);
}

.dark .canvas-flow::before {
  opacity: 0.72;
  background-image:
    radial-gradient(circle, rgba(94, 234, 212, 0.34) 0 0.8px, transparent 1.2px),
    radial-gradient(circle, rgba(125, 211, 252, 0.2) 0 0.8px, transparent 1.2px);
}

.canvas-shell.is-perf-lite .canvas-flow::before,
.canvas-shell.is-perf-lite::before,
.canvas-shell.is-perf-lite .canvas-ambient {
  display: none;
}

.canvas-shell {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.08), transparent 16%),
    radial-gradient(circle at 18% 12%, rgba(0, 163, 255, 0.16), transparent 32%),
    radial-gradient(circle at 84% 6%, rgba(34, 197, 94, 0.14), transparent 26%),
    linear-gradient(135deg, #f7fbff 0%, #eef7f5 52%, #f8fafc 100%);
}

.dark .canvas-shell {
  background:
    radial-gradient(circle at 50% 0%, rgba(230, 255, 247, 0.07), transparent 16%),
    radial-gradient(circle at 18% 12%, rgba(0, 163, 255, 0.18), transparent 32%),
    radial-gradient(circle at 84% 6%, rgba(34, 197, 94, 0.14), transparent 26%),
    linear-gradient(135deg, #07111f 0%, #0b1d1d 52%, #101827 100%);
}

.canvas-shell.is-perf-lite {
  background:
    radial-gradient(circle at 18% 10%, rgba(20, 184, 166, 0.12), transparent 28%),
    linear-gradient(135deg, #f8fbff 0%, #f3faf8 52%, #f8fafc 100%);
}

.dark .canvas-shell.is-perf-lite {
  background:
    radial-gradient(circle at 18% 10%, rgba(45, 212, 191, 0.1), transparent 28%),
    linear-gradient(135deg, #07111f 0%, #0a1a1c 52%, #101827 100%);
}

.canvas-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.24;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.42) 0 1px, transparent 1.4px),
    radial-gradient(circle, rgba(45, 212, 191, 0.36) 0 1px, transparent 1.4px);
  background-size: 96px 96px, 156px 156px;
  mask-image: radial-gradient(ellipse at 56% 42%, #000 0 45%, transparent 76%);
  z-index: 0;
}

.vue-flow__minimap.canvas-minimap {
  right: 16px;
  bottom: 26px;
  width: 210px;
  height: 140px;
  overflow: hidden;
  border: 1px solid rgba(14, 116, 144, 0.22);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 0%, rgba(20, 184, 166, 0.2), transparent 38%),
    radial-gradient(circle at 86% 18%, rgba(56, 189, 248, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(236, 253, 245, 0.58));
  box-shadow:
    0 24px 70px rgba(15, 23, 42, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(22px) saturate(1.3);
}

.vue-flow__minimap.canvas-minimap.is-raised {
  top: 18px;
  right: 16px;
  bottom: auto !important;
}

.dark .vue-flow__minimap.canvas-minimap {
  border-color: rgba(94, 234, 212, 0.18);
  background:
    radial-gradient(circle at 12% 0%, rgba(45, 212, 191, 0.18), transparent 38%),
    radial-gradient(circle at 86% 18%, rgba(56, 189, 248, 0.14), transparent 34%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.78), rgba(6, 78, 59, 0.36));
  box-shadow:
    0 24px 74px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.vue-flow__minimap.canvas-minimap svg {
  border-radius: 22px;
}

.vue-flow__minimap.canvas-minimap .vue-flow__minimap-mask {
  fill: rgba(15, 118, 110, 0.14);
  stroke: rgba(13, 148, 136, 0.62);
  stroke-width: 2;
}

.dark .vue-flow__minimap.canvas-minimap .vue-flow__minimap-mask {
  fill: rgba(94, 234, 212, 0.1);
  stroke: rgba(94, 234, 212, 0.54);
}

.vue-flow__minimap.canvas-minimap .vue-flow__minimap-node {
  fill: rgba(20, 184, 166, 0.8);
  stroke: rgba(15, 118, 110, 0.9);
  stroke-width: 1.5;
  rx: 8;
  ry: 8;
}

.canvas-flow .vue-flow__handle {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(240, 253, 250, 0.98);
  background: linear-gradient(135deg, #5eead4, #22c55e);
  box-shadow:
    0 0 0 4px rgba(20, 184, 166, 0.16),
    0 0 18px rgba(45, 212, 191, 0.72);
  opacity: 1;
  z-index: 8;
}

.node-port-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(94, 234, 212, 0.32);
  border-radius: 999px;
  color: #047857;
  background: rgba(240, 253, 250, 0.88);
  box-shadow: 0 8px 18px rgba(20, 184, 166, 0.12);
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
  pointer-events: none;
  z-index: 9;
}

.node-port-label-in {
  left: -10px;
  top: 50%;
  transform: translate(-100%, -50%);
}

.dark .node-port-label {
  color: #a7f3d0;
  border-color: rgba(94, 234, 212, 0.22);
  background: rgba(15, 23, 42, 0.88);
}

.canvas-flow .vue-flow__node {
  overflow: visible;
}

.canvas-flow .vue-flow__node button,
.canvas-flow .vue-flow__node input,
.canvas-flow .vue-flow__node textarea,
.canvas-flow .vue-flow__node select,
.canvas-flow .vue-flow__node .n-base-selection,
.canvas-flow .vue-flow__node .n-switch,
.canvas-flow .vue-flow__node .node-action,
.canvas-flow .vue-flow__node .node-card-toolbar {
  pointer-events: auto;
}

.canvas-flow .vue-flow__node button,
.canvas-flow .vue-flow__node select,
.canvas-flow .vue-flow__node input,
.canvas-flow .vue-flow__node textarea {
  touch-action: manipulation;
}

.canvas-flow .vue-flow__node.selected,
.canvas-flow .vue-flow__node:hover {
  z-index: 20 !important;
}

.canvas-flow .vue-flow__edges {
  z-index: 1;
}

.canvas-flow .vue-flow__handle:hover,
.canvas-flow .vue-flow__handle.connecting {
  transform: scale(1.18);
  box-shadow:
    0 0 0 6px rgba(20, 184, 166, 0.2),
    0 0 28px rgba(45, 212, 191, 0.88);
}

.canvas-flow .vue-flow__edge-path {
  stroke-width: 3.2;
  filter: drop-shadow(0 0 5px rgba(45, 212, 191, 0.34));
}

.canvas-flow .vue-flow__edge.selected .vue-flow__edge-path,
.canvas-flow .vue-flow__edge:hover .vue-flow__edge-path {
  stroke-width: 4.5;
  filter: drop-shadow(0 0 10px rgba(94, 234, 212, 0.7));
}

.canvas-flow .vue-flow__connection-path {
  stroke: rgba(34, 211, 238, 0.95);
  stroke-width: 4;
  stroke-dasharray: 9 8;
  filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.56));
}

.canvas-header {
  z-index: 30;
  width: min(1440px, calc(100vw - 24px));
  margin: 12px auto 0;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.42));
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(28px) saturate(1.35);
}

.dark .canvas-header {
  border-color: rgba(203, 255, 239, 0.12);
  background: linear-gradient(135deg, rgba(8, 16, 28, 0.74), rgba(8, 36, 36, 0.48));
  box-shadow: 0 22px 74px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.canvas-ambient {
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(26px);
  opacity: 0.72;
  z-index: 0;
}

.canvas-ambient.one {
  width: 260px;
  height: 260px;
  left: 9%;
  top: 12%;
  background: rgba(0, 163, 255, 0.15);
}

.canvas-ambient.two {
  width: 320px;
  height: 320px;
  right: 7%;
  bottom: 7%;
  background: rgba(34, 197, 94, 0.12);
}

.canvas-toolbar,
.node-menu-pop,
.zoom-dock,
.composer-card,
.processing-card {
  border: 1px solid rgba(255, 255, 255, 0.42);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.42)),
    radial-gradient(circle at 16% 0%, rgba(34, 255, 181, 0.1), transparent 34%);
  box-shadow: 0 24px 68px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(26px) saturate(1.3);
}

.dark .canvas-toolbar,
.dark .node-menu-pop,
.dark .zoom-dock,
.dark .composer-card,
.dark .processing-card {
  border-color: rgba(203, 255, 239, 0.12);
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.76), rgba(6, 78, 59, 0.22)),
    radial-gradient(circle at 16% 0%, rgba(34, 255, 181, 0.08), transparent 34%);
}

.canvas-toolbar {
  border-radius: 24px;
  overflow: hidden;
}

.canvas-toolbar button,
.zoom-dock button,
.node-menu-pop button {
  transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.canvas-toolbar button:hover,
.zoom-dock button:hover,
.node-menu-pop button:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(34, 197, 94, 0.12);
}

.node-menu-pop,
.zoom-dock {
  border-radius: 18px;
}

.node-menu-pop {
  width: 320px;
  padding: 12px;
  max-height: min(560px, calc(100vh - 140px));
  overflow-y: auto;
}

.node-menu-head {
  display: grid;
  gap: 3px;
  padding: 4px 6px 10px;
}

.node-menu-head strong {
  color: var(--text-primary);
  font-size: 15px;
}

.node-menu-head span {
  color: var(--text-secondary);
  font-size: 12px;
}

.node-menu-search {
  width: 100%;
  margin-bottom: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  padding: 10px 12px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.58);
  outline: none;
  font-size: 13px;
}

.dark .node-menu-search {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.48);
}

.node-menu-search:focus {
  border-color: rgba(94, 234, 212, 0.7);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.13);
}

.node-menu-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.node-menu-tabs button,
.recent-node-chip {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  padding: 6px 9px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.48);
  font-size: 11px;
  font-weight: 800;
}

.node-menu-tabs button.active {
  border-color: rgba(94, 234, 212, 0.66);
  color: #064e3b;
  background: linear-gradient(135deg, rgba(94, 234, 212, 0.42), rgba(56, 189, 248, 0.22));
  box-shadow: 0 10px 24px rgba(20, 184, 166, 0.16);
}

.dark .node-menu-tabs button,
.dark .recent-node-chip {
  background: rgba(15, 23, 42, 0.48);
}

.dark .node-menu-tabs button.active {
  color: #ccfbf1;
}

.node-menu-tabs span {
  margin-left: 4px;
  opacity: 0.68;
}

.node-menu-section {
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.34);
}

.dark .node-menu-section {
  background: rgba(15, 23, 42, 0.34);
}

.node-menu-section p {
  margin: 0 0 7px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.recent-node-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.recent-node-chip {
  color: var(--node-color);
  border-color: color-mix(in srgb, var(--node-color) 35%, transparent);
}

.node-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 10px;
  text-align: left;
}

.node-menu-icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--node-color) 42%, transparent);
  border-radius: 14px;
  color: var(--node-color);
  background:
    radial-gradient(circle at 30% 18%, color-mix(in srgb, var(--node-color) 22%, transparent), transparent 56%),
    rgba(255, 255, 255, 0.46);
}

.dark .node-menu-icon {
  background:
    radial-gradient(circle at 30% 18%, color-mix(in srgb, var(--node-color) 26%, transparent), transparent 56%),
    rgba(15, 23, 42, 0.48);
}

.node-menu-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.node-menu-copy strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
}

.node-menu-copy small {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
}

.node-menu-item:hover {
  border-color: rgba(94, 234, 212, 0.34);
  background: rgba(20, 184, 166, 0.12);
}

.canvas-context-menu {
  width: 190px;
  padding: 8px;
  border: 1px solid rgba(203, 255, 239, 0.26);
  border-radius: 18px;
  background:
    radial-gradient(circle at 15% 0%, rgba(94, 234, 212, 0.18), transparent 38%),
    rgba(248, 250, 252, 0.92);
  box-shadow: 0 24px 68px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(24px) saturate(1.25);
}

.dark .canvas-context-menu {
  border-color: rgba(203, 255, 239, 0.14);
  background:
    radial-gradient(circle at 15% 0%, rgba(94, 234, 212, 0.12), transparent 38%),
    rgba(15, 23, 42, 0.9);
}

.canvas-context-menu p {
  margin: 2px 8px 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 900;
}

.canvas-context-menu button {
  display: block;
  width: 100%;
  border-radius: 12px;
  padding: 9px 10px;
  color: var(--text-primary);
  text-align: left;
  font-size: 12px;
  font-weight: 800;
}

.canvas-context-menu button:hover {
  color: #064e3b;
  background: rgba(20, 184, 166, 0.16);
}

.canvas-context-menu button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.canvas-context-menu button:disabled:hover {
  color: var(--text-primary);
  background: transparent;
}

.dark .canvas-context-menu button:hover {
  color: #ccfbf1;
}


.composer-dock {
  width: auto;
  max-width: calc(100vw - 32px);
  pointer-events: none;
}

.composer-dock.is-open {
  width: min(768px, calc(100vw - 32px));
}

.composer-dock > * {
  pointer-events: auto;
}

.composer-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 10px 8px 8px;
  border: 1px solid rgba(203, 255, 239, 0.52);
  border-radius: 999px;
  color: #064e3b;
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 255, 255, 0.92), transparent 36%),
    linear-gradient(135deg, rgba(236, 253, 245, 0.9), rgba(207, 250, 254, 0.74));
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px) saturate(1.24);
  font-size: 13px;
  font-weight: 900;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.composer-trigger:hover {
  transform: translateY(-2px);
  border-color: rgba(45, 212, 191, 0.82);
  box-shadow: 0 24px 62px rgba(20, 184, 166, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.composer-trigger-orb {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 999px;
  color: #042f2e;
  background: linear-gradient(135deg, #6ff7e8, #22d3ee);
  box-shadow: 0 10px 24px rgba(20, 184, 166, 0.28);
  font-size: 11px;
  letter-spacing: -0.02em;
}

.composer-trigger kbd {
  border: 1px solid rgba(15, 118, 110, 0.18);
  border-radius: 999px;
  padding: 4px 7px;
  color: rgba(6, 78, 59, 0.82);
  background: rgba(255, 255, 255, 0.64);
  font-size: 11px;
  font-weight: 850;
}

.dark .composer-trigger {
  color: #ccfbf1;
  border-color: rgba(203, 255, 239, 0.16);
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 255, 255, 0.1), transparent 36%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(6, 78, 59, 0.42));
}

.dark .composer-trigger kbd {
  color: rgba(204, 251, 241, 0.86);
  border-color: rgba(203, 255, 239, 0.16);
  background: rgba(15, 23, 42, 0.58);
}

.canvas-shell.is-perf-lite .composer-trigger {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.46);
}

.composer-card,
.processing-card {
  border-radius: 28px;
}

.composer-card {
  position: relative;
  overflow: hidden;
}

.canvas-shell.is-perf-lite .canvas-header,
.canvas-shell.is-perf-lite .canvas-toolbar,
.canvas-shell.is-perf-lite .node-menu-pop,
.canvas-shell.is-perf-lite .zoom-dock,
.canvas-shell.is-perf-lite .composer-card,
.canvas-shell.is-perf-lite .processing-card,
.canvas-shell.is-perf-lite .runtime-log-panel {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.46);
}

.canvas-shell.is-perf-lite .composer-card::before {
  display: none;
}

.canvas-shell.is-perf-lite .canvas-toolbar button,
.canvas-shell.is-perf-lite .zoom-dock button,
.canvas-shell.is-perf-lite .node-menu-pop button {
  transition: background 0.12s ease, color 0.12s ease;
}

.canvas-shell.is-perf-lite .canvas-toolbar button:hover,
.canvas-shell.is-perf-lite .zoom-dock button:hover,
.canvas-shell.is-perf-lite .node-menu-pop button:hover {
  transform: none;
  box-shadow: none;
}

.composer-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 88% 18%, rgba(34, 255, 181, 0.16), transparent 26%);
}

.canvas-suggestions button {
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(14px);
}

.dark .canvas-suggestions button {
  background: rgba(15, 23, 42, 0.64);
}

.log-error-dot {
  position: absolute;
  right: 2px;
  top: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.live-run-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(34, 197, 94, 0.34);
  border-radius: 999px;
  color: #047857;
  background:
    radial-gradient(circle at 16% 0%, rgba(255, 255, 255, 0.9), transparent 42%),
    linear-gradient(135deg, rgba(220, 252, 231, 0.78), rgba(186, 230, 253, 0.56));
  box-shadow: 0 14px 36px rgba(20, 184, 166, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(16px) saturate(1.35);
  font-size: 12px;
  font-weight: 900;
}

.live-run-chip i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.14), 0 0 18px rgba(34, 197, 94, 0.8);
  animation: live-run-pulse 1.35s ease-in-out infinite;
}

.canvas-shell.is-perf-lite .live-run-chip,
.canvas-shell.is-perf-lite .canvas-suggestions button {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.canvas-shell.is-perf-lite .live-run-chip i {
  animation: none;
  box-shadow: none;
}

.dark .live-run-chip {
  color: #99f6e4;
  border-color: rgba(94, 234, 212, 0.2);
  background:
    radial-gradient(circle at 16% 0%, rgba(255, 255, 255, 0.09), transparent 42%),
    linear-gradient(135deg, rgba(20, 184, 166, 0.2), rgba(56, 189, 248, 0.12));
}

.runtime-log-panel {
  width: min(390px, calc(100vw - 32px));
  max-height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 30px;
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(241, 245, 249, 0.74));
  box-shadow: 0 34px 110px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(28px) saturate(1.32);
}

.dark .runtime-log-panel {
  border-color: rgba(203, 255, 239, 0.13);
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.1), transparent 34%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.9), rgba(7, 34, 36, 0.78));
}

.runtime-log-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.runtime-log-kicker {
  color: var(--accent-color);
  font-size: 11px;
  letter-spacing: 0.18em;
  font-weight: 800;
}

.runtime-log-head h3 {
  font-size: 18px;
  font-weight: 800;
}

.runtime-live-line {
  margin-top: 4px;
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 800;
}

.runtime-log-clear,
.runtime-log-close {
  height: 30px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(148, 163, 184, 0.14);
  font-size: 12px;
}

.runtime-log-close {
  width: 30px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.runtime-log-empty {
  padding: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.runtime-log-list {
  overflow-y: auto;
  padding: 12px;
}

.runtime-log-item {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-left: 3px solid rgba(148, 163, 184, 0.7);
  border-radius: 18px;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.6);
  margin-bottom: 10px;
}

.dark .runtime-log-item {
  background: rgba(2, 6, 23, 0.38);
}

.runtime-log-item.is-success {
  border-left-color: #22c55e;
}

.runtime-log-item.is-error {
  border-left-color: #ef4444;
}

.runtime-log-item.is-info {
  border-left-color: #38bdf8;
}

.runtime-log-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

.runtime-log-tags {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.runtime-log-level {
  text-transform: uppercase;
  font-weight: 800;
}

.runtime-log-chip {
  display: inline-flex;
  align-items: center;
  max-width: 150px;
  height: 22px;
  padding: 0 8px;
  overflow: hidden;
  border: 1px solid rgba(34, 197, 94, 0.28);
  border-radius: 999px;
  color: #047857;
  background: rgba(34, 197, 94, 0.12);
  font-size: 10px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .runtime-log-chip {
  color: #8cfbdd;
  background: rgba(85, 245, 182, 0.12);
}

.runtime-log-chip.is-task {
  border-color: rgba(56, 189, 248, 0.28);
  color: #0369a1;
  background: rgba(56, 189, 248, 0.12);
}

.dark .runtime-log-chip.is-task {
  color: #7dd3fc;
}

.runtime-log-item p {
  font-size: 13px;
  line-height: 1.5;
}

.runtime-log-item pre {
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-secondary);
  font-size: 11px;
}

.agent-task-panel,
.node-inspector-panel {
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100vh - 140px);
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 24px;
  padding: 14px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(22px);
}

.node-inspector-panel {
  right: 24px;
  bottom: 24px;
  max-height: min(620px, calc(100vh - 150px));
  transition: right 0.22s ease, width 0.22s ease, transform 0.22s ease, opacity 0.22s ease;
}

.node-inspector-panel.is-log-open {
  right: min(430px, calc(100vw - 390px));
  width: min(340px, max(260px, calc(100vw - 452px)));
}

.node-inspector-panel.is-collapsed {
  width: 260px;
  max-height: 88px;
  overflow: hidden;
}

.dark .agent-task-panel,
.dark .node-inspector-panel {
  background: rgba(15, 23, 42, 0.74);
  border-color: rgba(148, 163, 184, 0.18);
}

.agent-panel-head,
.inspector-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.agent-panel-head p,
.inspector-head p {
  margin: 0 0 3px;
  color: #14b8a6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
}

.agent-panel-head h3,
.inspector-head h3 {
  margin: 0;
  font-size: 17px;
}

.agent-panel-head button,
.inspector-close {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
}

.inspector-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.inspector-close {
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  transition: color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.inspector-close:hover {
  color: var(--text-primary);
  background: rgba(20, 184, 166, 0.18);
  transform: translateY(-1px);
}

.agent-card {
  margin-top: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-left: 3px solid #94a3b8;
  border-radius: 18px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.5);
}

.dark .agent-card {
  background: rgba(2, 6, 23, 0.34);
}

.agent-card.is-running {
  border-left-color: #06b6d4;
}

.agent-card.is-done {
  border-left-color: #10b981;
}

.agent-card.is-error {
  border-left-color: #ef4444;
}

.agent-card > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.agent-card span {
  color: var(--text-secondary);
  font-size: 12px;
}

.agent-card p,
.agent-card small {
  color: var(--text-secondary);
  line-height: 1.5;
}

.agent-actions,
.inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.inspector-output-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(20, 184, 166, 0.12), rgba(14, 165, 233, 0.08)),
    rgba(255, 255, 255, 0.42);
}

.inspector-output-actions button {
  min-height: 34px;
  border: 1px solid rgba(20, 184, 166, 0.35);
  border-radius: 999px;
  padding: 8px 10px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.66);
  font-size: 12px;
  font-weight: 800;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.inspector-output-actions button:first-child,
.inspector-output-actions button:nth-child(2) {
  grid-column: span 1;
}

.inspector-output-actions button:last-child {
  grid-column: 1 / -1;
}

.inspector-output-actions button.primary {
  color: #042f2e;
  border-color: rgba(94, 234, 212, 0.76);
  background: linear-gradient(135deg, #6ff7e8, #22d3ee);
  box-shadow: 0 12px 30px rgba(20, 184, 166, 0.22);
}

.inspector-output-actions button:hover {
  transform: translateY(-1px);
  border-color: rgba(94, 234, 212, 0.72);
  box-shadow: 0 10px 24px rgba(20, 184, 166, 0.18);
}

.agent-actions button,
.inspector-actions button {
  border: 1px solid rgba(20, 184, 166, 0.28);
  border-radius: 999px;
  padding: 7px 10px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.48);
  font-size: 12px;
}

.dark .agent-actions button,
.dark .inspector-actions button {
  background: rgba(15, 23, 42, 0.44);
}

.dark .inspector-output-actions {
  border-color: rgba(94, 234, 212, 0.28);
  background:
    linear-gradient(135deg, rgba(20, 184, 166, 0.16), rgba(14, 165, 233, 0.1)),
    rgba(15, 23, 42, 0.5);
}

.dark .inspector-output-actions button {
  color: rgba(226, 252, 249, 0.92);
  background: rgba(15, 23, 42, 0.58);
}

.dark .inspector-output-actions button.primary {
  color: #03211f;
  background: linear-gradient(135deg, #6ff7e8, #28d5f2);
}

.node-status-pill {
  padding: 6px 9px;
  border-radius: 999px;
  color: #475569;
  background: rgba(148, 163, 184, 0.16);
  font-size: 11px;
  font-weight: 800;
}

.node-status-pill.running {
  color: #0369a1;
  background: rgba(14, 165, 233, 0.14);
}

.node-status-pill.success {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}

.node-status-pill.error {
  color: #dc2626;
  background: rgba(248, 113, 113, 0.14);
}

.node-status-pill.disabled {
  color: #64748b;
  background: rgba(100, 116, 139, 0.14);
}

.inspector-body {
  display: grid;
  gap: 10px;
}

.inspector-body label span {
  display: block;
  margin-bottom: 5px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.inspector-body input,
.inspector-body textarea,
.inspector-body select {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 14px;
  padding: 9px 10px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.58);
  outline: none;
}

.inspector-body input:focus,
.inspector-body textarea:focus,
.inspector-body select:focus {
  border-color: rgba(94, 234, 212, 0.72);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
}

.dark .inspector-body input,
.dark .inspector-body textarea,
.dark .inspector-body select {
  background: rgba(2, 6, 23, 0.32);
}

.inspector-body textarea {
  min-height: 86px;
  resize: vertical;
}

.inspector-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.inspector-preview img,
.inspector-preview video {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.08);
}

.inspector-empty {
  color: var(--text-secondary);
  line-height: 1.6;
  font-size: 13px;
}

@keyframes live-run-pulse {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.78;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-toolbar button,
  .zoom-dock button,
  .node-menu-pop button,
  .live-run-chip i {
    animation: none;
    transition: none;
  }

  .canvas-toolbar button:hover,
  .zoom-dock button:hover,
  .node-menu-pop button:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
