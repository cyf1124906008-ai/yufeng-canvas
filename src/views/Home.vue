<template>
  <div
    ref="homeShellRef"
    class="home-shell min-h-screen h-screen overflow-y-auto text-[var(--text-primary)]"
    :class="{ 'is-perf-lite': performanceLite }"
  >
    <AppHeader v-if="isWorkspacePage" class="home-header">
      <template #left>
        <button class="brand-lockup" title="回到首页顶部" @click="scrollToTop">
          <img src="../assets/logo.png" alt="YUFENG Canvas" class="brand-logo" />
          <div>
            <p class="brand-name">YUFENG Canvas</p>
            <p class="brand-subtitle">AI visual workflow studio</p>
          </div>
        </button>
      </template>
      <template #right>
        <button
          @click="startHomeTour"
          class="header-pill"
          title="重新查看使用指引"
        >
          <n-icon :size="18"><HelpCircleOutline /></n-icon>
          <span>使用指引</span>
        </button>
        <button
          @click="showHomeRuntimeLogs = !showHomeRuntimeLogs"
          class="header-pill"
          :class="{ 'is-ready': runtimeLogs.length > 0 }"
          title="查看主页请求日志"
        >
          <n-icon :size="18"><DocumentTextOutline /></n-icon>
          <span>日志</span>
          <b v-if="homeRuntimeErrorCount" class="home-log-badge">{{ homeRuntimeErrorCount }}</b>
        </button>
        <button
          @click="showApiSettings = true"
          class="header-pill"
          :class="{ 'is-ready': isApiConfigured }"
          title="API 设置"
          data-tour="api-settings"
        >
          <n-icon :size="18"><SettingsOutline /></n-icon>
          <span>{{ isApiConfigured ? '已连接' : '配置 API' }}</span>
        </button>
      </template>
    </AppHeader>

    <section v-if="!isWorkspacePage" class="gemini-home-shell">
      <aside class="gemini-sidebar">
        <div class="gemini-sidebar-top">
          <button class="gemini-icon-button" title="菜单">
            <n-icon :size="20"><EllipsisHorizontalOutline /></n-icon>
          </button>
          <button class="gemini-icon-button" title="搜索项目">
            <n-icon :size="18"><SearchOutline /></n-icon>
          </button>
        </div>

        <button class="gemini-new-chat" @click="startNewChat">
          <n-icon :size="18"><CreateOutline /></n-icon>
          <span>新对话</span>
        </button>

        <nav class="gemini-nav" aria-label="YUFENG 快捷入口">
          <button @click="enterBlankCanvas">
            <n-icon :size="17"><AddOutline /></n-icon>
            <span>空白画布</span>
          </button>
          <button @click="createIntegratedProject('cloudProWorkflow')">
            <n-icon :size="17"><ImageOutline /></n-icon>
            <span>制作图片</span>
          </button>
          <button @click="createIntegratedProject('image2video')">
            <n-icon :size="17"><VideocamOutline /></n-icon>
            <span>制作视频</span>
          </button>
          <button @click="createIntegratedProject('dramaShots')">
            <n-icon :size="17"><SparklesOutline /></n-icon>
            <span>短剧分镜</span>
          </button>
          <button :class="{ active: homeViewMode === 'inspiration' }" @click="homeViewMode = 'inspiration'">
            <n-icon :size="17"><FolderOutline /></n-icon>
            <span>灵感库</span>
          </button>
          <button :class="{ active: homeViewMode === 'workflows' }" @click="homeViewMode = 'workflows'">
            <n-icon :size="17"><DocumentTextOutline /></n-icon>
            <span>工作流模板</span>
          </button>
        </nav>

        <div v-if="chatHistory.length" class="gemini-sidebar-section">
          <strong>最近对话</strong>
          <button
            v-for="item in chatHistory.slice(0, 6)"
            :key="item.id"
            @click="restoreChatSession(item.id)"
          >
            {{ item.title || '新对话' }}
          </button>
        </div>

        <div v-if="recentHomeProjects.length" class="gemini-sidebar-section">
          <strong>最近项目</strong>
          <button
            v-for="project in recentHomeProjects"
            :key="project.id"
            @click="openProject(project)"
          >
            {{ project.name || '未命名项目' }}
          </button>
        </div>

        <div class="gemini-sidebar-bottom">
          <button @click="showTrashModal = true">
            <n-icon :size="17"><TrashOutline /></n-icon>
            <span>回收站</span>
          </button>
          <button @click="showApiSettings = true">
            <n-icon :size="17"><SettingsOutline /></n-icon>
            <span>设置</span>
          </button>
        </div>
      </aside>

      <main class="gemini-main">
        <header class="gemini-topbar">
          <strong>YUFENG Canvas</strong>
          <button @click="showApiSettings = true">
            {{ isApiConfigured ? '模型已连接' : '配置模型 API' }}
          </button>
        </header>

        <div
          v-if="homeViewMode === 'chat'"
          class="gemini-center"
          :class="{ 'has-chat': chatMessages.length || chatLoading || chatImageLoading }"
        >
          <div v-if="chatMessages.length || chatLoading || chatImageLoading" class="gemini-chat-thread">
            <div
              v-for="message in chatMessages"
              :key="message.id"
              class="chat-message"
              :class="message.role"
            >
              <div v-if="message.content">{{ message.content }}</div>
              <div v-if="message.images?.length" class="chat-image-grid">
                <figure v-for="(image, index) in message.images" :key="image.id || image.url">
                  <img :src="image.url" :alt="`聊天生成图片 ${index + 1}`" />
                  <figcaption>
                    <button @click="generateImageInChat(image.prompt || message.prompt || message.content, { addUserMessage: false })">重新生成</button>
                    <button @click="varyChatImage(image)">变化</button>
                    <button @click="upscaleChatImage(image)">放大</button>
                    <button @click="placeChatImageIntoCanvas(image)">放入画布</button>
                  </figcaption>
                </figure>
              </div>
              <div v-if="message.role === 'assistant' && !message.images?.length" class="chat-action-row">
                <button @click="generateImageInChat(message.content, { addUserMessage: false })">用这段生成图片</button>
                <button @click="fillChatPrompt(`请把下面内容优化成更适合生图的中文 Prompt：\n${message.content}`)">优化提示词</button>
                <button @click="createFromTemplate(message.content)">放入画布</button>
              </div>
            </div>
            <div v-if="chatLoading && currentResponse" class="chat-message assistant">
              {{ currentResponse }}
            </div>
            <div v-else-if="chatLoading" class="chat-message assistant thinking">
              <n-spin :size="14" />
              正在思考...
            </div>
            <div v-if="chatImageLoading" class="chat-message assistant thinking">
              <n-spin :size="14" />
              正在调用图片模型生成...
            </div>
          </div>

          <div v-else class="gemini-welcome">
            <p class="gemini-hello">你好</p>
            <h1>今天想创作什么？</h1>
            <p class="gemini-typewriter" :aria-label="heroTypewriterAriaLabel">
              <span
                class="gemini-typewriter-text"
                :class="{
                  'is-typing': heroTypePhase === 'typing',
                  'is-holding': heroTypePhase === 'holding',
                  'is-erasing': heroTypePhase === 'erasing'
                }"
              >
                <span
                  v-for="(char, index) in heroTypeChars"
                  :key="`${heroTypeCycle}-${index}-${char}`"
                  class="gemini-typewriter-char"
                >
                  {{ char }}
                </span>
              </span>
              <span class="gemini-typewriter-dot" aria-hidden="true"></span>
            </p>
          </div>

          <div v-if="chatAttachments.length" class="gemini-attachments">
            <span
              v-for="attachment in chatAttachments"
              :key="attachment.id"
              class="attachment-chip"
            >
              <n-icon :size="14">
                <ImageOutline v-if="attachment.kind === 'image'" />
                <DocumentOutline v-else />
              </n-icon>
              {{ attachment.name }}
              <button @click="removeChatAttachment(attachment.id)">?</button>
            </span>
          </div>

          <div
            class="gemini-composer"
            :class="{ 'is-selected': focusedEntry === 'chat' }"
            data-tour="chat-composer"
            @focusin="focusedEntry = 'chat'"
            @focusout="handleComposerFocusOut('chat', $event)"
          >
            <input
              ref="chatFileInputRef"
              id="home-chat-file-input"
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.csv"
              class="hidden-file-input"
              tabindex="-1"
              aria-label="上传图片或文本资料"
              @change="handleChatFiles"
            />
            <textarea
              ref="chatTextareaRef"
              v-model="chatText"
              aria-label="AI 对话输入框"
              placeholder="描述你想做的图片、视频、短剧或工作流..."
              :disabled="chatLoading || chatReadingUrls"
              @keydown.enter.exact.prevent="submitHomeComposer"
              @keydown.enter.ctrl.prevent="submitHomeComposer"
            />
            <div class="gemini-composer-footer">
              <div class="gemini-tools">
                <button title="上传参考图或资料" @click.prevent="triggerChatFilePicker">+</button>
                <button @click="chatText.trim() ? generateImageFromComposer() : fillChatPrompt('帮我做一张产品发布海报，包含主视觉、卖点和社媒版本')">图片</button>
                <button @click="fillChatPrompt('帮我把一张参考图或首帧做成视频，并规划镜头运动')">视频</button>
                <button @click="fillChatPrompt('帮我做一个短剧第一集，生成角色、场景和 8 个分镜')">短剧</button>
                <button @click="enterBlankCanvas">画布</button>
              </div>
              <div class="gemini-composer-actions">
                <label class="gemini-model-field">
                  <span>对话</span>
                  <select
                    v-model="modelStore.selectedChatModel"
                    class="gemini-model-select"
                    title="选择对话模型"
                  >
                    <option value="">自动</option>
                    <option v-for="model in chatModelOptions" :key="model.key" :value="model.key">
                      {{ model.label || model.key }}
                    </option>
                  </select>
                </label>
                <label class="gemini-model-field">
                  <span>图片</span>
                  <select
                    v-model="chatImageModel"
                    class="gemini-model-select"
                    title="选择图片模型"
                  >
                    <option value="">自动</option>
                    <option v-for="model in chatImageModelOptions" :key="model.key" :value="model.key">
                      {{ model.label || model.key }}
                    </option>
                  </select>
                </label>
                <label class="gemini-model-field">
                  <span>视频</span>
                  <select
                    v-model="modelStore.selectedVideoModel"
                    class="gemini-model-select"
                    title="选择视频模型"
                  >
                    <option value="">自动</option>
                    <option v-for="model in chatVideoModelOptions" :key="model.key" :value="model.key">
                      {{ model.label || model.key }}
                    </option>
                  </select>
                </label>
                <button
                  class="gemini-send"
                  :disabled="chatLoading || chatReadingUrls || (!chatText.trim() && !chatAttachments.length)"
                  @click="submitHomeComposer"
                >
                  <n-spin v-if="chatLoading" :size="14" />
                  <span v-else>发送</span>
                </button>
              </div>
            </div>
          </div>

          <div class="gemini-suggestions">
            <button @click="fillChatPrompt('做一张产品发布海报，包含主视觉、卖点和社媒版本')">
              产品海报
            </button>
            <button @click="fillChatPrompt('做一个古装短剧第一集，生成 8 个分镜')">
              短剧分镜
            </button>
            <button @click="fillChatPrompt('把一张参考图变成视频首帧到视频工作流')">
              图生视频
            </button>
          </div>
        </div>

        <section v-else-if="homeViewMode === 'inspiration'" class="gemini-library">
          <div class="gemini-library-head">
            <div>
              <p>INSPIRATION LIBRARY</p>
              <h2>灵感库</h2>
              <span>已整合 {{ awesomeCaseCount }} 个案例。点击案例会把提示词带回 AI 对话，你可以继续修改或直接生成。</span>
            </div>
            <button @click="openPromptSource">来源</button>
          </div>

          <div class="gemini-library-toolbar">
            <div class="gemini-library-search">
              <n-icon :size="16"><SearchOutline /></n-icon>
              <input v-model="inspirationSearch" placeholder="搜索海报、人像、电商、短剧、Case 编号..." />
            </div>
            <button v-if="inspirationSearch || inspirationCategory !== 'all'" @click="resetInspirationFilters">清空</button>
          </div>

          <div class="gemini-chip-row">
            <button
              v-for="category in inspirationCategories"
              :key="category.key"
              :class="{ active: inspirationCategory === category.key }"
              @click="inspirationCategory = category.key"
            >
              {{ category.label }} <span>{{ category.count }}</span>
            </button>
          </div>

          <div class="gemini-case-grid">
            <button
              v-for="item in visibleInspirationCases"
              :key="item.id || item.title"
              class="gemini-case-card"
              @click="useInspirationCase(item)"
            >
              <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" />
              <div v-else class="gemini-case-placeholder">Y</div>
              <span v-if="item.caseNumber" class="case-badge">Case {{ item.caseNumber }}</span>
              <div>
                <b>{{ item.displayTitle || item.shortTitle || item.title }}</b>
                <p>{{ item.displayExcerpt || item.excerpt || item.prompt }}</p>
              </div>
            </button>
          </div>

          <div v-if="visibleInspirationCases.length < filteredInspirationCases.length" class="gemini-more-row">
            <button @click="loadMoreInspiration">再加载 48 个案例</button>
          </div>
        </section>

        <section v-else class="gemini-library">
          <div class="gemini-library-head">
            <div>
              <p>WORKFLOW TEMPLATES</p>
              <h2>工作流模板</h2>
              <span>复杂工作流会直接创建画布项目并搭好节点链路；简单模板只作为快速入口。</span>
            </div>
            <button @click="homeViewMode = 'chat'">回到对话</button>
          </div>

          <div class="gemini-library-toolbar">
            <div class="gemini-library-search">
              <n-icon :size="16"><SearchOutline /></n-icon>
              <input v-model="workflowSearch" placeholder="搜索角色一致性、首帧视频、电商、修复、放大..." />
            </div>
            <button v-if="workflowSearch || workflowCategory !== 'all'" @click="resetWorkflowFilters">清空</button>
          </div>

          <div class="gemini-chip-row">
            <button
              v-for="category in workflowCategories"
              :key="category.key"
              :class="{ active: workflowCategory === category.key }"
              @click="workflowCategory = category.key"
            >
              {{ category.label }} <span>{{ category.count }}</span>
            </button>
          </div>

          <div class="gemini-workflow-grid">
            <button
              v-for="workflow in visibleHomeWorkflows"
              :key="workflow.id"
              class="gemini-workflow-card"
              @click="createProjectFromWorkflow(workflow)"
            >
              <img v-if="workflow.cover" :src="workflow.cover" :alt="workflow.name" loading="lazy" />
              <div v-else class="gemini-workflow-placeholder">WF</div>
              <div>
                <span>{{ workflow.category || 'workflow' }}</span>
                <b>{{ workflow.name }}</b>
                <p>{{ workflow.description }}</p>
                <small>{{ getHomeWorkflowNodeCount(workflow) }} 个节点 · 一键加入画布</small>
              </div>
            </button>
          </div>

          <div v-if="visibleHomeWorkflows.length < filteredHomeWorkflows.length" class="gemini-more-row">
            <button @click="loadMoreWorkflows">再加载 36 个工作流</button>
          </div>
        </section>

        <footer class="gemini-brand-mark" aria-label="YUFENG Canvas">
          <p>YUFENG Canvas</p>
          <span>Visual AI workflow studio</span>
        </footer>
      </main>
    </section>

    <main
      v-if="isWorkspacePage"
      class="home-main"
      :class="{ 'is-workspace': isWorkspacePage }"
      @click.self="handleWelcomeContinue"
    >
      <div v-if="isWorkspacePage" class="workspace-brand-strip">
        <div>
          <strong>YUFENG Canvas</strong>
          <span>AI 创作工作台</span>
        </div>
      </div>

      <section
        class="hero-grid"
        :class="{ 'is-collapsed': isWorkspacePage }"
        @click="!isWorkspacePage && handleWelcomeContinue()"
      >
        <aside v-if="isWorkspacePage" class="chat-history-panel" aria-label="历史对话">
          <div class="history-head">
            <div>
              <span>CHAT HISTORY</span>
              <strong>历史对话</strong>
            </div>
            <button @click="startNewChat">新对话</button>
          </div>
          <div v-if="chatHistory.length" class="history-list">
            <button
              v-for="item in chatHistory"
              :key="item.id"
              class="history-item"
              :class="{ active: item.id === activeChatId }"
              @click="restoreChatSession(item.id)"
            >
              <strong>{{ item.title }}</strong>
              <span>{{ formatChatTime(item.updatedAt) }}</span>
            </button>
          </div>
          <div v-else class="history-empty">
            <n-icon :size="24"><ChatbubbleOutline /></n-icon>
            <p>开始一次对话后，这里会保存你的历史记录。</p>
          </div>
        </aside>

        <div v-show="!isWorkspacePage" class="hero-copy">
          <div class="eyebrow hero-eyebrow">
            <span class="eyebrow-dot" aria-hidden="true">●</span>
            YUFENG CREATIVE CANVAS
          </div>
          <div class="hero-line">
            <h1
              class="hero-title hero-title-typewriter"
              :aria-label="heroTypewriterAriaLabel"
            >
              <span class="hero-title-line hero-title-line-static" aria-hidden="true">
                和 AI 一起，
              </span>

              <span
                class="hero-title-line hero-title-line-typewriter"
                aria-hidden="true"
              >
                <span
                  class="hero-typewriter-text"
                  :class="{
                    'is-typing': heroTypePhase === 'typing',
                    'is-holding': heroTypePhase === 'holding',
                    'is-erasing': heroTypePhase === 'erasing'
                  }"
                >
                  <span
                    v-for="(char, index) in heroTypeChars"
                    :key="`${heroTypeCycle}-${index}-${char}`"
                    class="hero-typewriter-char"
                    :style="{ '--char-index': index }"
                  >
                    {{ char }}
                  </span>
                </span>

                <span
                  class="hero-typewriter-cursor"
                  aria-hidden="true"
                ></span>
              </span>
            </h1>
            <p class="hero-desc">
              用对话启动创作，把提示词、参考图、模型和节点流程，编排成可复用的视觉工作流。
            </p>
          </div>

          <div class="welcome-continue">
            <span>点击任意位置或按任意键继续</span>
          </div>
        </div>

        <div v-if="isWorkspacePage" class="prompt-panel" data-tour="home-chat">
          <div class="prompt-panel-glow"></div>
          <div class="hero-prism" aria-hidden="true">
            <div class="prism-core">Y</div>
            <span class="prism-chip chip-one">workflow</span>
            <span class="prism-chip chip-two">prompt</span>
            <span class="prism-chip chip-three">render</span>
          </div>
          <div class="mode-card">
            <div class="mode-tabs">
              <button
                class="mode-tab"
                :class="{ active: activeMode === 'chat' }"
                @click="focusChatEntry"
              >
                <n-icon :size="21"><ChatbubbleOutline /></n-icon>
                <span>
                  <strong>直接对话</strong>
                  <small>和模型聊想法、拆方向</small>
                </span>
              </button>
              <button
                class="mode-tab"
                :class="{ active: activeMode === 'create' }"
                @click="focusCreateEntry"
              >
                <n-icon :size="21"><SparklesOutline /></n-icon>
                <span>
                  <strong>生成工作流</strong>
                  <small>一句话生成节点画布</small>
                </span>
              </button>
            </div>

            <div class="quick-canvas-actions">
              <button class="primary-action small" @click.stop="enterBlankCanvas">
                <n-icon :size="16"><AddOutline /></n-icon>
                直接进入空白画布
              </button>
              <button class="primary-action small hot" @click.stop="createIntegratedProject('dramaShots')">
                一键短剧 8 分镜
              </button>
              <button class="secondary-action small" @click.stop="scrollToProjects">
                我的项目
              </button>
            </div>

            <div class="integrated-launch-grid" aria-label="YUFENG 内置生产线">
              <button
                v-for="card in integratedLaunchCards"
                :key="card.id"
                class="integrated-launch-card"
                @click.stop="createIntegratedProject(card.id)"
              >
                <span>{{ card.badge }}</span>
                <strong>{{ card.title }}</strong>
                <small>{{ card.desc }}</small>
                <b>{{ card.action }}</b>
              </button>
            </div>

            <div v-if="activeMode === 'chat'" class="chat-home">
              <div class="entry-copy">
                <p>DIRECT CHAT</p>
                <h3>先把创意聊清楚。</h3>
                <span>让文本模型帮你拆方向、写提示词、整理分镜；需要图片或视频时，再一键进入节点画布。</span>
              </div>

              <div class="integrated-inline-actions">
                <button @click.stop="createIntegratedProject('dramaShots')">内置短剧项目：生成 8 分镜</button>
                <button @click.stop="createIntegratedProject('cloudProWorkflow')">云端专业文生图</button>
                <button @click.stop="createIntegratedProject('image2video')">首帧到视频链路</button>
              </div>

              <div class="chat-thread">
                <div v-if="chatMessages.length === 0" class="chat-empty">
                  <div class="chat-orb">
                    <n-icon :size="28"><SparklesOutline /></n-icon>
                  </div>
                  <h3>先把创意聊清楚。</h3>
                  <p>让文本模型帮你拆方向、写提示词、整理分镜；需要生成图片或视频时，再进入节点画布。</p>
                </div>
                <div
                  v-for="message in chatMessages"
                  :key="message.id"
                  class="chat-message"
                  :class="message.role"
                >
                  <div v-if="message.content">{{ message.content }}</div>
                  <div v-if="message.images?.length" class="chat-image-grid">
                    <figure v-for="(image, index) in message.images" :key="image.id || image.url">
                      <img :src="image.url" :alt="`聊天生成图片 ${index + 1}`" />
                      <figcaption>
                        <button @click="generateImageInChat(image.prompt || message.prompt || message.content, { addUserMessage: false })">重新生成</button>
                        <button @click="varyChatImage(image)">变化</button>
                        <button @click="upscaleChatImage(image)">放大</button>
                        <button @click="copyText(image.prompt || message.prompt)">复制 Prompt</button>
                        <button @click="placeChatImageIntoCanvas(image)">放入画布</button>
                        <button @click="openImageExpert(image.prompt || message.prompt)">专家模式</button>
                      </figcaption>
                    </figure>
                  </div>
                  <div v-if="message.role === 'assistant' && !message.images?.length" class="chat-action-row">
                    <button @click="generateImageInChat(message.content, { addUserMessage: false })">用这个生成图片</button>
                    <button @click="fillChatPrompt(`请把下面内容优化成更适合生图的中文 Prompt：\n${message.content}`)">优化提示词</button>
                    <button @click="fillChatPrompt(`请基于下面内容生成 3 个不同视觉版本：\n${message.content}`)">生成 3 个版本</button>
                    <button @click="createFromTemplate(message.content)">放入画布</button>
                    <button @click="createFromTemplate(`把下面内容拆成可执行的图片/视频节点工作流：\n${message.content}`)">创建工作流</button>
                  </div>
                </div>
                <div v-if="chatLoading && currentResponse" class="chat-message assistant">
                  {{ currentResponse }}
                </div>
                <div v-else-if="chatLoading" class="chat-message assistant thinking">
                  <n-spin :size="14" />
                  正在思考...
                </div>
                <div v-if="chatImageLoading" class="chat-message assistant thinking">
                  <n-spin :size="14" />
                  正在调用图片模型生成...
                </div>
              </div>

              <div v-if="chatAttachments.length" class="chat-attachments">
                <span
                  v-for="attachment in chatAttachments"
                  :key="attachment.id"
                  class="attachment-chip"
                >
                  <n-icon :size="14">
                    <ImageOutline v-if="attachment.kind === 'image'" />
                    <DocumentOutline v-else />
                  </n-icon>
                  {{ attachment.name }}
                  <button @click="removeChatAttachment(attachment.id)">×</button>
                </span>
              </div>

              <div class="chat-model-row">
                <span>对话模型</span>
                <select v-model="modelStore.selectedChatModel" class="model-select" title="选择语言模型">
                  <option value="">选择语言模型</option>
                  <option v-for="model in chatModelOptions" :key="model.key" :value="model.key">
                    {{ model.label || model.key }}
                  </option>
                </select>
                <button @click="showApiSettings = true">配置模型</button>
              </div>

              <div
                class="chat-composer"
                :class="{ 'is-selected': focusedEntry === 'chat' }"
                data-tour="chat-composer"
                @focusin="focusedEntry = 'chat'"
                @focusout="handleComposerFocusOut('chat', $event)"
              >
                <input
                  ref="chatFileInputRef"
                  id="home-chat-file-input"
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.json,.csv"
                  class="hidden-file-input"
                  tabindex="-1"
                  aria-label="上传图片或文本资料"
                  @change="handleChatFiles"
                />
                <button
                  class="attach-button"
                  :disabled="chatLoading"
                  title="上传图片或文本资料"
                  @click.prevent="triggerChatFilePicker"
                >
                  <n-icon :size="19"><ImageOutline /></n-icon>
                </button>
                <button
                  class="attach-button"
                  :class="{ active: chatReadingUrls }"
                  :disabled="chatLoading || chatReadingUrls || !extractUrls(chatText).length"
                  title="读取输入框里的网页链接"
                  @click="readLinksIntoChat"
                >
                  <n-spin v-if="chatReadingUrls" :size="15" />
                  <n-icon v-else :size="18"><SearchOutline /></n-icon>
                </button>
                <button
                  class="attach-button image-generate-trigger"
                  :disabled="chatImageLoading || chatReadingUrls || !effectiveChatImageModel || (!chatText.trim() && !chatAttachments.length)"
                  title="直接用当前提示词生成图片"
                  @click="generateImageFromComposer"
                >
                  <n-spin v-if="chatImageLoading" :size="15" />
                  <n-icon v-else :size="18"><SparklesOutline /></n-icon>
                </button>
                <textarea
                  ref="chatTextareaRef"
                  v-model="chatText"
                  aria-label="直接对话输入框"
                  placeholder="直接和模型对话，例如：帮我把这个产品想法拆成 3 个视觉方向..."
                  :disabled="chatLoading || chatReadingUrls"
                  @keydown.enter.exact.prevent="sendHomeChat"
                />
                <button class="send-button" :disabled="chatLoading || chatReadingUrls || (!chatText.trim() && !chatAttachments.length)" @click="sendHomeChat">
                  <n-spin v-if="chatLoading" :size="16" />
                  <n-icon v-else :size="20"><SendOutline /></n-icon>
                </button>
              </div>

              <div class="chat-image-controls">
                <span>直接生图：</span>
                <select v-model="chatImageModel" class="model-select" title="选择图片模型">
                  <option value="">选择图片模型</option>
                  <option v-for="model in chatImageModelOptions" :key="model.key" :value="model.key">
                    {{ model.label || model.key }}
                  </option>
                </select>
                <select v-model="chatImageResolution" title="选择图片清晰度">
                  <option v-for="item in chatImageResolutionOptions" :key="item.key" :value="item.key">
                    {{ item.label }}
                  </option>
                </select>
                <select v-model="chatImageSize">
                  <option v-for="item in chatImageSizeOptions" :key="item.key" :value="item.key">
                    {{ getChatImageSizeLabel(item) }}
                  </option>
                </select>
                <select v-model.number="chatImageCount">
                  <option :value="1">1 张</option>
                  <option :value="2">2 张</option>
                  <option :value="3">3 张</option>
                  <option :value="4">4 张</option>
                </select>
                <button :disabled="chatImageLoading || !chatText.trim() || !effectiveChatImageModel" @click="generateImageFromComposer">
                  当前输入生成图片
                </button>
                <button @click="openImageExpert(chatText)">
                  专家参数
                </button>
              </div>

              <div class="suggestion-cloud">
                <span>试试：</span>
                <button v-for="tag in chatSuggestions" :key="tag" @click="fillChatPrompt(tag)">
                  {{ tag }}
                </button>
              </div>
            </div>

            <div v-else class="create-home">
              <div class="entry-copy">
                <p>WORKFLOW LAUNCHER</p>
                <h3>一句话生成工作流</h3>
                <span>描述你的目标，AI 会帮你拆成创意方向、提示词、模型配置和节点流程。</span>
              </div>

              <div
                class="create-composer"
                :class="{ 'is-selected': focusedEntry === 'create' }"
                @focusin="focusedEntry = 'create'"
                @focusout="handleComposerFocusOut('create', $event)"
              >
                <div class="prompt-card-head">
                  <span>一句话生成工作流</span>
                  <span class="shortcut">Ctrl + Enter</span>
                </div>
                <textarea
                  ref="createTextareaRef"
                  v-model="inputText"
                  aria-label="生成工作流输入框"
                  placeholder="例如：帮我把这个新茶饮品牌拆成 3 个视觉方向，并生成图片 / 视频节点工作流..."
                  @keydown.enter.ctrl="handleCreateWithInput"
                />
                <div class="prompt-footer">
                  <span class="prompt-count">{{ inputText.length }} / 1000</span>
                  <button class="ghost-chip" @click="randomFillAndFocus">
                    <n-icon :size="15"><RefreshOutline /></n-icon>
                    随机灵感
                  </button>
                  <button class="send-button" @click="handleCreateWithInput" title="生成工作流">
                    <n-icon :size="20"><SendOutline /></n-icon>
                  </button>
                </div>
              </div>

              <div class="suggestion-cloud">
                <span>模板：</span>
                <button
                  v-for="tag in visibleSuggestions"
                  :key="tag"
                  @click="fillCreatePrompt(tag)"
                >
                  {{ tag }}
                </button>
                <button class="refresh-chip" @click="refreshSuggestions" title="换一批">
                  <n-icon :size="15"><RefreshOutline /></n-icon>
                </button>
              </div>
            </div>

            <div v-if="recentHomeProjects.length" class="panel-recent">
              <div class="panel-section-head">
                <h3>最近项目</h3>
                <button @click="scrollToProjects">查看全部</button>
              </div>
              <div class="panel-recent-grid">
                <button
                  v-for="project in recentHomeProjects"
                  :key="project.id"
                  class="panel-project-card"
                  @click="openProject(project)"
                >
                  <div class="panel-project-thumb">
                    <template v-if="getProjectPreview(project)">
                      <video
                        v-if="isVideoUrl(getProjectPreview(project))"
                        :src="getProjectPreview(project)"
                        muted
                        playsinline
                      />
                      <img v-else :src="getProjectPreview(project)" :alt="project.name" />
                    </template>
                    <n-icon v-else :size="26"><DocumentOutline /></n-icon>
                  </div>
                  <strong>{{ project.name }}</strong>
                  <span>{{ formatDate(project.updatedAt) }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="showcase-section">
        <div class="section-title" data-tour="showcase">
          <div>
            <p class="eyebrow">READY TO BUILD</p>
            <h2>常用创作场景</h2>
          </div>
          <button class="new-project-button" @click="createNewProject">
            <n-icon :size="16"><AddOutline /></n-icon>
            新建空白项目
          </button>
        </div>

        <div class="showcase-grid">
          <button
            v-for="(card, index) in showcaseCards"
            :key="card.title"
            class="showcase-card"
            :class="`showcase-card-${index + 1}`"
            @click="createFromTemplate(card.prompt)"
          >
            <img :src="card.image" :alt="card.title" />
            <div class="showcase-overlay">
              <span>{{ card.badge }}</span>
              <h3>{{ card.title }}</h3>
              <p>{{ card.desc }}</p>
              <b>打开工作流</b>
            </div>
          </button>
        </div>
      </section>

      <section ref="inspirationSection" class="inspiration-section">
        <div class="section-title" data-tour="prompt-library">
          <div>
            <p class="eyebrow">GPT IMAGE 2 PROMPT LIBRARY</p>
            <h2>灵感案例库</h2>
            <p class="section-desc">
              已整合 {{ awesomeCaseCount }} 个去重后的 GPT Image 2 开源案例，并加了 YUFENG Canvas 可执行优化说明；可搜索、分类筛选，点击卡片直接进画布。
            </p>
          </div>
          <button class="source-link" @click="openPromptSource">
            查看来源
          </button>
        </div>

        <div class="inspiration-toolbar">
          <div class="inspiration-search">
            <n-icon :size="16"><SearchOutline /></n-icon>
            <input
              v-model="inspirationSearch"
              placeholder="搜索电商、海报、人像、UI、Case 编号或关键词..."
              aria-label="搜索灵感案例"
            />
            <button v-if="inspirationSearch || inspirationCategory !== 'all'" @click="resetInspirationFilters">清空</button>
          </div>
          <div class="inspiration-category-row">
            <button
              v-for="category in inspirationCategories"
              :key="category.key"
              :class="{ active: inspirationCategory === category.key }"
              @click="inspirationCategory = category.key"
            >
              {{ category.label }}
              <span>{{ category.count }}</span>
            </button>
          </div>
          <p class="inspiration-count">
            当前显示 {{ visibleInspirationCases.length }} / {{ filteredInspirationCases.length }} 个案例
          </p>
        </div>

        <div class="inspiration-grid">
          <button
            v-for="item in visibleInspirationCases"
            :key="item.id || item.title"
            class="inspiration-card"
            :class="{ 'is-awesome-case': item.caseNumber || item.source }"
            @click="createFromTemplate(item.prompt)"
          >
            <div class="inspiration-image">
              <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" />
              <div v-else class="inspiration-image-placeholder">Y</div>
              <span v-if="item.caseNumber" class="case-badge">Case {{ item.caseNumber }}</span>
            </div>
            <div class="inspiration-body">
              <span class="inspiration-category-pill">{{ item.category }}</span>
              <h3>{{ item.displayTitle || item.shortTitle || item.title }}</h3>
              <p>{{ item.displayExcerpt || item.excerpt || item.prompt }}</p>
              <div v-if="item.promptTags?.length" class="inspiration-tags">
                <i v-for="tag in item.promptTags.slice(0, 4)" :key="tag">{{ tag }}</i>
              </div>
              <small v-if="item.source" class="inspiration-meta">
                <b v-if="item.difficulty">{{ item.difficulty }}</b>
                <em v-if="item.aspectHint">{{ item.aspectHint }}</em>
                <span>开源案例 · Case {{ item.caseNumber }}</span>
              </small>
            </div>
          </button>
        </div>

        <div v-if="visibleInspirationCases.length < filteredInspirationCases.length" class="inspiration-more-row">
          <button @click="loadMoreInspiration">再加载 48 个案例</button>
        </div>
      </section>

      <section ref="projectsSection" class="projects-section">
        <div class="section-title" data-tour="projects">
          <div>
            <p class="eyebrow">LOCAL WORKSPACE</p>
            <h2>我的项目</h2>
          </div>
          <button class="new-project-button" @click="enterBlankCanvas">
            <n-icon :size="16"><AddOutline /></n-icon>
            进入空白画布
          </button>
        </div>

        <div v-if="projects.length === 0" class="empty-state">
          <n-icon :size="52"><FolderOutline /></n-icon>
          <h3>还没有项目</h3>
          <p>从一个提示词开始，YUFENG 会帮你创建可编辑的节点画布。</p>
          <button class="primary-action small" @click="createNewProject">创建第一个项目</button>
        </div>

        <div v-else class="project-grid">
          <div
            v-for="project in projects"
            :key="project.id"
            class="project-card group"
            draggable="true"
            @dragstart="startProjectDrag(project, $event)"
            @dragend="endProjectDrag"
          >
            <div class="project-thumb" @click="openProject(project)">
              <template v-if="getProjectPreview(project)">
                <video
                  v-if="isVideoUrl(getProjectPreview(project))"
                  :ref="el => setVideoRef(project.id, el)"
                  :src="getProjectPreview(project)"
                  muted
                  loop
                  playsinline
                />
                <img v-else :src="getProjectPreview(project)" :alt="project.name" />
              </template>
              <div v-else class="project-placeholder">
                <n-icon :size="34"><DocumentOutline /></n-icon>
              </div>
            </div>
            <div class="project-meta">
              <button class="project-open" @click="openProject(project)">
                <span>{{ project.name }}</span>
                <small>{{ formatDate(project.updatedAt) }}</small>
              </button>
              <button class="project-delete" title="删除项目" @click.stop="requestDeleteProject(project)">
                <n-icon :size="15"><TrashOutline /></n-icon>
                <span>删除</span>
              </button>
              <n-dropdown :options="getProjectActions(project)" @select="(key) => handleProjectAction(key, project)" placement="bottom-end">
                <button class="project-menu" @click.stop>
                  <n-icon :size="16"><EllipsisHorizontalOutline /></n-icon>
                </button>
              </n-dropdown>
            </div>
          </div>
        </div>
      </section>

      <footer class="brand-footer" aria-label="YUFENG Canvas">
        <div class="brand-footer-glow"></div>
        <p>YUFENG Canvas</p>
        <span>Visual AI workflow studio</span>
      </footer>
    </main>

    <aside v-if="isWorkspacePage" class="side-rail hidden md:flex">
      <button class="active" @click="scrollToTop" title="首页">
        <n-icon :size="19"><SparklesOutline /></n-icon>
        <span>首页</span>
      </button>
      <button @click="enterBlankCanvas" title="进入画布">
        <n-icon :size="20"><AddOutline /></n-icon>
        <span>画布</span>
      </button>
      <button @click="scrollToProjects" title="我的项目">
        <n-icon :size="20"><DocumentOutline /></n-icon>
        <span>项目</span>
      </button>
      <button @click="scrollToInspiration" title="模板案例">
        <n-icon :size="20"><FolderOutline /></n-icon>
        <span>模板</span>
      </button>
      <button @click="showApiSettings = true" title="模型配置">
        <n-icon :size="20"><ColorPaletteOutline /></n-icon>
        <span>模型</span>
      </button>
      <button
        class="trash-rail-button"
        :class="{ 'is-drag-over': isTrashDragOver, 'has-items': deletedProjects.length }"
        @click="showTrashModal = true"
        @dragenter.prevent="isTrashDragOver = true"
        @dragover.prevent="isTrashDragOver = true"
        @dragleave.prevent="isTrashDragOver = false"
        @drop.prevent="dropProjectToTrash"
        title="最近删除"
      >
        <n-icon :size="20"><TrashOutline /></n-icon>
        <span>回收站</span>
        <b v-if="deletedProjects.length">{{ deletedProjects.length }}</b>
      </button>
    </aside>

    <aside v-if="showHomeRuntimeLogs" class="home-runtime-panel">
      <div class="home-runtime-head">
        <div>
          <p>RUN LOG</p>
          <h3>主页请求日志</h3>
        </div>
        <div>
          <button @click="clearRuntimeLogs">清空</button>
          <button @click="showHomeRuntimeLogs = false">×</button>
        </div>
      </div>
      <div v-if="runtimeLogs.length === 0" class="home-runtime-empty">
        暂无日志。主页对话、生图、读取链接和模型请求会记录在这里。
      </div>
      <div v-else class="home-runtime-list">
        <article
          v-for="log in runtimeLogs"
          :key="log.id"
          class="home-runtime-item"
          :class="`is-${log.level}`"
        >
          <div class="home-runtime-line">
            <strong>{{ log.level }}</strong>
            <span v-if="getHomeLogDuration(log)">{{ getHomeLogDuration(log) }}</span>
            <time>{{ formatHomeLogTime(log.timestamp) }}</time>
          </div>
          <p>{{ log.message }}</p>
          <pre v-if="getVisibleHomeLogMeta(log)">{{ getVisibleHomeLogMeta(log) }}</pre>
        </article>
      </div>
    </aside>

    <ApiSettings v-model:show="showApiSettings" @saved="refreshApiConfig" />

    <n-modal
      v-model:show="showOnboarding"
      preset="card"
      class="onboarding-modal"
      :bordered="false"
      :mask-closable="false"
    >
      <div class="onboarding-shell">
        <div class="onboarding-head">
          <div class="onboarding-orb">Y</div>
          <div>
            <p class="onboarding-kicker">FIRST RUN SETUP</p>
            <h2>先跑通，再创作。</h2>
            <p class="onboarding-desc">这不是说明书，是一次可执行初始化。按顺序完成配置、测试对话、进入画布，哪里没通就会直接指向下一步。</p>
          </div>
        </div>

        <div class="onboarding-progress">
          <div>
            <span>{{ onboardingReadyCount }}/{{ onboardingChecks.length }}</span>
            <b>初始化完成度</b>
          </div>
          <div class="onboarding-progress-track">
            <i :style="{ width: `${onboardingProgress}%` }"></i>
          </div>
        </div>

        <div class="onboarding-console">
          <article
            v-for="item in onboardingChecks"
            :key="item.key"
            class="onboarding-check"
            :class="{ 'is-ready': item.ready, 'is-primary': item.primary }"
          >
            <div class="check-index">{{ item.index }}</div>
            <div class="check-body">
              <div class="check-title">
                <h3>{{ item.title }}</h3>
                <span>{{ item.ready ? '已就绪' : '待完成' }}</span>
              </div>
              <p>{{ item.desc }}</p>
              <small>{{ item.detail }}</small>
            </div>
            <button @click="handleOnboardingAction(item.key)">
              {{ item.action }}
            </button>
          </article>
        </div>

        <div class="onboarding-footer">
          <p>建议第一次不要跳过：先用文本模型测试一句话，再进入画布生成，排查会快很多。</p>
          <div class="onboarding-actions">
            <button class="secondary-action" @click="dismissOnboarding">稍后再说</button>
            <button class="secondary-action" @click="startHomeTour">开始界面导览</button>
            <button class="primary-action" @click="completeOnboarding">完成并进入</button>
          </div>
        </div>
      </div>
    </n-modal>

    <GuidedTour
      v-model:show="showHomeTour"
      :steps="homeTourSteps"
      :storage-key="homeTourStorageKey"
      @finish="completeHomeTour"
      @skip="completeHomeTour"
    />

    <n-modal v-model:show="showRenameModal" preset="dialog" title="重命名项目">
      <n-input v-model:value="renameValue" placeholder="请输入项目名称" />
      <template #action>
        <n-button @click="showRenameModal = false">取消</n-button>
        <n-button type="primary" @click="confirmRename">确定</n-button>
      </template>
    </n-modal>

    <n-modal v-model:show="showDeleteModal" preset="dialog" title="删除项目" type="warning">
      <p>确定要将「{{ deleteTargetProject?.name || '未命名项目' }}」移到回收站吗？30 天后会自动永久删除。</p>
      <template #action>
        <n-button @click="cancelDeleteProject">取消</n-button>
        <n-button type="error" @click="confirmDeleteProject">移到回收站</n-button>
      </template>
    </n-modal>

    <n-modal v-model:show="showTrashModal" preset="card" class="trash-modal" :bordered="false">
      <div class="trash-panel">
        <div class="trash-head">
          <div>
            <p>RECENTLY DELETED</p>
            <h3>最近删除</h3>
            <span>项目会保留 30 天，之后自动永久删除。</span>
          </div>
          <button :disabled="!deletedProjects.length" @click="emptyTrash">清空回收站</button>
        </div>

        <div v-if="deletedProjects.length" class="trash-list">
          <div v-for="project in deletedProjects" :key="project.id" class="trash-item">
            <div class="trash-thumb">
              <template v-if="getProjectPreview(project)">
                <video
                  v-if="isVideoUrl(getProjectPreview(project))"
                  :src="getProjectPreview(project)"
                  muted
                  playsinline
                />
                <img v-else :src="getProjectPreview(project)" :alt="project.name" />
              </template>
              <n-icon v-else :size="24"><DocumentOutline /></n-icon>
            </div>
            <div class="trash-copy">
              <strong>{{ project.name }}</strong>
              <span>{{ formatDate(project.deletedAt) }} 删除 · {{ getTrashRemainingDays(project) }} 天后自动清理</span>
            </div>
            <div class="trash-actions">
              <button @click="restoreDeletedProject(project)">恢复</button>
              <button class="danger" @click="deleteForever(project)">永久删除</button>
            </div>
          </div>
        </div>

        <div v-else class="trash-empty">
          <n-icon :size="42"><TrashOutline /></n-icon>
          <h4>回收站是空的</h4>
          <p>从项目卡片点击删除，或把项目拖到侧边栏回收站。</p>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NDropdown, NIcon, NInput, NModal, NSpin } from 'naive-ui'
import {
  AddOutline,
  ColorPaletteOutline,
  CopyOutline,
  DocumentOutline,
  DocumentTextOutline,
  EllipsisHorizontalOutline,
  FolderOutline,
  ImageOutline,
  RefreshOutline,
  SearchOutline,
  SendOutline,
  SettingsOutline,
  SparklesOutline,
  ChatbubbleOutline,
  HelpCircleOutline,
  TrashOutline,
  VideocamOutline,
  CreateOutline
} from '@vicons/ionicons5'
import {
  projects,
  deletedProjects,
  initProjectsStore,
  createProject,
  updateProjectCanvas,
  deleteProject,
  restoreProject,
  permanentlyDeleteProject,
  emptyDeletedProjects,
  getTrashRemainingDays,
  duplicateProject,
  renameProject,
  deriveProjectThumbnail
} from '../stores/projects'
import { runtimeLogs, clearRuntimeLogs } from '../stores/canvas'
import { useModelStore } from '../stores/pinia'
import { useChat, useImageGeneration } from '../hooks'
import { getModelSizeOptions } from '../stores/models'
import { PROJECT_TYPES } from '../config/projectSchema'
import ApiSettings from '../components/ApiSettings.vue'
import AppHeader from '../components/AppHeader.vue'
import GuidedTour from '../components/GuidedTour.vue'
const showcaseBrand = './showcase/showcase-brand.png'
const showcaseStoryboard = './showcase/showcase-storyboard.png'
const showcaseVideo = './showcase/showcase-video.png'
import {
  CANVAS_PROMPT_SUGGESTIONS,
  HOME_CHAT_SUGGESTIONS,
  INSPIRATION_CASES,
  PROMPT_LIBRARY_SOURCE
} from '../config/promptLibrary'
import { WORKFLOW_TEMPLATES } from '../config/workflows'
import { COMPLEX_WORKFLOW_TEMPLATES } from '../config/complexWorkflows'

const router = useRouter()
const route = useRoute()
const modelStore = useModelStore()

const showApiSettings = ref(false)
const showHomeRuntimeLogs = ref(false)
const showOnboarding = ref(false)
const showHomeTour = ref(false)
const showDeleteModal = ref(false)
const showTrashModal = ref(false)
const isWorkspacePage = ref(false)
const activeMode = ref('create')
const homeViewMode = ref('chat')
const inputText = ref('')
const chatText = ref('')
const chatMessages = ref([])
const chatAttachments = ref([])
const chatHistory = ref([])
const activeChatId = ref('')
const chatImageModel = ref('')
const chatImageResolution = ref('auto')
const chatImageSize = ref('1024x1024')
const chatImageCount = ref(1)
const chatFileInputRef = ref(null)
const chatReadingUrls = ref(false)
const createTextareaRef = ref(null)
const chatTextareaRef = ref(null)
const focusedEntry = ref('create')
const showRenameModal = ref(false)
const renameValue = ref('')
const renameTargetId = ref(null)
const deleteTargetProject = ref(null)
const draggedProjectId = ref('')
const isTrashDragOver = ref(false)
const projectsSection = ref(null)
const inspirationSection = ref(null)
const homeShellRef = ref(null)
const videoRefs = new Map()

const isApiConfigured = computed(() => modelStore.hasAnyApiKey)
const isChatConfigured = computed(() => !!modelStore.currentChatApiKey && !!modelStore.selectedChatModel)
const isImageConfigured = computed(() => !!modelStore.currentImageApiKey && !!modelStore.selectedImageModel)
const isVideoConfigured = computed(() => !!modelStore.currentVideoApiKey && !!modelStore.selectedVideoModel)
const chatModelOptions = computed(() => modelStore.chatModelOptions)
const chatImageModelOptions = computed(() => modelStore.imageModelOptions)
const chatVideoModelOptions = computed(() => modelStore.videoModelOptions)
const homeRuntimeErrorCount = computed(() => runtimeLogs.value.filter((log) => log.level === 'error').length)
const effectiveChatImageModel = computed(() =>
  chatImageModel.value || modelStore.selectedImageModel || modelStore.availableImageModels[0]?.key || ''
)
const isChatImageConfigured = computed(() => !!modelStore.currentImageApiKey && !!effectiveChatImageModel.value)
const chatImageResolutionOptions = [
  { label: '自动', key: 'auto', target: 0 },
  { label: '720p', key: '720p', target: 1280 },
  { label: '1080p', key: '1080p', target: 1920 },
  { label: '2K', key: '2k', target: 2048 },
  { label: '4K', key: '4k', target: 4096 }
]
const safeChatImageSizeOptions = [
  { label: '1024x1024', key: '1024x1024' },
  { label: '1536x1024 (横版)', key: '1536x1024' },
  { label: '1024x1536 (竖版)', key: '1024x1536' }
]
const chatImageSizeOptions = computed(() => {
  const modelKey = effectiveChatImageModel.value || ''
  const model = modelStore.getImageModel?.(modelKey)
  const quality = chatImageResolution.value === '4k' ? '4k' : 'standard'

  if (model?.getSizesByQuality) {
    return model.getSizesByQuality(quality)
  }

  if (Array.isArray(model?.sizes) && model.sizes.length) {
    return model.sizes.map((size) => {
      const knownOption = getModelSizeOptions(modelKey, quality).find((item) => item.key === size)
      return knownOption || { label: size, key: size }
    })
  }

  return safeChatImageSizeOptions
})

const {
  loading: chatLoading,
  currentResponse,
  send: sendChat
} = useChat({
  systemPrompt: '你是 YUFENG Canvas 的创意助手。回答要直接、有帮助；如果用户在做视觉创作，可以主动给出可执行的提示词、镜头、构图、比例和下一步建议。'
})

const {
  loading: chatImageLoading,
  generate: generateChatImage
} = useImageGeneration()

const parseImageSizeValue = (value = '') => {
  const match = String(value).match(/^(\d+)x(\d+)$/)
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  return {
    width,
    height,
    longSide: Math.max(width, height),
    pixels: width * height
  }
}

const findClosestChatImageSize = (options = [], resolution = chatImageResolution.value) => {
  if (!options.length) return ''
  if (resolution === 'auto') return options[0]?.key || ''

  const target = chatImageResolutionOptions.find((item) => item.key === resolution)?.target
  if (!target) return options[0]?.key || ''

  const numericOptions = options
    .map((item) => ({
      ...item,
      meta: parseImageSizeValue(item.key)
    }))
    .filter((item) => item.meta)

  if (!numericOptions.length) return options[0]?.key || ''

  return numericOptions
    .sort((a, b) => Math.abs(a.meta.longSide - target) - Math.abs(b.meta.longSide - target))[0]?.key || options[0]?.key || ''
}

const getChatImageSizeLabel = (item) => {
  const meta = parseImageSizeValue(item.key)
  const base = item.label || item.key
  if (!meta || chatImageResolution.value === 'auto') return base

  const resolution = chatImageResolutionOptions.find((option) => option.key === chatImageResolution.value)?.label
  if (!resolution) return base

  const selectedTarget = chatImageResolutionOptions.find((option) => option.key === chatImageResolution.value)?.target || 0
  const isModelLimit = selectedTarget > 0 && meta.longSide < selectedTarget * 0.82
  return isModelLimit ? `${base} · 模型上限` : `${base} · ${resolution}匹配`
}

watch(() => modelStore.selectedImageModel, (model) => {
  if (!chatImageModel.value && model) {
    chatImageModel.value = model
  }
}, { immediate: true })

watch(chatImageModelOptions, (options = []) => {
  if (!options.length) {
    chatImageModel.value = ''
    return
  }

  if (chatImageModel.value && options.some((model) => model.key === chatImageModel.value)) {
    return
  }

  const selectedModel = options.find((model) => model.key === modelStore.selectedImageModel)
  chatImageModel.value = selectedModel?.key || options[0]?.key || ''
}, { immediate: true })

watch(chatImageSizeOptions, (options = []) => {
  if (!options.length) return
  const nextSize = findClosestChatImageSize(options)
  if (!options.some((item) => item.key === chatImageSize.value) || chatImageResolution.value !== 'auto') {
    chatImageSize.value = nextSize
  }
}, { immediate: true })

watch(chatImageResolution, () => {
  const nextSize = findClosestChatImageSize(chatImageSizeOptions.value)
  if (nextSize) {
    chatImageSize.value = nextSize
  }
})

const suggestionPool = CANVAS_PROMPT_SUGGESTIONS
const visibleSuggestions = ref([])
const chatSuggestions = HOME_CHAT_SUGGESTIONS
const inspirationCases = INSPIRATION_CASES
const awesomeCaseCount = inspirationCases.filter((item) => item.caseNumber || item.source).length
const inspirationSearch = ref('')
const inspirationCategory = ref('all')
const inspirationVisibleCount = ref(48)
const workflowSearch = ref('')
const workflowCategory = ref('all')
const workflowVisibleCount = ref(36)
const heroTypeLines = [
  '把想法变成图片、视频和短剧',
  '一句话搭建你的创作工作流',
  '从分镜、首帧到视频连续生成',
  '让 AI 帮你整理项目、素材和节点',
  '用云端模型完成专业视觉创作'
]
const heroTypeText = ref('')
const heroTypeIndex = ref(0)
const heroTypePhase = ref('idle')
const heroTypeCycle = ref(0)
const performanceLite = ref(false)
let heroTypeTimer = null
const onboardingStorageKey = 'yufeng-canvas-onboarding-v2'
const homeTourStorageKey = 'yufeng-canvas-home-tour-v1'
const chatHistoryStorageKey = 'yufeng-canvas-chat-history-v1'
const integratedLaunchCards = [
  {
    id: 'dramaShots',
    badge: 'Huobao Drama',
    title: '短剧项目 + 8 分镜',
    desc: '创建角色库、场景库、镜头表、首帧节点、视频节点和连线。',
    action: '生成短剧结构'
  },
  {
    id: 'cloudProWorkflow',
    badge: 'Cloud Professional',
    title: '云端专业文生图',
    desc: '使用云端模型专业参数（Steps、CFG、Sampler）生成高质量图片。',
    action: '创建专业工作流'
  },
  {
    id: 'productLaunch',
    badge: 'YUFENG Workflow',
    title: '产品发布全套物料',
    desc: '产品图、广告海报、社媒物料、TVC 首帧一次搭好。',
    action: '搭建生产链'
  },
  {
    id: 'image2video',
    badge: 'Video Pipeline',
    title: '首帧到视频链路',
    desc: '图片生成节点连接视频生成节点，适合短视频和分镜预演。',
    action: '创建视频链路'
  }
]
const recentHomeProjects = computed(() => projects.value.slice(0, 4))
const inspirationCategories = computed(() => {
  const categoryStats = inspirationCases.reduce((map, item) => {
    const key = item.categoryKey || item.category || 'other'
    const label = item.category || key
    const current = map.get(key) || { key, label, count: 0 }
    current.count += 1
    map.set(key, current)
    return map
  }, new Map())

  return [
    { key: 'all', label: '全部', count: inspirationCases.length },
    ...Array.from(categoryStats.values()).sort((a, b) => b.count - a.count)
  ]
})

const filteredInspirationCases = computed(() => {
  const query = inspirationSearch.value.trim().toLowerCase()
  return inspirationCases.filter((item) => {
    const categoryKey = item.categoryKey || item.category || 'other'
    const matchesCategory = inspirationCategory.value === 'all' || categoryKey === inspirationCategory.value
    if (!matchesCategory) return false
    if (!query) return true

    const haystack = [
      item.title,
      item.shortTitle,
      item.displayTitle,
      item.sourceTitle,
      item.category,
      item.displayExcerpt,
      item.useCase,
      item.aspectHint,
      item.difficulty,
      ...(item.promptTags || []),
      item.excerpt,
      item.prompt,
      item.caseNumber ? `case ${item.caseNumber}` : ''
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})

const visibleInspirationCases = computed(() => filteredInspirationCases.value.slice(0, inspirationVisibleCount.value))

const publicHomeWorkflows = computed(() => [...WORKFLOW_TEMPLATES, ...COMPLEX_WORKFLOW_TEMPLATES])

const workflowCategories = computed(() => {
  const all = publicHomeWorkflows.value
  const stats = all.reduce((map, workflow) => {
    const key = workflow.category || 'other'
    const current = map.get(key) || { key, label: getWorkflowCategoryLabel(key), count: 0 }
    current.count += 1
    map.set(key, current)
    return map
  }, new Map())

  return [
    { key: 'all', label: '全部', count: all.length },
    ...Array.from(stats.values()).sort((a, b) => b.count - a.count)
  ]
})

const filteredHomeWorkflows = computed(() => {
  const query = workflowSearch.value.trim().toLowerCase()
  return publicHomeWorkflows.value.filter((workflow) => {
    const matchesCategory = workflowCategory.value === 'all' || workflow.category === workflowCategory.value
    if (!matchesCategory) return false
    if (!query) return true
    return [
      workflow.name,
      workflow.description,
      workflow.category,
      workflow.complexity,
      workflow.sourceName,
      workflow.inputSummary,
      workflow.outputSummary,
      ...(workflow.parameters || [])
    ].filter(Boolean).join(' ').toLowerCase().includes(query)
  })
})

const visibleHomeWorkflows = computed(() => filteredHomeWorkflows.value.slice(0, workflowVisibleCount.value))

const loadMoreInspiration = () => {
  inspirationVisibleCount.value += 48
}

const resetInspirationFilters = () => {
  inspirationSearch.value = ''
  inspirationCategory.value = 'all'
  inspirationVisibleCount.value = 48
}

const getWorkflowCategoryLabel = (category) => {
  const labels = {
    image: '图片',
    video: '视频',
    drama: '短剧',
    ecommerce: '电商',
    character: '角色',
    poster: '海报',
    repair: '修复',
    professional: '专业',
    other: '其他'
  }
  return labels[category] || category || '其他'
}

const loadMoreWorkflows = () => {
  workflowVisibleCount.value += 36
}

const resetWorkflowFilters = () => {
  workflowSearch.value = ''
  workflowCategory.value = 'all'
  workflowVisibleCount.value = 36
}

const getHomeWorkflowNodeCount = (workflow) => {
  try {
    return workflow.createNodes({ x: 0, y: 0 })?.nodes?.length || 0
  } catch {
    return 0
  }
}

const useInspirationCase = async (item) => {
  homeViewMode.value = 'chat'
  chatText.value = item?.prompt || item?.originalPrompt || item?.excerpt || item?.title || ''
  await nextTick()
  chatTextareaRef.value?.focus?.()
}

const createProjectFromWorkflow = (workflow) => {
  if (!workflow?.id) return
  const id = createProject(workflow.name || '工作流项目', PROJECT_TYPES.MIXED)
  sessionStorage.setItem('yufeng-canvas-initial-action', JSON.stringify({
    action: 'workflowTemplate',
    workflowId: workflow.id
  }))
  router.push(`/canvas/${id}`)
}

watch([inspirationSearch, inspirationCategory], () => {
  inspirationVisibleCount.value = 48
})

watch([workflowSearch, workflowCategory], () => {
  workflowVisibleCount.value = 36
})

const heroTypeChars = computed(() => Array.from(heroTypeText.value))
const heroTypewriterAriaLabel = computed(() => {
  const fallback = heroTypeLines[heroTypeIndex.value] || heroTypeLines[0]
  return heroTypeText.value || fallback
})

const enterWorkspace = () => {
  isWorkspacePage.value = false
  activeMode.value = 'chat'
}

const handleWelcomeContinue = () => {
  activeMode.value = 'chat'
  nextTick(() => chatTextareaRef.value?.focus?.())
}

const handleWelcomeKeydown = (event) => {
  if (isWorkspacePage.value) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
  handleWelcomeContinue()
}

const createChatTitle = (messages = chatMessages.value) => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content)?.content || '新对话'
  return String(firstUserMessage).replace(/\s+/g, ' ').slice(0, 28)
}

const loadChatHistory = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(chatHistoryStorageKey) || '[]')
    chatHistory.value = Array.isArray(stored) ? stored.slice(0, 30) : []
  } catch {
    chatHistory.value = []
  }
}

const saveChatHistoryToStorage = () => {
  localStorage.setItem(chatHistoryStorageKey, JSON.stringify(chatHistory.value.slice(0, 30)))
}

const persistCurrentChat = () => {
  if (!chatMessages.value.length) return

  const now = Date.now()
  const id = activeChatId.value || `chat_${now}`
  activeChatId.value = id

  const session = {
    id,
    title: createChatTitle(),
    updatedAt: now,
    messages: chatMessages.value
  }

  chatHistory.value = [
    session,
    ...chatHistory.value.filter((item) => item.id !== id)
  ].slice(0, 30)
  saveChatHistoryToStorage()
}

const restoreChatSession = (id) => {
  const session = chatHistory.value.find((item) => item.id === id)
  if (!session) return

  enterWorkspace()
  homeViewMode.value = 'chat'
  activeMode.value = 'chat'
  activeChatId.value = id
  chatMessages.value = Array.isArray(session.messages) ? session.messages : []
  nextTick(() => chatTextareaRef.value?.focus?.())
}

const startNewChat = () => {
  persistCurrentChat()
  enterWorkspace()
  homeViewMode.value = 'chat'
  activeMode.value = 'chat'
  activeChatId.value = ''
  chatMessages.value = []
  chatText.value = ''
  chatAttachments.value = []
  nextTick(() => chatTextareaRef.value?.focus?.())
}

const formatChatTime = (value) => {
  if (!value) return '刚刚'
  const diff = Date.now() - value
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
}

const formatHomeLogTime = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

const getHomeLogDuration = (log) => {
  const value = log?.meta?.durationMs ?? log?.meta?.elapsedMs ?? log?.durationMs
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`
}

const getVisibleHomeLogMeta = (log) => {
  if (!log?.meta || !Object.keys(log.meta).length) return ''
  const hiddenKeys = new Set(['durationMs', 'elapsedMs'])
  const visibleMeta = Object.fromEntries(
    Object.entries(log.meta).filter(([key]) => !hiddenKeys.has(key))
  )
  return Object.keys(visibleMeta).length ? JSON.stringify(visibleMeta, null, 2) : ''
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

const detectPerformanceLite = () => {
  if (typeof window === 'undefined') return true

  const savedMode = localStorage.getItem('yufeng-canvas-performance-mode')
  if (savedMode === 'lite') return true
  if (savedMode === 'full') return false

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const lowCore = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4
  const largeScreen = window.innerWidth * window.innerHeight > 2_600_000
  const weakGraphics = !hasWebGLSupport()

  if (reduceMotion) return true

  const constrainedCpuAndMemory = lowCore && lowMemory
  const constrainedGraphics = weakGraphics && (lowCore || lowMemory)
  const overloadedViewport = largeScreen && constrainedCpuAndMemory

  return Boolean(constrainedCpuAndMemory || constrainedGraphics || overloadedViewport)
}

const shouldReduceHeroMotion = () => {
  if (typeof window === 'undefined') {
    return true
  }

  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const heroTypeSpeed = 112
const heroEraseSpeed = 82
const heroHoldDuration = 1900
const heroBetweenLinesDelay = 360
const heroInitialDelay = 420

const clearHeroTypeTimer = () => {
  if (typeof window === 'undefined') {
    return
  }

  if (heroTypeTimer) {
    window.clearTimeout(heroTypeTimer)
    heroTypeTimer = null
  }
}

const setHeroTypeTimer = (callback, delay) => {
  if (typeof window === 'undefined') {
    return
  }

  clearHeroTypeTimer()

  heroTypeTimer = window.setTimeout(() => {
    heroTypeTimer = null
    callback()
  }, delay)
}

const typeHeroLine = (lineIndex, charIndex = 0) => {
  if (typeof window === 'undefined') {
    return
  }

  const line = heroTypeLines[lineIndex]
  const chars = Array.from(line)

  heroTypePhase.value = 'typing'
  heroTypeText.value = chars.slice(0, charIndex).join('')

  if (charIndex < chars.length) {
    setHeroTypeTimer(() => {
      typeHeroLine(lineIndex, charIndex + 1)
    }, heroTypeSpeed)
    return
  }

  heroTypePhase.value = 'holding'

  setHeroTypeTimer(() => {
    eraseHeroLine(lineIndex, chars.length)
  }, heroHoldDuration)
}

const eraseHeroLine = (lineIndex, charIndex) => {
  if (typeof window === 'undefined') {
    return
  }

  const line = heroTypeLines[lineIndex]
  const chars = Array.from(line)

  heroTypePhase.value = 'erasing'
  heroTypeText.value = chars.slice(0, charIndex).join('')

  if (charIndex > 0) {
    setHeroTypeTimer(() => {
      eraseHeroLine(lineIndex, charIndex - 1)
    }, heroEraseSpeed)
    return
  }

  const nextIndex = (lineIndex + 1) % heroTypeLines.length

  heroTypeIndex.value = nextIndex
  heroTypeCycle.value += 1
  heroTypePhase.value = 'idle'

  setHeroTypeTimer(() => {
    typeHeroLine(nextIndex, 0)
  }, heroBetweenLinesDelay)
}

const startHeroTypewriter = () => {
  if (typeof window === 'undefined') {
    return
  }

  clearHeroTypeTimer()

  heroTypeIndex.value = 0
  heroTypeCycle.value += 1

  if (shouldReduceHeroMotion()) {
    heroTypeText.value = heroTypeLines[0]
    heroTypePhase.value = 'holding'
    return
  }

  heroTypeText.value = ''
  heroTypePhase.value = 'idle'

  setHeroTypeTimer(() => {
    typeHeroLine(0, 0)
  }, heroInitialDelay)
}

const stopHeroTypewriter = () => {
  clearHeroTypeTimer()
}

const handleHeroTypewriterVisibility = () => {
  if (typeof document === 'undefined') {
    return
  }

  if (!document.hidden) {
    startHeroTypewriter()
  }
}

const localApiLabel = computed(() => {
  const origin = 'http://127.0.0.1:43112'
  return window.desktopApp?.getLocalApiStatus ? `${origin}/mcp` : '桌面版启动后自动开放'
})

const onboardingChecks = computed(() => [
  {
    key: 'api',
    index: '01',
    title: '配置 Key / Base URL',
    desc: '先把自己的 API Key 和服务地址保存进去，图片、视频、对话可以共用，也可以分开填。',
    detail: isApiConfigured.value ? `当前渠道：${modelStore.currentProvider}` : '还没有检测到可用 Key',
    action: isApiConfigured.value ? '检查配置' : '立即配置',
    ready: isApiConfigured.value,
    primary: !isApiConfigured.value
  },
  {
    key: 'chat',
    index: '02',
    title: '测试文本模型',
    desc: '用首页对话发一条很短的请求，确认 AI 润色和 Chat 能正常调用。',
    detail: isChatConfigured.value ? `文本模型：${modelStore.selectedChatModel}` : '需要配置文本模型名和可用 Key',
    action: isChatConfigured.value ? '发送测试' : '去配置文本模型',
    ready: isChatConfigured.value,
    primary: isApiConfigured.value && !isChatConfigured.value
  },
  {
    key: 'image',
    index: '03',
    title: '准备图片工作流',
    desc: '检查图片模型后，一键创建一个文生图示例画布，进入后可直接点生成。',
    detail: isImageConfigured.value ? `图片模型：${modelStore.selectedImageModel}` : '需要添加图片模型名，比如供应商后台显示的模型',
    action: isImageConfigured.value ? '创建图片示例' : '去配置图片模型',
    ready: isImageConfigured.value,
    primary: isChatConfigured.value && !isImageConfigured.value
  },
  {
    key: 'video',
    index: '04',
    title: '准备视频工作流',
    desc: '视频模型通常是异步任务，建议配置后用短时长先测，失败时看右上角运行日志。',
    detail: isVideoConfigured.value ? `视频模型：${modelStore.selectedVideoModel}` : '可稍后配置视频模型，不影响先用图片功能',
    action: isVideoConfigured.value ? '创建视频示例' : '配置视频模型',
    ready: isVideoConfigured.value,
    primary: false
  },
  {
    key: 'mcp',
    index: '05',
    title: '本地 API / MCP',
    desc: '桌面端会启动本地接口，后面给 MCP、多 Agent、自动化工作流使用。',
    detail: localApiLabel.value,
    action: '复制 MCP 入口',
    ready: true,
    primary: false
  }
])

const onboardingReadyCount = computed(() => onboardingChecks.value.filter((item) => item.ready).length)
const onboardingProgress = computed(() => Math.round((onboardingReadyCount.value / onboardingChecks.value.length) * 100))

const homeTourSteps = [
  {
    target: '[data-tour="api-settings"]',
    title: '第一步：配置 API 和模型',
    body: '点击这里打开 API 设置。先填写 Base URL 和 API Key，再分别在“文本模型 / 图片模型 / 视频模型”里添加供应商后台显示的模型名，最后保存。',
    hint: '模型名要一字不差。比如后台叫 gpt-image-2-sp，软件里也必须填 gpt-image-2-sp。'
  },
  {
    target: '[data-tour="home-chat"]',
    title: '首页：先和文本模型聊清楚',
    body: '这里会直接调用你配置的文本模型。可以让它帮你拆创意、写提示词、整理分镜、判断一个需求应该走文生图还是图生视频。',
    hint: '这里不会直接扣图片/视频费用，只有发送给文本模型时才会产生文本模型请求。',
    side: 'left'
  },
  {
    target: '[data-tour="chat-composer"]',
    title: '输入框、附件和发送',
    body: '在这里输入问题，也可以上传图片、txt、md、json、csv 等参考资料。右侧发送按钮会把内容交给当前文本模型。',
    hint: '如果文本模型没有配置，点击发送会提示你回到 API 设置。'
  },
  {
    target: '[data-tour="start-create"]',
    title: '开始创作：先输入你的想法',
    body: '点击这里会把你引导到右侧的「生成工作流」输入框。输入一句需求后，再发送进入节点画布。',
    hint: '如果已经输入了创意，再次点击开始创作会沿用原有流程创建项目。',
    side: 'right'
  },
  {
    target: '[data-tour="quick-actions"]',
    title: '快捷入口：不用从零搭',
    body: '文生图、图生图、视频生成、节点工作流会直接创建对应方向的项目。适合第一次使用时快速验证模型是否能跑通。',
    side: 'top'
  },
  {
    target: '[data-tour="showcase"]',
    title: '常用场景案例',
    body: '这些卡片是可点击的案例入口，适合品牌主视觉、分镜故事、图生视频等常见需求。点击后会自动创建项目并把提示词带进画布。',
    side: 'top'
  },
  {
    target: '[data-tour="prompt-library"]',
    title: '提示词案例库',
    body: '这里沉淀了从开源案例整理来的提示词。用户可以直接点选，再把里面的产品、人物、镜头、比例、风格改成自己的需求。',
    side: 'top'
  },
  {
    target: '[data-tour="projects"]',
    title: '本地项目都在这里',
    body: '生成过的项目会保存在本机，之后可以继续打开、复制、重命名或删除。它不是云端空间，隐私和草稿都留在本地。',
    side: 'top'
  }
]

const featureCards = [
  {
    title: '文生图',
    icon: ImageOutline,
    prompt: '文生图：生成一张未来城市雨夜海报，霓虹灯、电影感构图、16:9 比例'
  },
  {
    title: '图生图',
    icon: ColorPaletteOutline,
    prompt: '图生图：基于参考图片重绘成高级商业海报风格，保持主体一致，增强光影和质感'
  },
  {
    title: '视频生成',
    icon: VideocamOutline,
    prompt: '视频生成：生成一个 5 秒短片，镜头缓慢推进，雨夜城市里一只发光小狐狸穿过巷子'
  },
  {
    title: '节点工作流',
    icon: DocumentOutline,
    prompt: '节点工作流：创建一个从提示词到图片再到视频的完整流程，包含文生图、图生视频和比例设置'
  }
]

const showcaseCards = [
  {
    title: '品牌主视觉',
    badge: 'Text to Image',
    desc: '把一句创意拆成提示词、比例和图片生成节点。',
    prompt: '为一个未来科技品牌生成主视觉，蓝黑色调，金属质感，适合发布会海报',
    image: showcaseBrand
  },
  {
    title: '分镜故事板',
    badge: 'Storyboard',
    desc: '一键生成多段文本，再串联图片节点形成分镜。',
    prompt: '生成一个 6 镜头短片分镜：雨夜城市里，一只发光小狐狸带主角穿过巷子',
    image: showcaseStoryboard
  },
  {
    title: '图生视频',
    badge: 'Image to Video',
    desc: '连接图片到视频节点，支持首帧、尾帧和比例设置。',
    prompt: '把图片做成 5 秒视频：镜头轻微推进，光线流动，画面保持高级质感',
    image: showcaseVideo
  }
]

const refreshSuggestions = () => {
  const shuffled = [...suggestionPool].sort(() => Math.random() - 0.5)
  visibleSuggestions.value = shuffled.slice(0, 5)
}

const randomFill = () => {
  inputText.value = suggestionPool[Math.floor(Math.random() * suggestionPool.length)]
}

const scrollPromptPanelIntoView = () => {
  document.querySelector('[data-tour="chat-composer"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const focusCreateEntry = async () => {
  activeMode.value = 'chat'
  focusedEntry.value = 'create'
  scrollPromptPanelIntoView()
  await nextTick()
  createTextareaRef.value?.focus?.()
}

const focusChatEntry = async () => {
  activeMode.value = 'chat'
  focusedEntry.value = 'chat'
  scrollPromptPanelIntoView()
  await nextTick()
  chatTextareaRef.value?.focus?.()
}

const handleStartCreateClick = async () => {
  enterWorkspace()
  if (activeMode.value === 'create' && inputText.value.trim()) {
    handleCreateWithInput()
    return
  }

  await focusCreateEntry()
}

const fillCreatePrompt = async (prompt) => {
  inputText.value = prompt
  await focusCreateEntry()
}

const fillChatPrompt = async (prompt) => {
  chatText.value = prompt
  await focusChatEntry()
}

const randomFillAndFocus = async () => {
  randomFill()
  await focusCreateEntry()
}

const handleComposerFocusOut = (entry, event) => {
  const relatedTarget = event.relatedTarget
  if (relatedTarget && event.currentTarget.contains(relatedTarget)) return

  if (focusedEntry.value === entry) {
    focusedEntry.value = null
  }
}

const refreshApiConfig = () => {}

const setVideoRef = (projectId, el) => {
  if (el) {
    videoRefs.set(projectId, el)
  } else {
    videoRefs.delete(projectId)
  }
}

const getProjectPreview = (project) => deriveProjectThumbnail(project)

const formatDate = (date) => {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const getProjectActions = () => [
  { label: '重命名', key: 'rename', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) },
  { label: '复制', key: 'duplicate', icon: () => h(NIcon, null, { default: () => h(CopyOutline) }) },
  { type: 'divider' },
  { label: '删除', key: 'delete', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }
]

const handleProjectAction = (key, project) => {
  if (key === 'rename') {
    renameTargetId.value = project.id
    renameValue.value = project.name
    showRenameModal.value = true
    return
  }

  if (key === 'duplicate') {
    const newId = duplicateProject(project.id)
    if (newId) window.$message?.success('项目已复制')
    return
  }

  if (key === 'delete') {
    requestDeleteProject(project)
  }
}

const requestDeleteProject = (project) => {
  deleteTargetProject.value = project
  showDeleteModal.value = true
}

const cancelDeleteProject = () => {
  showDeleteModal.value = false
  deleteTargetProject.value = null
}

const confirmDeleteProject = () => {
  const project = deleteTargetProject.value
  if (!project?.id) {
    cancelDeleteProject()
    return
  }

  const deleted = deleteProject(project.id)
  window.$message?.[deleted ? 'success' : 'warning'](deleted ? '已移到回收站，可在 30 天内恢复' : '项目不存在或已被删除')
  cancelDeleteProject()
}

const startProjectDrag = (project, event) => {
  draggedProjectId.value = project.id
  event?.dataTransfer?.setData?.('text/plain', project.id)
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const endProjectDrag = () => {
  draggedProjectId.value = ''
  isTrashDragOver.value = false
}

const dropProjectToTrash = (event) => {
  const projectId = event?.dataTransfer?.getData?.('text/plain') || draggedProjectId.value
  draggedProjectId.value = ''
  isTrashDragOver.value = false
  if (!projectId) return

  const deleted = deleteProject(projectId)
  window.$message?.[deleted ? 'success' : 'warning'](deleted ? '已拖入回收站' : '项目不存在或已被删除')
}

const restoreDeletedProject = (project) => {
  const restored = restoreProject(project.id)
  window.$message?.[restored ? 'success' : 'warning'](restored ? '项目已恢复' : '项目不存在或已被清理')
}

const deleteForever = (project) => {
  const deleted = permanentlyDeleteProject(project.id)
  window.$message?.[deleted ? 'success' : 'warning'](deleted ? '已永久删除' : '项目不存在或已被清理')
}

const emptyTrash = () => {
  const emptied = emptyDeletedProjects()
  window.$message?.[emptied ? 'success' : 'info'](emptied ? '回收站已清空' : '回收站已经是空的')
}

const confirmRename = () => {
  if (renameTargetId.value && renameValue.value.trim()) {
    renameProject(renameTargetId.value, renameValue.value.trim())
    window.$message?.success('已重命名')
  }
  showRenameModal.value = false
  renameTargetId.value = null
  renameValue.value = ''
}

const ensureConfigured = () => {
  if (isApiConfigured.value) return true
  showApiSettings.value = true
  window.$message?.warning('请先配置 DataEyes API Key 和模型名')
  return false
}

const createNewProject = () => {
  enterBlankCanvas()
}

const createIntegratedProject = (actionId) => {
  const specs = {
    dramaShots: {
      name: '短剧创作项目',
      type: PROJECT_TYPES.DRAMA,
      action: 'dramaShots'
    },
    cloudProWorkflow: {
      name: '云端专业文生图',
      type: PROJECT_TYPES.MIXED,
      action: 'cloudProWorkflow'
    },
    productLaunch: {
      name: '产品发布全套物料',
      type: PROJECT_TYPES.MIXED,
      action: 'productLaunch'
    },
    image2video: {
      name: '首帧到视频链路',
      type: PROJECT_TYPES.VIDEO,
      action: 'image2video'
    }
  }
  const spec = specs[actionId]
  if (!spec) {
    enterBlankCanvas()
    return
  }
  const id = createProject(spec.name, spec.type)
  sessionStorage.setItem('yufeng-canvas-initial-action', JSON.stringify({
    action: spec.action,
    createdAt: Date.now()
  }))
  sessionStorage.removeItem('ai-canvas-initial-prompt')
  router.push(`/canvas/${id}`)
}

const enterBlankCanvas = () => {
  const id = createProject('未命名项目')
  if (!localStorage.getItem('yufeng-canvas-canvas-tour-v1')) {
    sessionStorage.setItem('yufeng-canvas-start-canvas-tour', '1')
  }
  router.push(`/canvas/${id}`)
}

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

const triggerChatFilePicker = async () => {
  if (chatLoading.value) return

  await nextTick()
  const input = chatFileInputRef.value || document.getElementById('home-chat-file-input')

  if (!input) {
    window.$message?.error('没有找到上传入口，请重新打开页面后再试')
    return
  }

  input.value = ''
  input.click()
}

const handleChatFiles = async (event) => {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return

  const nextAttachments = []

  for (const file of files.slice(0, 6)) {
    if (file.size > 8 * 1024 * 1024) {
      window.$message?.warning(`${file.name} 超过 8MB，已跳过`)
      continue
    }

    try {
      if (file.type.startsWith('image/')) {
        nextAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          kind: 'image',
          name: file.name,
          url: await readFileAsDataUrl(file)
        })
      } else {
        nextAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          kind: 'text',
          name: file.name,
          text: await file.text()
        })
      }
    } catch (err) {
      window.$message?.error(`${file.name} 读取失败：${err.message || '未知错误'}`)
    }
  }

  chatAttachments.value = [...chatAttachments.value, ...nextAttachments].slice(0, 8)
}

const removeChatAttachment = (id) => {
  chatAttachments.value = chatAttachments.value.filter((item) => item.id !== id)
}

const extractUrls = (value = '') => {
  const matches = String(value).match(/https?:\/\/[^\s，。！？、)）\]}>"']+/gi) || []
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?，。；：！？]+$/, '')))].slice(0, 3)
}

const fetchReadableLinks = async (content, { silent = false } = {}) => {
  const urls = extractUrls(content).filter((url) =>
    !chatAttachments.value.some((item) => item.kind === 'text' && item.sourceUrl === url)
  )

  if (!urls.length || !window.desktopApp?.fetchUrlText) return []

  const readablePages = []
  for (const url of urls) {
    try {
      const page = await window.desktopApp.fetchUrlText(url)
      if (page?.text) {
        readablePages.push(page)
      }
    } catch (err) {
      if (!silent) {
        window.$message?.warning(`${url} 读取失败：${err.message || '未知错误'}`)
      }
    }
  }

  return readablePages
}

const readLinksIntoChat = async () => {
  const content = chatText.value.trim()
  if (!content || chatReadingUrls.value) return

  chatReadingUrls.value = true
  try {
    const pages = await fetchReadableLinks(content)
    if (!pages.length) {
      window.$message?.info('没有读取到新的网页内容')
      return
    }

    const attachments = pages.map((page) => ({
      id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'text',
      name: page.title ? `网页：${page.title}` : `网页：${page.url}`,
      text: `[网页资料]\n来源：${page.url}\n标题：${page.title || '无标题'}\n\n${page.text}`,
      sourceUrl: page.url
    }))

    chatAttachments.value = [...chatAttachments.value, ...attachments].slice(0, 8)
    window.$message?.success(`已读取 ${attachments.length} 个链接`)
  } finally {
    chatReadingUrls.value = false
  }
}

const buildChatPayload = (content, webContexts = []) => {
  const textAttachments = chatAttachments.value.filter((item) => item.kind === 'text')
  const imageAttachments = chatAttachments.value.filter((item) => item.kind === 'image')

  const attachmentText = textAttachments.map((item, index) => {
    const clipped = String(item.text || '').slice(0, 12000)
    return `\n\n[附件 ${index + 1}: ${item.name}]\n${clipped}`
  }).join('')

  const webText = webContexts.map((page, index) => {
    const clipped = String(page.text || '').slice(0, 16000)
    return `\n\n[网页资料 ${index + 1}]\n来源：${page.url}\n标题：${page.title || '无标题'}\n${clipped}`
  }).join('')

  return {
    content: content || '请分析我上传的素材，并给出创作建议。',
    modelContent: `${content || '请分析我上传的素材，并给出创作建议。'}${webText}${attachmentText}`,
    imageAttachments
  }
}

const shouldGenerateImageFromChat = (content) => {
  const text = String(content || '').trim().toLowerCase()
  if (!text) return false

  const explicitTextOnly = [
    '提示词',
    'prompt',
    '方案',
    '建议',
    '怎么写',
    '如何写',
    '不要生成',
    '先别生成',
    '先不要生成',
    '只给',
    '帮我写',
    '改写'
  ]
  if (explicitTextOnly.some((keyword) => text.includes(keyword))) return false

  const imageIntent = [
    '做一张',
    '生成一张',
    '画一张',
    '出一张',
    '来一张',
    '做张',
    '生成图片',
    '生成图',
    '做图片',
    '画图',
    '生图',
    '图片',
    '海报',
    '产品图',
    '角色图',
    '头像',
    '封面',
    '主视觉',
    '赛车图片'
  ]
  return imageIntent.some((keyword) => text.includes(keyword))
}

const submitHomeComposer = async () => {
  const content = chatText.value.trim()
  if (shouldGenerateImageFromChat(content)) {
    await generateImageFromComposer()
    return
  }
  await sendHomeChat()
}

const sendHomeChat = async () => {
  enterWorkspace()
  const content = chatText.value.trim()
  if ((!content && !chatAttachments.value.length) || chatLoading.value) return

  if (!isChatConfigured.value) {
    showApiSettings.value = true
    window.$message?.warning('请先配置文本模型和可用的 API Key')
    return
  }

  chatReadingUrls.value = true
  const webContexts = await fetchReadableLinks(content, { silent: true })
  chatReadingUrls.value = false

  const payload = buildChatPayload(content, webContexts)
  const attachmentNames = chatAttachments.value.map((item) => item.name)
  const webNames = webContexts.map((item) => item.title || item.url)

  const userMessage = {
    id: `user_${Date.now()}`,
    role: 'user',
    content: attachmentNames.length
      ? `${payload.content}\n\n附件：${attachmentNames.join('、')}${webNames.length ? `\n网页：${webNames.join('、')}` : ''}`
      : webNames.length
        ? `${payload.content}\n\n网页：${webNames.join('、')}`
      : payload.content
  }
  chatMessages.value.push(userMessage)
  chatText.value = ''
  chatAttachments.value = []

  try {
    const reply = await sendChat(payload.modelContent, true, {
      model: modelStore.selectedChatModel,
      images: payload.imageAttachments
    })
    if (reply) {
      chatMessages.value.push({
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: reply
      })
      persistCurrentChat()
    }
  } catch (err) {
    chatMessages.value.push({
      id: `error_${Date.now()}`,
      role: 'assistant',
      content: err.message || '对话失败，请检查模型名、API Key 或网络。'
    })
    persistCurrentChat()
  }
}

const normalizeImageUrl = (image) => {
  const value = image?.url || image?.image_url || image?.output_url || image?.b64_json || image?.base64 || ''
  if (!value) return ''
  if (String(value).startsWith('data:') || String(value).startsWith('http')) return value
  return `data:image/png;base64,${value}`
}

const buildChatImagePrompt = (text) => {
  const content = String(text || '').trim()
  return content || '\u751f\u6210\u4e00\u5f20\u9ad8\u8d28\u91cf\u5546\u4e1a\u89c6\u89c9\u56fe\u7247\uff0c\u4e3b\u4f53\u6e05\u6670\uff0c\u6784\u56fe\u7a33\u5b9a\uff0c\u7ec6\u8282\u4e30\u5bcc\u3002'
}

const cleanOptimizedImagePrompt = (value, fallback) => {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```(?:json|text|prompt)?/gi, '').replace(/```/g, ''))
    .replace(/^(prompt|提示词|优化后提示词)\s*[:：]/i, '')
    .trim()

  if (!text || text.length < 8) return fallback
  return text.slice(0, 3000)
}

const optimizeImagePromptWithChatModel = async (sourcePrompt, options = {}) => {
  const originalPrompt = buildChatImagePrompt(sourcePrompt)
  if (!isChatConfigured.value || !modelStore.selectedChatModel) {
    return { prompt: originalPrompt, optimized: false, plannerModel: '' }
  }

  try {
    const optimized = await sendChat(originalPrompt, true, {
      model: modelStore.selectedChatModel,
      images: options.referenceImages?.map((url) => ({ url })) || [],
      isolated: true,
      systemPrompt: [
        '\u4f60\u662f YUFENG Canvas \u7684\u56fe\u7247\u751f\u6210\u63d0\u793a\u8bcd\u89c4\u5212\u5668\u3002',
        '\u4efb\u52a1\uff1a\u5148\u7406\u89e3\u7528\u6237\u9700\u6c42\uff0c\u7136\u540e\u6539\u5199\u6210\u4e00\u6bb5\u9002\u5408\u56fe\u7247\u6a21\u578b\u76f4\u63a5\u751f\u6210\u7684\u63d0\u793a\u8bcd\u3002',
        '\u53ea\u8f93\u51fa\u6700\u7ec8\u63d0\u793a\u8bcd\uff0c\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981 Markdown\uff0c\u4e0d\u8981\u7ed9\u65b9\u6848\u5217\u8868\u3002',
        '\u63d0\u793a\u8bcd\u5e94\u5305\u542b\uff1a\u4e3b\u4f53\u3001\u573a\u666f\u3001\u98ce\u683c\u3001\u6784\u56fe\u3001\u5149\u7ebf\u3001\u955c\u5934\u3001\u7ec6\u8282\u3001\u8d28\u611f\u3002',
        '\u4f18\u5148\u4f7f\u7528\u4e2d\u6587\uff1b\u5fc5\u8981\u7684\u4e13\u4e1a\u98ce\u683c\u8bcd\u53ef\u4fdd\u7559\u82f1\u6587\u3002'
      ].join('\n')
    })
    const prompt = cleanOptimizedImagePrompt(optimized, originalPrompt)
    return {
      prompt,
      optimized: prompt !== originalPrompt,
      plannerModel: modelStore.selectedChatModel
    }
  } catch (err) {
    console.warn('[home] image prompt optimization failed, fallback to original prompt:', err)
    return { prompt: originalPrompt, optimized: false, plannerModel: modelStore.selectedChatModel }
  }
}

const buildChatImageRequestPrompt = (prompt) => {
  if (chatImageResolution.value === 'auto') return prompt

  const resolution = chatImageResolutionOptions.find((item) => item.key === chatImageResolution.value)?.label
  if (!resolution) return prompt

  return `${prompt}\n\n\u8d28\u91cf\u76ee\u6807\uff1a\u5c3d\u91cf\u63a5\u8fd1 ${resolution} \u7684\u6e05\u6670\u7ec6\u8282\uff1b\u5982\u679c\u5f53\u524d\u6a21\u578b\u5c3a\u5bf8\u53d7\u9650\uff0c\u8bf7\u6309\u6a21\u578b\u652f\u6301\u7684\u6700\u9ad8\u53ef\u7528\u5c3a\u5bf8\u751f\u6210\uff0c\u4fdd\u6301\u753b\u9762\u6e05\u6670\u3001\u7ec6\u8282\u5b8c\u6574\u3002`
}

const generateImageInChat = async (sourcePrompt, options = {}) => {
  enterWorkspace()

  if (!isChatImageConfigured.value) {
    showApiSettings.value = true
    window.$message?.warning('\u8bf7\u5148\u9009\u62e9\u56fe\u7247\u6a21\u578b\uff0c\u5e76\u914d\u7f6e\u53ef\u7528\u7684 API Key')
    return
  }

  const model = effectiveChatImageModel.value
  const originalPrompt = buildChatImagePrompt(options.originalPrompt || sourcePrompt)
  const promptPlan = await optimizeImagePromptWithChatModel(sourcePrompt, options)
  const imagePrompt = promptPlan.prompt
  const requestPrompt = buildChatImageRequestPrompt(imagePrompt)

  if (options.addUserMessage !== false) {
    chatMessages.value.push({
      id: `user_image_${Date.now()}`,
      role: 'user',
      content: [
        `\u751f\u6210\u56fe\u7247\uff1a${originalPrompt}`,
        `\u56fe\u7247\u6a21\u578b\uff1a${model}`,
        promptPlan.optimized && promptPlan.plannerModel
          ? `\u6587\u672c\u6a21\u578b\u5148\u89c4\u5212\uff1a${promptPlan.plannerModel}`
          : ''
      ].filter(Boolean).join('\n')
    })
  }

  try {
    const generated = await generateChatImage({
      model,
      prompt: requestPrompt,
      size: chatImageSize.value,
      n: chatImageCount.value,
      image: options.referenceImages || (options.referenceImage ? [options.referenceImage] : undefined)
    })

    const images = generated.map((item, index) => ({
      id: `chat_image_${Date.now()}_${index}`,
      url: normalizeImageUrl(item),
      prompt: requestPrompt,
      model,
      raw: item
    })).filter((item) => item.url)

    chatMessages.value.push({
      id: `assistant_image_${Date.now()}`,
      role: 'assistant',
      content: images.length
        ? `${promptPlan.optimized ? '\u5df2\u5148\u7528\u6587\u672c\u6a21\u578b\u4f18\u5316\u63d0\u793a\u8bcd\uff0c' : ''}\u5df2\u4f7f\u7528 ${model} \u751f\u6210 ${images.length} \u5f20\u56fe\u7247\u3002\u4f60\u53ef\u4ee5\u7ee7\u7eed\u53d8\u5316\u3001\u653e\u5927\u3001\u590d\u5236 Prompt \u6216\u653e\u5165\u753b\u5e03\u3002`
        : '\u56fe\u7247\u63a5\u53e3\u8fd4\u56de\u6210\u529f\uff0c\u4f46\u6ca1\u6709\u89e3\u6790\u5230\u56fe\u7247\u5730\u5740\u3002',
      prompt: requestPrompt,
      sourcePrompt: originalPrompt,
      plannerModel: promptPlan.plannerModel,
      model,
      images
    })
    persistCurrentChat()
  } catch (err) {
    chatMessages.value.push({
      id: `assistant_image_error_${Date.now()}`,
      role: 'assistant',
      content: err.message || '\u56fe\u7247\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u56fe\u7247\u6a21\u578b\u3001API Key \u6216\u8fd0\u884c\u65e5\u5fd7\u3002'
    })
    persistCurrentChat()
  }
}

const generateImageFromComposer = async () => {
  const content = chatText.value.trim()
  if (!content && !chatAttachments.value.length) return

  const payload = buildChatPayload(content)
  const referenceImages = payload.imageAttachments.map((item) => item.url).filter(Boolean)
  chatText.value = ''
  chatAttachments.value = []
  await generateImageInChat(payload.modelContent, {
    addUserMessage: true,
    referenceImages,
    originalPrompt: payload.content
  })
}

const varyChatImage = async (image) => {
  await generateImageInChat(`${image.prompt || ''}\n基于参考图生成一个变化版本，保持主体一致，调整构图、细节和氛围。`, {
    referenceImage: image.url,
    addUserMessage: false
  })
}

const upscaleChatImage = async (image) => {
  await generateImageInChat(`${image.prompt || ''}\n放大并增强细节，保持原图构图和主体一致，提升清晰度和质感。`, {
    referenceImage: image.url,
    addUserMessage: false
  })
}

const copyText = async (text) => {
  try {
    await navigator.clipboard?.writeText(text || '')
    window.$message?.success('已复制')
  } catch {
    window.$message?.info(text || '')
  }
}

const buildChatCanvasData = (image) => {
  const now = Date.now()
  const textId = `chat_text_${now}`
  const configId = `chat_config_${now}`
  const imageId = `chat_image_${now}`
  const prompt = image.prompt || ''
  const model = image.model || effectiveChatImageModel.value

  return {
    nodes: [
      {
        id: textId,
        type: 'text',
        position: { x: 120, y: 150 },
        data: { label: '聊天生图 Prompt', content: prompt, status: 'success', createdAt: now, updatedAt: now }
      },
      {
        id: configId,
        type: 'imageConfig',
        position: { x: 440, y: 150 },
        data: {
          label: '聊天生图配置',
          prompt,
          model,
          size: chatImageSize.value,
          count: chatImageCount.value,
          status: 'success',
          createdAt: now,
          updatedAt: now
        }
      },
      {
        id: imageId,
        type: 'image',
        position: { x: 760, y: 150 },
        data: {
          label: '聊天生成图片',
          url: image.url,
          prompt,
          model,
          size: chatImageSize.value,
          status: 'success',
          createdAt: now,
          updatedAt: now,
          publicProps: { name: '聊天生成图片' }
        }
      }
    ],
    edges: [
      { id: `edge_${textId}_${configId}`, source: textId, target: configId, sourceHandle: 'right', targetHandle: 'left', type: 'promptOrder', data: { promptOrder: 1 } },
      { id: `edge_${configId}_${imageId}`, source: configId, target: imageId, sourceHandle: 'right', targetHandle: 'left' }
    ],
    viewport: { x: 80, y: 60, zoom: 0.86 }
  }
}

const placeChatImageIntoCanvas = (image) => {
  const id = createProject((image.prompt || '聊天生图').slice(0, 24))
  updateProjectCanvas(id, buildChatCanvasData(image))
  router.push(`/canvas/${id}`)
}

const createFromTemplate = (prompt) => {
  inputText.value = prompt
  handleCreateWithInput()
}

const openImageExpert = (prompt = '') => {
  const value = String(prompt || '').trim()
  router.push({
    name: 'ImageExpert',
    query: value ? { prompt: value.slice(0, 1600) } : {}
  })
}

const openPromptSource = () => {
  if (window.desktopApp?.openExternal) {
    window.desktopApp.openExternal(PROMPT_LIBRARY_SOURCE.url)
    return
  }
  window.open(PROMPT_LIBRARY_SOURCE.url, '_blank', 'noopener,noreferrer')
}

const completeOnboarding = () => {
  showOnboarding.value = false
  localStorage.setItem(onboardingStorageKey, 'done')
}

const dismissOnboarding = () => {
  showOnboarding.value = false
}

const startHomeTour = () => {
  showOnboarding.value = false
  localStorage.setItem(onboardingStorageKey, 'done')
  activeMode.value = 'create'
  document.querySelector('.home-shell')?.scrollTo({ top: 0, behavior: 'smooth' })
  window.setTimeout(() => {
    showHomeTour.value = true
  }, 360)
}

const completeHomeTour = () => {
  localStorage.setItem(homeTourStorageKey, 'done')
}

const runOnboardingChatTest = async () => {
  if (!isChatConfigured.value) {
    showApiSettings.value = true
    window.$message?.warning('先配置文本模型和 Key，再做连通测试')
    return
  }

  showOnboarding.value = false
  activeMode.value = 'chat'
  chatText.value = '请用一句话回复：YUFENG Canvas 文本模型连接成功。'
  await sendHomeChat()
}

const copyMcpEndpoint = async () => {
  const endpoint = 'http://127.0.0.1:43112/mcp'
  try {
    await navigator.clipboard?.writeText(endpoint)
    window.$message?.success('已复制 MCP 入口')
  } catch {
    window.$message?.info(endpoint)
  }
}

const handleOnboardingAction = async (key) => {
  if (key === 'api' || (key === 'chat' && !isChatConfigured.value) || (key === 'image' && !isImageConfigured.value) || (key === 'video' && !isVideoConfigured.value)) {
    showApiSettings.value = true
    return
  }

  if (key === 'chat') {
    await runOnboardingChatTest()
    return
  }

  if (key === 'image') {
    completeOnboarding()
    createFromTemplate('文生图：生成一张未来城市雨夜海报，霓虹灯、电影感构图、16:9 比例，画面要有清晰主体和高级色彩')
    return
  }

  if (key === 'video') {
    completeOnboarding()
    createFromTemplate('文生视频：生成一个 5 秒镜头，雨夜城市街道中霓虹灯反射在地面，镜头缓慢推进，电影感，16:9')
    return
  }

  if (key === 'mcp') {
    await copyMcpEndpoint()
  }
}

const handleCreateWithInput = () => {
  const prompt = inputText.value.trim()
  const id = createProject(prompt ? prompt.slice(0, 24) : '未命名项目')
  sessionStorage.setItem('ai-canvas-initial-prompt', prompt)
  if (!localStorage.getItem('yufeng-canvas-canvas-tour-v1')) {
    sessionStorage.setItem('yufeng-canvas-start-canvas-tour', '1')
  }
  inputText.value = ''
  router.push(`/canvas/${id}`)
}

const openProject = (project) => {
  router.push(`/canvas/${project.id}`)
}

const isVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  return ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'].some((ext) => url.toLowerCase().includes(ext))
}

const scrollToProjects = async (behavior = 'smooth') => {
  enterWorkspace()
  await nextTick()
  const scrollBehavior = typeof behavior === 'string' ? behavior : 'smooth'
  projectsSection.value?.scrollIntoView({ behavior: scrollBehavior, block: 'start' })
}

const scrollToInspiration = () => {
  inspirationSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const scrollToTop = () => {
  document.querySelector('.home-shell')?.scrollTo({ top: 0, behavior: 'smooth' })
}

const handleHomeRouteIntent = async () => {
  if (route.query.section !== 'projects') return

  enterWorkspace()
  await nextTick()
  projectsSection.value?.scrollIntoView({ behavior: 'auto', block: 'start' })
}

onMounted(() => {
  performanceLite.value = detectPerformanceLite()
  initProjectsStore()
  loadChatHistory()
  refreshSuggestions()
  if (!localStorage.getItem(onboardingStorageKey)) {
    window.setTimeout(() => {
      showOnboarding.value = true
    }, 700)
  }
  document.addEventListener('visibilitychange', handleHeroTypewriterVisibility)
  window.addEventListener('keydown', handleWelcomeKeydown)
  startHeroTypewriter()
  handleHomeRouteIntent()
})

onUnmounted(() => {
  stopHeroTypewriter()
  document.removeEventListener('visibilitychange', handleHeroTypewriterVisibility)
  window.removeEventListener('keydown', handleWelcomeKeydown)
})
</script>

<style scoped>
.home-shell {
  position: relative;
  isolation: isolate;
  overflow-x: hidden;
  background: linear-gradient(135deg, #eef8f3 0%, #f9fbff 42%, #eef6ff 100%);
}

.dark .home-shell {
  background: linear-gradient(135deg, #030a12 0%, #041e1f 42%, #06101d 100%);
}

.home-shell.is-perf-lite {
  background: linear-gradient(135deg, #f4fbf8 0%, #f8fbff 48%, #eef6ff 100%);
}

.dark .home-shell.is-perf-lite {
  background: linear-gradient(135deg, #030a12 0%, #061a1b 48%, #07111f 100%);
}

.home-shell.is-perf-lite .mesh-grid {
  opacity: 0.16;
  transform: perspective(700px) rotateX(62deg) translateY(120px);
}

.home-shell.is-perf-lite .prompt-panel-glow {
  opacity: 0.24;
}

.home-shell.is-perf-lite .y-signal,
.home-shell.is-perf-lite .hero-prism {
  opacity: 0.26;
}

.y-signal {
  position: absolute;
  right: max(3vw, 34px);
  top: 112px;
  width: min(42vw, 560px);
  aspect-ratio: 1;
  opacity: 0.46;
  transform: rotate(-10deg);
}

.y-signal span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(91, 255, 208, 0.88), rgba(56, 189, 248, 0.65), transparent);
  transform-origin: 0 50%;
}

.y-signal span:nth-child(1) {
  transform: rotate(90deg) translateX(-2%);
}

.y-signal span:nth-child(2) {
  transform: rotate(214deg) translateX(-2%);
  animation-delay: 0.4s;
}

.y-signal span:nth-child(3) {
  transform: rotate(326deg) translateX(-2%);
  animation-delay: 0.8s;
}

.mesh-grid {
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  opacity: 0.26;
  background:
    linear-gradient(rgba(14, 165, 233, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(20, 184, 166, 0.16) 1px, transparent 1px);
  background-size: 58px 58px;
  transform: perspective(700px) rotateX(62deg) translateY(120px);
  transform-origin: bottom;
}

.home-header {
  position: sticky;
  top: 14px;
  width: min(1430px, calc(100vw - 32px));
  margin: 0 auto;
  z-index: 20;
  border: 1px solid rgba(255, 255, 255, 0.54);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.42));
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.dark .home-header {
  border-color: rgba(203, 255, 239, 0.13);
  background: linear-gradient(135deg, rgba(8, 16, 28, 0.72), rgba(8, 36, 36, 0.42));
  box-shadow: 0 24px 74px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 18px;
  padding: 4px 8px 4px 4px;
  text-align: left;
}

.brand-lockup:hover {
  background: rgba(34, 197, 94, 0.08);
  transform: translateY(-1px);
}

.brand-logo {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 143, 255, 0.28);
}

.brand-name {
  font-weight: 800;
  letter-spacing: 0.04em;
}

.brand-subtitle {
  margin-top: -2px;
  font-size: 11px;
  color: var(--text-secondary);
}

.header-pill,
.secondary-action,
.ghost-chip,
.new-project-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.68);
  border-radius: 999px;
  padding: 9px 14px;
}

.dark .header-pill,
.dark .secondary-action,
.dark .ghost-chip,
.dark .new-project-button {
  background: rgba(15, 23, 42, 0.66);
}

.header-pill:hover,
.secondary-action:hover,
.ghost-chip:hover,
.new-project-button:hover {
  border-color: var(--accent-color);
  transform: translateY(-1px);
}

.header-pill.is-ready {
  color: #0f9f5f;
  border-color: rgba(34, 197, 94, 0.35);
}

.home-log-badge {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  padding: 0 5px;
  color: #fff;
  background: #ef4444;
  font-size: 11px;
  line-height: 1;
}

.home-main {
  width: min(1440px, calc(100vw - 28px));
  margin: 0 auto;
  box-sizing: border-box;
  padding: clamp(6px, 1.4vh, 18px) clamp(18px, 3vw, 44px) 96px;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(28px, 3.1vw, 48px);
  align-items: center;
  min-height: calc(100vh - 150px);
  max-width: 100%;
  padding-top: clamp(6px, 1.2vh, 16px);
}

.home-main.is-workspace {
  width: min(1560px, calc(100vw - 28px));
  padding-top: 10px;
}

.workspace-brand-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 0 0 14px;
  border: 1px solid rgba(20, 184, 166, 0.18);
  border-radius: 22px;
  padding: 10px 14px;
  color: #082f2b;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.dark .workspace-brand-strip {
  color: #eafff8;
  background: rgba(5, 18, 32, 0.62);
  border-color: rgba(125, 249, 231, 0.18);
}

.workspace-brand-strip div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.workspace-brand-strip strong {
  font-size: 15px;
  font-weight: 950;
}

.workspace-brand-strip span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 750;
}

.workspace-brand-strip button,
.history-head button {
  border: 1px solid rgba(20, 184, 166, 0.26);
  border-radius: 999px;
  padding: 7px 11px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 800;
}

.dark .workspace-brand-strip button,
.dark .history-head button {
  background: rgba(15, 23, 42, 0.46);
}

.hero-grid.is-collapsed {
  grid-template-columns: minmax(220px, 280px) minmax(680px, 1fr);
  gap: 18px;
  align-items: stretch;
  min-height: auto;
}

.chat-history-panel {
  position: sticky;
  top: 96px;
  align-self: start;
  overflow: hidden;
  border: 1px solid rgba(20, 184, 166, 0.18);
  border-radius: 28px;
  min-height: 520px;
  max-height: calc(100vh - 140px);
  padding: 16px;
  background:
    radial-gradient(circle at 20% 0%, rgba(111, 247, 232, 0.18), transparent 34%),
    rgba(255, 255, 255, 0.54);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.dark .chat-history-panel {
  border-color: rgba(125, 249, 231, 0.16);
  background:
    radial-gradient(circle at 20% 0%, rgba(111, 247, 232, 0.12), transparent 36%),
    rgba(5, 18, 32, 0.68);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.24);
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.history-head div {
  display: grid;
  gap: 2px;
}

.history-head span {
  color: #0fb981;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.16em;
}

.history-head strong {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 950;
}

.history-list {
  display: grid;
  gap: 8px;
  overflow-y: auto;
  max-height: calc(100vh - 236px);
  padding-right: 4px;
}

.history-item {
  display: grid;
  gap: 5px;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 18px;
  padding: 11px 12px;
  text-align: left;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.38);
}

.history-item:hover,
.history-item.active {
  transform: translateY(-1px);
  border-color: rgba(20, 184, 166, 0.48);
  background: rgba(255, 255, 255, 0.66);
}

.dark .history-item {
  background: rgba(15, 23, 42, 0.36);
}

.dark .history-item:hover,
.dark .history-item.active {
  background: rgba(15, 23, 42, 0.62);
}

.history-item strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item span,
.history-empty {
  color: var(--text-secondary);
  font-size: 12px;
}

.history-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 260px;
  text-align: center;
  line-height: 1.6;
}

.hero-grid.is-collapsed .prompt-panel {
  transform: none;
}

.hero-grid.is-collapsed .mode-card {
  min-height: calc(100vh - 140px);
}

.eyebrow {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.3em;
  color: #0fb981;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.eyebrow-dot {
  display: inline-block;
  color: #68ffe2;
  font-size: 11px;
  line-height: 1;
}

.hero-copy h1 {
  max-width: min(100%, 620px);
  font-size: clamp(48px, 4.7vw, 78px);
  line-height: 0.98;
  letter-spacing: -0.07em;
  font-weight: 900;
  text-wrap: balance;
  overflow: visible;
  color: transparent;
  background:
    linear-gradient(135deg, #082f2b 0%, #0f172a 45%, #0891b2 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

.dark .hero-copy h1 {
  background:
    linear-gradient(135deg, #f8fffc 0%, #c9fff0 38%, #70d6ff 78%, #ffffff 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

.hero-copy {
  width: 100%;
  min-width: 0;
  max-width: 780px;
  margin: clamp(-62px, -5vh, -34px) auto 0;
  justify-self: center;
  opacity: 1;
}

.hero-title-typewriter {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: clamp(6px, 0.8vw, 12px);
  margin: 0;
  isolation: isolate;
  color: inherit;
  line-height: 0.94;
  letter-spacing: -0.04em;
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  width: 100%;
  max-width: 620px;
  padding-left: 2px;
}

.hero-title-typewriter::before {
  content: "";
  position: absolute;
  inset: -14px -22px;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(
      circle at 30% 55%,
      rgba(111, 247, 232, 0.16),
      rgba(111, 247, 232, 0) 58%
    );
  opacity: 0.58;
}

.hero-title-line {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  font-size: clamp(46px, 4.4vw, 78px);
  font-weight: 850;
  line-height: 0.98;
  white-space: nowrap;
}

.hero-title-line-static {
  color: #0a2430;
}

.dark .hero-title-line-static {
  color: #f4fbff;
}

.hero-title-line-typewriter {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  height: 1.1em;
  min-width: 8.5em;
  overflow: visible;
}

.hero-typewriter-text {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  min-width: 0;
  white-space: nowrap;
}

.hero-typewriter-char {
  display: inline-block;
  color: transparent;
  background-image:
    linear-gradient(
      92deg,
      #052e2b 0%,
      #064e3b 28%,
      #0f766e 54%,
      #0891b2 78%,
      #0f172a 100%
    );
  background-size: 220% 100%;
  background-position: 0% 50%;
  -webkit-background-clip: text;
  background-clip: text;
  animation:
    heroTypeCharIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both,
    heroTypeGradientDrift 8s ease-in-out infinite;
  animation-delay:
    0ms,
    0ms;
}

.dark .hero-typewriter-char {
  background-image:
    linear-gradient(
      92deg,
      #f7fdff 0%,
      #dffcff 20%,
      #8af7ef 46%,
      #35e0cf 72%,
      #dffcff 100%
    );
}

.hero-typewriter-text.is-erasing .hero-typewriter-char {
}

.hero-typewriter-cursor {
  display: inline-block;
  width: 0.27em;
  height: 0.27em;
  margin-left: 0.095em;
  border-radius: 999px;
  align-self: center;
  transform: translateY(0.01em);
  background: rgba(8, 47, 73, 0.86);
  opacity: 0.92;
}

.dark .hero-typewriter-cursor {
  background: rgba(221, 251, 255, 0.96);
}

@keyframes heroTypeCharIn {
  0% {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(0.22em) scale(0.98);
  }

  60% {
    opacity: 0.82;
    filter: blur(2px);
    transform: translateY(0.04em) scale(1.01);
  }

  100% {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
}

@keyframes heroTypeGradientDrift {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}

.hero-line {
  min-height: clamp(228px, 26vh, 260px);
}

.hero-copy-enter-active,
.hero-copy-enter-from {
  opacity: 0;
  transform: translateY(18px);
}

.hero-copy-leave-to {
  opacity: 0;
  transform: translateY(-14px);
}

.hero-desc {
  max-width: 560px;
  margin-top: 22px;
  color: color-mix(in srgb, var(--text-secondary) 82%, var(--text-primary));
  font-size: 16px;
  line-height: 1.9;
}

.feature-strip,
.prompt-footer,
.suggestion-cloud,
.section-title,
.project-meta {
  display: flex;
  align-items: center;
}

.welcome-continue {
  display: inline-flex;
  align-items: center;
  margin-top: 32px;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 999px;
  padding: 11px 16px;
  color: rgba(8, 47, 73, 0.72);
  background: rgba(255, 255, 255, 0.52);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.68);
  font-size: 13px;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.dark .welcome-continue {
  color: rgba(234, 255, 248, 0.78);
  background: rgba(5, 18, 32, 0.54);
  border-color: rgba(125, 249, 231, 0.18);
}

.primary-action,
.send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #19e58d 0%, #00b8ff 100%);
  color: #052b28;
  font-weight: 800;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 40px rgba(0, 183, 255, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.dark .primary-action,
.dark .send-button {
  color: #f8fffd;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
}

.primary-action::after,
.send-button::after {
  content: "";
  position: absolute;
  inset: -60% auto -60% -40%;
  width: 42%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.42), transparent);
  transform: skewX(-18deg);
  opacity: 0;
  pointer-events: none;
}

.primary-action:hover::after,
.send-button:hover::after {
  left: 125%;
  opacity: 0.42;
}

.primary-action {
  padding: 13px 20px;
}

.primary-action.small {
  padding: 10px 16px;
  font-size: 14px;
}

.send-button {
  width: 44px;
  height: 44px;
}

.primary-action:hover,
.send-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 24px 46px rgba(0, 163, 255, 0.28);
}

.send-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
  box-shadow: none;
}

.feature-strip {
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}

.feature-mini {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.42));
  border: 1px solid rgba(255, 255, 255, 0.42);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.feature-mini:hover {
  transform: translateY(-3px);
  border-color: rgba(0, 163, 255, 0.5);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 44px rgba(0, 163, 255, 0.14);
}

.dark .feature-mini {
  background: rgba(15, 23, 42, 0.58);
}

.prompt-panel {
  position: relative;
  min-width: 0;
}

.prompt-panel-glow {
  position: absolute;
  inset: -50px;
  background: rgba(0, 214, 255, 0.08);
  opacity: 0.8;
}

.hero-prism {
  position: absolute;
  right: -48px;
  top: -64px;
  width: 190px;
  height: 190px;
  z-index: 1;
  pointer-events: none;
}

.prism-core {
  position: absolute;
  inset: 34px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 42px;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.9), transparent 18%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(6, 78, 59, 0.72));
  color: #c8ffee;
  font-size: 58px;
  font-weight: 950;
  letter-spacing: -0.12em;
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.22);
  transform: rotate(-12deg);
}

.prism-chip {
  position: absolute;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.54);
  color: #063328;
  font-size: 11px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.dark .prism-chip {
  background: rgba(8, 20, 34, 0.66);
  color: #dffdf4;
}

.chip-one {
  left: 0;
  top: 22px;
}

.chip-two {
  right: 2px;
  top: 72px;
}

.chip-three {
  left: 30px;
  bottom: 8px;
}

.mode-card {
  position: relative;
  min-height: 660px;
  padding: 26px;
  z-index: 2;
  overflow: hidden;
  border-radius: 34px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(226, 249, 255, 0.48));
  border: 1px solid rgba(255, 255, 255, 0.62);
  box-shadow:
    0 34px 86px rgba(15, 23, 42, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.dark .mode-card {
  background: linear-gradient(135deg, rgba(5, 16, 28, 0.92), rgba(4, 36, 38, 0.72));
  border-color: rgba(202, 255, 244, 0.24);
  box-shadow:
    0 40px 112px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 0 1px rgba(112, 255, 231, 0.06);
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-width: 620px;
  margin-top: 28px;
}

.hero-metrics div {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.22));
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
}

.dark .hero-metrics div {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.58), rgba(6, 78, 59, 0.16));
  border-color: rgba(203, 255, 239, 0.12);
}

.hero-metrics strong,
.hero-metrics span {
  display: block;
}

.hero-metrics strong {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.hero-metrics span {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 26px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.38);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.dark .mode-tabs {
  border-color: rgba(203, 255, 239, 0.12);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.mode-tabs button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 22px;
  padding: 18px 20px;
  color: var(--text-secondary);
  font-weight: 800;
  text-align: left;
  background: rgba(255, 255, 255, 0.22);
}

.mode-tabs button > span,
.mode-tabs button strong,
.mode-tabs button small {
  display: block;
}

.mode-tabs button strong {
  color: var(--text-primary);
  font-size: 16px;
  letter-spacing: -0.02em;
}

.mode-tabs button small {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 650;
}

.mode-tabs button:hover {
  transform: translateY(-1px);
  border-color: rgba(86, 240, 220, 0.36);
}

.mode-tabs button.active {
  color: var(--text-primary);
  border-color: rgba(238, 252, 255, 0.88);
  background:
    radial-gradient(circle at 88% 12%, rgba(139, 245, 255, 0.28), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(236, 252, 255, 0.58));
  box-shadow:
    0 18px 44px rgba(14, 165, 233, 0.14),
    0 0 0 1px rgba(124, 246, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.dark .mode-tabs button.active {
  background:
    radial-gradient(circle at 88% 10%, rgba(116, 255, 236, 0.18), transparent 32%),
    linear-gradient(135deg, rgba(14, 27, 44, 0.96), rgba(9, 54, 55, 0.62));
  box-shadow:
    0 18px 50px rgba(0, 255, 234, 0.12),
    0 0 0 1px rgba(190, 255, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.mode-tabs button.active::after {
  content: "";
  position: absolute;
  inset: 0;
  padding: 1.2px;
  border-radius: inherit;
  pointer-events: none;
  background: rgba(62, 245, 232, 0.35);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

.chat-home,
.create-home {
  position: relative;
}

.integrated-launch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 4px 18px;
}

.integrated-launch-card {
  position: relative;
  min-height: 118px;
  padding: 14px;
  overflow: hidden;
  text-align: left;
  border: 1px solid rgba(20, 184, 166, 0.22);
  border-radius: 22px;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 92% 12%, rgba(45, 212, 191, 0.20), transparent 34%),
    rgba(255, 255, 255, 0.48);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.10);
}

.dark .integrated-launch-card {
  border-color: rgba(125, 249, 231, 0.16);
  background:
    radial-gradient(circle at 92% 12%, rgba(45, 212, 191, 0.16), transparent 34%),
    rgba(15, 23, 42, 0.46);
}

.integrated-launch-card:hover {
  transform: translateY(-2px);
  border-color: rgba(16, 185, 129, 0.62);
  box-shadow: 0 22px 54px rgba(5, 150, 105, 0.16);
}

.integrated-launch-card span,
.integrated-launch-card strong,
.integrated-launch-card small,
.integrated-launch-card b {
  display: block;
}

.integrated-launch-card span {
  margin-bottom: 8px;
  color: #0fb981;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.08em;
}

.integrated-launch-card strong {
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 900;
}

.integrated-launch-card small {
  min-height: 34px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.42;
}

.integrated-launch-card b {
  margin-top: 10px;
  color: #0891b2;
  font-size: 12px;
  font-weight: 900;
}

.integrated-inline-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: -8px 6px 16px;
}

.integrated-inline-actions button {
  min-height: 46px;
  border: 1px solid rgba(45, 212, 191, 0.34);
  border-radius: 16px;
  color: #062f2b;
  background: linear-gradient(135deg, rgba(52, 211, 153, 0.92), rgba(34, 211, 238, 0.72));
  font-size: 13px;
  font-weight: 900;
  box-shadow: 0 14px 34px rgba(20, 184, 166, 0.16);
}

.dark .integrated-inline-actions button {
  color: #eafffb;
  background: linear-gradient(135deg, rgba(5, 150, 105, 0.78), rgba(8, 145, 178, 0.58));
}

.primary-action.hot {
  background: linear-gradient(135deg, #34d399 0%, #22c55e 48%, #06b6d4 100%);
}

@media (max-width: 720px) {
  .integrated-launch-grid,
  .integrated-inline-actions {
    grid-template-columns: 1fr;
  }
}

.entry-copy {
  margin: 2px 8px 20px;
}

.entry-copy p {
  margin-bottom: 8px;
  color: #23e6b1;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.22em;
}

.entry-copy h3 {
  color: color-mix(in srgb, var(--accent-color) 78%, var(--text-primary));
  font-size: clamp(24px, 2.7vw, 34px);
  font-weight: 950;
  letter-spacing: -0.05em;
}

.entry-copy span {
  display: block;
  max-width: 620px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.75;
}

.chat-thread {
  min-height: 250px;
  max-height: 330px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 2px 12px;
}

.chat-empty {
  display: grid;
  place-items: center;
  min-height: 190px;
  text-align: center;
  color: var(--text-secondary);
}

.chat-empty h3 {
  display: none;
  margin-top: 14px;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 900;
}

.chat-empty p {
  display: none;
  max-width: 360px;
  margin-top: 8px;
  line-height: 1.7;
}

.chat-orb {
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  border-radius: 22px;
  background: radial-gradient(circle at 30% 20%, #ffffff, #8be7ff 38%, #16a34a 100%);
  color: #07111f;
  box-shadow: 0 20px 46px rgba(0, 163, 255, 0.26);
}

.chat-message {
  width: fit-content;
  max-width: 86%;
  border-radius: 18px;
  padding: 11px 13px;
  white-space: pre-wrap;
  line-height: 1.65;
  font-size: 14px;
}

.chat-message.user {
  align-self: flex-end;
  color: #fff;
  background: linear-gradient(135deg, #16a34a, #00a3ff);
}

.chat-message.assistant {
  align-self: flex-start;
  background: rgba(15, 23, 42, 0.06);
}

.chat-message:has(.chat-image-grid) {
  width: min(100%, 720px);
  max-width: 100%;
}

.dark .chat-message.assistant {
  background: rgba(255, 255, 255, 0.08);
}

.chat-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.chat-image-grid figure {
  overflow: hidden;
  margin: 0;
  border: 1px solid rgba(20, 184, 166, 0.22);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.52));
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
}

.dark .chat-image-grid figure {
  border-color: rgba(125, 249, 231, 0.22);
  background:
    linear-gradient(180deg, rgba(9, 22, 37, 0.82), rgba(6, 34, 38, 0.62));
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}

.chat-image-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: rgba(15, 23, 42, 0.08);
}

.chat-image-grid figcaption {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
}

.chat-image-grid figcaption button {
  border: 1px solid rgba(20, 184, 166, 0.28);
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  font-weight: 700;
}

.chat-image-grid figcaption button:hover {
  transform: translateY(-1px);
  border-color: rgba(20, 184, 166, 0.72);
  background: rgba(255, 255, 255, 0.86);
}

.dark .chat-image-grid figcaption button {
  background: rgba(15, 23, 42, 0.46);
}

.chat-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chat-action-row button {
  border: 1px solid rgba(20, 184, 166, 0.28);
  border-radius: 999px;
  padding: 5px 9px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.44);
  font-size: 12px;
}

.dark .chat-action-row button {
  background: rgba(15, 23, 42, 0.36);
}

.chat-action-row button:hover {
  transform: translateY(-1px);
  border-color: rgba(20, 184, 166, 0.75);
}

.chat-message.thinking {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.chat-composer {
  display: grid;
  grid-template-columns: 42px 42px 42px 1fr 44px;
  align-items: end;
  gap: 10px;
  border: 1px solid rgba(172, 205, 218, 0.34);
  border-radius: 22px;
  padding: 12px;
  background:
    radial-gradient(circle at 88% 50%, rgba(110, 247, 231, 0.12), transparent 28%),
    rgba(255, 255, 255, 0.64);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 14px 38px rgba(15, 23, 42, 0.1);
}

.image-generate-trigger {
  color: #052e2b;
  border-color: rgba(45, 212, 191, 0.44);
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.92), transparent 38%),
    linear-gradient(135deg, rgba(111, 247, 232, 0.94), rgba(0, 163, 255, 0.66));
  box-shadow: 0 14px 32px rgba(20, 184, 166, 0.24);
}

.chat-image-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 10px 2px 14px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.chat-model-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 2px 10px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 850;
}

.chat-model-row select,
.chat-model-row button {
  height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.64);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 750;
}

.chat-model-row select {
  min-width: min(280px, 100%);
  padding: 0 28px 0 12px;
}

.chat-model-row button {
  padding: 0 12px;
}

.dark .chat-model-row select,
.dark .chat-model-row button {
  border-color: rgba(125, 249, 231, 0.18);
  background: rgba(15, 23, 42, 0.48);
}

.home-runtime-panel {
  position: fixed;
  right: 22px;
  top: 92px;
  z-index: 80;
  width: min(410px, calc(100vw - 32px));
  max-height: calc(100vh - 122px);
  overflow: hidden;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 28px;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 16% 0%, rgba(45, 212, 191, 0.18), transparent 34%),
    rgba(255, 255, 255, 0.76);
  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.dark .home-runtime-panel {
  border-color: rgba(125, 249, 231, 0.18);
  background:
    radial-gradient(circle at 16% 0%, rgba(45, 212, 191, 0.14), transparent 34%),
    rgba(5, 18, 32, 0.78);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
}

.home-runtime-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.home-runtime-head p {
  margin: 0 0 3px;
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.16em;
}

.home-runtime-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.home-runtime-head div:last-child {
  display: flex;
  gap: 8px;
}

.home-runtime-head button {
  height: 30px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(148, 163, 184, 0.16);
  font-size: 12px;
  font-weight: 850;
}

.home-runtime-empty {
  padding: 18px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.home-runtime-list {
  max-height: calc(100vh - 210px);
  overflow-y: auto;
  padding: 12px;
}

.home-runtime-item {
  margin-bottom: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-left: 3px solid rgba(148, 163, 184, 0.72);
  border-radius: 18px;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.6);
}

.dark .home-runtime-item {
  background: rgba(2, 6, 23, 0.38);
}

.home-runtime-item.is-success {
  border-left-color: #22c55e;
}

.home-runtime-item.is-error {
  border-left-color: #ef4444;
}

.home-runtime-item.is-info {
  border-left-color: #38bdf8;
}

.home-runtime-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

.home-runtime-line strong {
  text-transform: uppercase;
  color: var(--text-primary);
}

.home-runtime-line time {
  margin-left: auto;
}

.home-runtime-item p {
  font-size: 13px;
  line-height: 1.55;
}

.home-runtime-item pre {
  margin-top: 8px;
  overflow-x: auto;
  white-space: pre-wrap;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.chat-image-controls select,
.chat-image-controls button {
  height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.64);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 750;
}

.chat-image-controls select {
  padding: 0 28px 0 12px;
}

.chat-image-controls .model-select {
  min-width: min(260px, 100%);
  max-width: 100%;
}

.chat-image-controls button {
  padding: 0 12px;
}

.chat-image-controls button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(20, 184, 166, 0.58);
  background: rgba(255, 255, 255, 0.86);
}

.chat-image-controls button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.dark .chat-image-controls select,
.dark .chat-image-controls button {
  border-color: rgba(125, 249, 231, 0.18);
  background: rgba(15, 23, 42, 0.48);
}

.create-composer {
  position: relative;
  display: grid;
  gap: 12px;
  border: 1px solid rgba(172, 205, 218, 0.34);
  border-radius: 28px;
  padding: 22px;
  background:
    radial-gradient(circle at 90% 70%, rgba(96, 255, 218, 0.14), transparent 32%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(232, 248, 252, 0.46));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 20px 54px rgba(15, 23, 42, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .hero-typewriter-char {
    animation: none;
  }

  .mode-tabs button.active::after {
    animation: none;
  }
}

@media (max-width: 1100px) {
  .home-main {
    width: min(100% - 22px, 920px);
    padding: 8px 18px 84px clamp(132px, 17vw, 156px);
  }

  .hero-grid {
    grid-template-columns: 1fr;
    align-items: start;
    min-height: auto;
    gap: 24px;
  }

  .hero-grid.is-collapsed {
    grid-template-columns: 1fr;
  }

  .chat-history-panel {
    position: relative;
    top: auto;
    min-height: auto;
    max-height: 260px;
  }

  .hero-copy {
    max-width: 620px;
    margin-top: -28px;
  }

  .hero-title-line {
    font-size: clamp(42px, 7.6vw, 62px);
  }

  .hero-line {
    min-height: 208px;
  }

  .hero-desc {
    max-width: 560px;
    margin-top: 16px;
    font-size: 15px;
    line-height: 1.75;
  }

}

.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  opacity: 0;
  pointer-events: none;
}

.attach-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.54);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.66);
}

.attach-button:hover:not(:disabled) {
  transform: translateY(-1px);
  color: var(--accent-color);
  border-color: rgba(34, 197, 94, 0.42);
  background: rgba(255, 255, 255, 0.78);
}

.attach-button.active {
  color: var(--accent-color);
  border-color: rgba(34, 197, 94, 0.44);
  background: rgba(220, 252, 231, 0.72);
}

.attach-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dark .attach-button {
  background: rgba(15, 23, 42, 0.48);
  border-color: rgba(148, 163, 184, 0.18);
}

.chat-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  border: 1px solid rgba(34, 197, 94, 0.24);
  border-radius: 999px;
  padding: 7px 9px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  font-size: 12px;
  font-weight: 700;
}

.attachment-chip button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  color: var(--text-secondary);
  background: rgba(15, 23, 42, 0.08);
  cursor: pointer;
}

.dark .attachment-chip {
  background: rgba(15, 23, 42, 0.52);
  border-color: rgba(74, 222, 128, 0.24);
}

.dark .chat-composer,
.dark .create-composer {
  border-color: rgba(203, 255, 239, 0.16);
  background:
    radial-gradient(circle at 92% 72%, rgba(79, 255, 216, 0.12), transparent 32%),
    linear-gradient(135deg, rgba(4, 15, 27, 0.68), rgba(7, 44, 48, 0.42));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 20px 54px rgba(0, 0, 0, 0.24);
}

.prompt-card-head {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 13px;
}

.shortcut {
  border-radius: 999px;
  padding: 4px 9px;
  background: rgba(15, 23, 42, 0.06);
}

.create-composer textarea,
.chat-composer textarea {
  width: 100%;
  resize: none;
  outline: none;
  border: 0;
  background: transparent;
  color: var(--text-primary);
}

.create-composer textarea {
  min-height: 168px;
  font-size: 16px;
  line-height: 1.7;
}

.chat-composer textarea {
  min-height: 46px;
  max-height: 140px;
  font-size: 14px;
  line-height: 1.6;
}

.prompt-footer {
  justify-content: space-between;
  gap: 10px;
}

.prompt-count {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.prompt-footer .ghost-chip {
  margin-left: auto;
}

.suggestion-cloud {
  position: relative;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
  color: var(--text-secondary);
}

.suggestion-cloud button {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  padding: 7px 11px;
  background: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  font-weight: 650;
}

.suggestion-cloud button:hover {
  transform: translateY(-1px);
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(255, 255, 255, 0.9);
}

.dark .suggestion-cloud button {
  background: rgba(15, 23, 42, 0.48);
}

.refresh-chip {
  display: inline-flex;
  align-items: center;
}

.panel-recent {
  margin-top: 26px;
}

.panel-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-section-head h3 {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
}

.panel-section-head button {
  color: var(--text-secondary);
  font-size: 13px;
}

.panel-section-head button:hover {
  color: var(--accent-color);
}

.panel-recent-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.panel-project-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  padding: 9px;
  text-align: left;
  background:
    radial-gradient(circle at 18% 0%, rgba(77, 255, 216, 0.12), transparent 35%),
    rgba(255, 255, 255, 0.36);
}

.panel-project-card:hover {
  transform: translateY(-3px);
  border-color: rgba(82, 238, 225, 0.46);
  background: rgba(255, 255, 255, 0.52);
}

.dark .panel-project-card {
  background:
    radial-gradient(circle at 18% 0%, rgba(77, 255, 216, 0.12), transparent 35%),
    rgba(15, 23, 42, 0.42);
  border-color: rgba(203, 255, 239, 0.12);
}

.panel-project-thumb {
  display: grid;
  aspect-ratio: 16 / 10;
  place-items: center;
  overflow: hidden;
  border-radius: 13px;
  color: var(--text-secondary);
  background:
    linear-gradient(135deg, rgba(18, 33, 53, 0.18), rgba(19, 107, 91, 0.16)),
    rgba(255, 255, 255, 0.2);
}

.panel-project-thumb img,
.panel-project-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.panel-project-card strong,
.panel-project-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-project-card strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
}

.panel-project-card span {
  color: var(--text-secondary);
  font-size: 12px;
}

.showcase-section,
.inspiration-section,
.projects-section {
  position: relative;
  z-index: 2;
  margin-top: 72px;
}

.section-title {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.brand-footer {
  position: relative;
  display: grid;
  width: 100vw;
  min-height: 270px;
  place-items: center;
  margin: 84px 0 0 calc(50% - 50vw);
  overflow: visible;
  text-align: center;
  perspective: 900px;
}

.brand-footer-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(84vw, 980px);
  height: 170px;
  border-radius: 999px;
  background: rgba(34, 255, 181, 0.06);
  transform: translate(-50%, -50%);
}

.brand-footer p {
  position: relative;
  margin: 0;
  color: rgba(15, 23, 42, 0.1);
  max-width: 96vw;
  font-size: min(15.2vw, 190px);
  font-weight: 950;
  letter-spacing: -0.082em;
  line-height: 0.82;
  white-space: nowrap;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.84),
    0 14px 32px rgba(20, 184, 166, 0.16),
    0 42px 90px rgba(15, 23, 42, 0.16);
  transform: rotateX(18deg) translateZ(-8px);
  transform-origin: center bottom;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.18);
}

.brand-footer span {
  position: absolute;
  bottom: 30px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  padding: 8px 13px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.dark .brand-footer p {
  color: rgba(230, 255, 247, 0.105);
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06),
    0 16px 40px rgba(45, 212, 191, 0.16),
    0 48px 120px rgba(0, 0, 0, 0.48);
  -webkit-text-stroke: 1px rgba(203, 255, 239, 0.045);
}

.dark .brand-footer span {
  background: rgba(15, 23, 42, 0.58);
}

.section-title h2 {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.section-desc {
  max-width: 600px;
  margin-top: 8px;
  color: var(--text-secondary);
  line-height: 1.75;
}

.source-link {
  padding: 10px 14px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
}

.source-link:hover {
  transform: translateY(-2px);
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(255, 255, 255, 0.86);
}

.dark .source-link {
  background: rgba(15, 23, 42, 0.58);
}

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.showcase-card {
  position: relative;
  height: 270px;
  overflow: hidden;
  border-radius: 34px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.16);
  transform: translateZ(0);
}

.showcase-card-1 {
  grid-column: span 3;
  height: 320px;
}

.showcase-card-2,
.showcase-card-3 {
  grid-column: span 3;
}

.showcase-card-3 {
  grid-column: span 6;
  height: 240px;
}

.showcase-card:hover {
  transform: translateY(-8px) scale(1.012);
  border-color: rgba(34, 255, 181, 0.55);
  box-shadow: 0 42px 110px rgba(4, 120, 87, 0.18);
}

.showcase-card::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0;
  background: linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.28) 45%, transparent 56%);
  transform: translateX(-50%);
}

.showcase-card:hover::after {
  opacity: 1;
  transform: translateX(45%);
}

.showcase-card img,
.project-thumb img,
.project-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.showcase-card:hover img {
  transform: scale(1.07);
}

.showcase-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 22px;
  color: white;
  background:
    radial-gradient(circle at 22% 18%, rgba(45, 212, 191, 0.2), transparent 34%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.03), rgba(2, 6, 23, 0.86));
}

.showcase-overlay span {
  width: fit-content;
  margin-bottom: 8px;
  border-radius: 999px;
  padding: 4px 9px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
}

.showcase-overlay h3 {
  font-size: 22px;
  font-weight: 900;
}

.showcase-overlay p {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 13px;
}

.showcase-overlay b {
  width: fit-content;
  margin-top: 14px;
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  font-weight: 850;
  transform: translateY(8px);
  opacity: 0;
}

.showcase-card:hover .showcase-overlay b {
  transform: translateY(0);
  opacity: 1;
}


.inspiration-toolbar {
  display: grid;
  gap: 12px;
  margin: 0 0 18px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.36);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}

.dark .inspiration-toolbar {
  background: rgba(15, 23, 42, 0.52);
  border-color: rgba(148, 163, 184, 0.22);
}

.inspiration-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.dark .inspiration-search {
  background: rgba(2, 6, 23, 0.42);
}

.inspiration-search input {
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.inspiration-search button,
.inspiration-more-row button {
  border: 1px solid rgba(34, 197, 94, 0.28);
  border-radius: 999px;
  padding: 7px 11px;
  background: rgba(34, 197, 94, 0.1);
  color: #047857;
  font-size: 12px;
  font-weight: 850;
}

.dark .inspiration-search button,
.dark .inspiration-more-row button {
  color: #86efac;
}

.inspiration-category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.inspiration-category-row button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
}

.dark .inspiration-category-row button {
  background: rgba(15, 23, 42, 0.55);
}

.inspiration-category-row button:hover,
.inspiration-category-row button.active {
  transform: translateY(-1px);
  border-color: rgba(34, 197, 94, 0.48);
  background: rgba(34, 197, 94, 0.12);
}

.inspiration-category-row button span {
  display: inline-grid;
  min-width: 22px;
  place-items: center;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-secondary);
}

.dark .inspiration-category-row button span {
  background: rgba(255, 255, 255, 0.08);
}

.inspiration-count {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 750;
}

.case-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.62);
  color: white;
  font-size: 11px;
  font-weight: 850;
}

.inspiration-image-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background: radial-gradient(circle at 35% 22%, rgba(34, 255, 181, 0.28), transparent 36%), linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(20, 184, 166, 0.34));
  color: white;
  font-size: 42px;
  font-weight: 950;
}

.inspiration-body small {
  display: block;
  margin-top: 10px;
  color: var(--text-tertiary, var(--text-secondary));
  font-size: 11px;
  font-weight: 750;
}

.inspiration-more-row {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}

.inspiration-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.inspiration-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.42));
  text-align: left;
  box-shadow: 0 22px 52px rgba(15, 23, 42, 0.1);
}

.inspiration-card::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0;
  background: rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.inspiration-card:hover {
  transform: translateY(-7px);
  border-color: rgba(34, 197, 94, 0.58);
  box-shadow: 0 34px 78px rgba(4, 120, 87, 0.15);
}

.inspiration-card:hover::before {
  opacity: 1;
}

.dark .inspiration-card {
  background: rgba(15, 23, 42, 0.58);
}

.inspiration-image {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.12);
}

.inspiration-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.inspiration-card:hover .inspiration-image img {
  transform: scale(1.06);
}

.inspiration-card.is-awesome-case .inspiration-image {
  background:
    radial-gradient(circle at 18% 8%, rgba(34, 255, 181, 0.13), transparent 34%),
    linear-gradient(135deg, rgba(241, 245, 249, 0.96), rgba(236, 253, 245, 0.72));
}

.inspiration-card.is-awesome-case .inspiration-image img {
  object-fit: contain;
  padding: 0;
}

.inspiration-card.is-awesome-case:hover .inspiration-image img {
  transform: scale(1.02);
}

.dark .inspiration-card.is-awesome-case .inspiration-image {
  background:
    radial-gradient(circle at 18% 8%, rgba(34, 255, 181, 0.1), transparent 34%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(6, 78, 59, 0.28));
}

.inspiration-body {
  padding: 14px;
}

.inspiration-category-pill {
  display: inline-flex;
  margin-bottom: 9px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #047857;
  font-size: 12px;
  font-weight: 800;
}

.dark .inspiration-category-pill {
  color: #86efac;
}

.inspiration-body h3 {
  font-size: 16px;
  font-weight: 900;
}

.inspiration-body p {
  display: -webkit-box;
  margin-top: 8px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.inspiration-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.inspiration-tags i {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.08);
  color: #0f766e;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.dark .inspiration-tags i {
  background: rgba(45, 212, 191, 0.12);
  color: #99f6e4;
}

.inspiration-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 11px;
  color: rgba(71, 85, 105, 0.78);
  font-size: 11px;
  font-weight: 800;
}

.inspiration-meta b,
.inspiration-meta em,
.inspiration-meta span {
  display: inline-flex;
  align-items: center;
  font-style: normal;
}

.inspiration-meta b,
.inspiration-meta em {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.1);
  color: #047857;
}

.dark .inspiration-meta {
  color: rgba(203, 213, 225, 0.78);
}

.dark .inspiration-meta b,
.dark .inspiration-meta em {
  background: rgba(34, 197, 94, 0.13);
  color: #86efac;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 56px 20px;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.54);
  color: var(--text-secondary);
}

.dark .empty-state {
  background: rgba(15, 23, 42, 0.48);
}

.empty-state h3 {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 800;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.project-card {
  position: relative;
  padding: 10px;
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.42)),
    radial-gradient(circle at 15% 0%, rgba(34, 255, 181, 0.12), transparent 34%);
  border: 1px solid rgba(255, 255, 255, 0.42);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.12);
}

.project-card[draggable="true"] {
  cursor: grab;
}

.project-card[draggable="true"]:active {
  cursor: grabbing;
}

.project-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: linear-gradient(120deg, transparent 0 34%, rgba(255, 255, 255, 0.28) 45%, transparent 56%);
  transform: translateX(-45%);
  pointer-events: none;
}

.project-card:hover {
  transform: translateY(-6px);
  border-color: rgba(34, 255, 181, 0.48);
  box-shadow: 0 32px 82px rgba(4, 120, 87, 0.16);
}

.project-card:hover::before {
  opacity: 1;
  transform: translateX(55%);
}

.dark .project-card {
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.64), rgba(6, 78, 59, 0.22)),
    radial-gradient(circle at 15% 0%, rgba(34, 255, 181, 0.1), transparent 34%);
  border-color: rgba(203, 255, 239, 0.12);
}

.project-thumb {
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 22px;
  background:
    radial-gradient(circle at 50% 10%, rgba(125, 211, 252, 0.16), transparent 35%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.12));
  cursor: pointer;
}

.project-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--text-secondary);
  position: relative;
}

.project-placeholder::before {
  content: "Y";
  position: absolute;
  color: rgba(34, 197, 94, 0.1);
  font-size: 80px;
  font-weight: 950;
  line-height: 1;
  transform: rotate(-12deg);
}

.project-meta {
  justify-content: space-between;
  gap: 8px;
  padding: 10px 2px 0;
}

.project-open {
  min-width: 0;
  text-align: left;
}

.project-open span,
.project-open small {
  display: block;
}

.project-open span {
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-open small {
  color: var(--text-secondary);
}

.project-delete,
.project-menu,
.side-rail button {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: var(--text-secondary);
}

.project-delete,
.project-menu {
  width: 34px;
  height: 34px;
}

.project-delete {
  color: color-mix(in srgb, #ef4444 68%, var(--text-secondary));
  opacity: 1;
  width: auto;
  min-width: 54px;
  gap: 4px;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 800;
}

.project-delete:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.project-menu:hover,
.side-rail button:hover {
  background: rgba(34, 197, 94, 0.12);
  color: var(--accent-color);
}

.side-rail {
  position: fixed;
  left: clamp(14px, 1.6vw, 24px);
  top: 50%;
  z-index: 15;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.46), rgba(240, 253, 250, 0.18));
  box-shadow: 0 18px 54px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.42);
  opacity: 0.72;
  transform: translateY(-50%);
}

.side-rail:hover {
  opacity: 0.96;
  border-color: rgba(148, 163, 184, 0.34);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(240, 253, 250, 0.34));
}

.trash-rail-button {
  position: relative;
}

.trash-rail-button.has-items {
  color: color-mix(in srgb, #ef4444 58%, var(--text-secondary));
}

.trash-rail-button.is-drag-over {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(239, 68, 68, 0.36);
  transform: scale(1.04);
}

.trash-rail-button b {
  position: absolute;
  top: 3px;
  right: 6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 950;
  line-height: 16px;
}

.trash-modal {
  width: min(760px, calc(100vw - 32px));
  border-radius: 30px;
  overflow: hidden;
}

.trash-panel {
  color: var(--text-primary);
}

.trash-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.trash-head p {
  margin: 0 0 6px;
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.18em;
}

.trash-head h3 {
  margin: 0;
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.05em;
}

.trash-head span {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
}

.trash-head button,
.trash-actions button {
  border-radius: 14px;
  padding: 9px 12px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
}

.dark .trash-head button,
.dark .trash-actions button {
  background: rgba(255, 255, 255, 0.08);
}

.trash-head button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.trash-list {
  display: grid;
  gap: 10px;
}

.trash-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.54);
}

.dark .trash-item {
  background: rgba(15, 23, 42, 0.56);
}

.trash-thumb {
  display: grid;
  place-items: center;
  width: 72px;
  height: 54px;
  overflow: hidden;
  border-radius: 15px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
}

.trash-thumb img,
.trash-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.trash-copy {
  min-width: 0;
}

.trash-copy strong,
.trash-copy span {
  display: block;
}

.trash-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-copy span {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.trash-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.trash-actions .danger {
  color: #ef4444;
}

.trash-empty {
  display: grid;
  place-items: center;
  padding: 48px 16px;
  color: var(--text-secondary);
  text-align: center;
}

.trash-empty h4 {
  margin: 12px 0 4px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
}

.trash-empty p {
  margin: 0;
}

.dark .side-rail {
  border-color: rgba(203, 255, 239, 0.1);
  background:
    linear-gradient(135deg, rgba(7, 17, 30, 0.5), rgba(6, 54, 50, 0.2));
  box-shadow: 0 22px 68px rgba(0, 0, 0, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.dark .side-rail:hover {
  border-color: rgba(203, 255, 239, 0.2);
  background:
    linear-gradient(135deg, rgba(7, 17, 30, 0.74), rgba(6, 54, 50, 0.34));
}

.side-rail button {
  position: relative;
  width: 56px;
  min-height: 58px;
  flex-direction: column;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
}

.side-rail button span {
  font-size: 12px;
  font-weight: 800;
}

.side-rail button.active {
  color: #063328;
  border-color: rgba(175, 255, 245, 0.56);
  background:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.66), transparent 28%),
    linear-gradient(135deg, rgba(38, 231, 168, 0.82), rgba(0, 183, 255, 0.6));
  box-shadow: 0 14px 34px rgba(0, 183, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.38);
}

.dark .side-rail button.active {
  color: #f8fffd;
}

:global(.onboarding-modal.n-card) {
  width: min(920px, calc(100vw - 32px));
  overflow: hidden;
  border-radius: 36px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(236, 253, 245, 0.7));
  box-shadow: 0 38px 120px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

:global(.dark .onboarding-modal.n-card) {
  background: linear-gradient(135deg, rgba(12, 22, 36, 0.94), rgba(7, 34, 36, 0.82));
}

:global(.onboarding-modal .n-card__content) {
  padding: 0;
}

.onboarding-shell {
  padding: 30px;
}

.onboarding-head {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.onboarding-orb {
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 28px;
  color: #062c2a;
  background:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.95), transparent 30%),
    linear-gradient(135deg, #dffef7, #55f5b6 52%, #38bdf8);
  box-shadow: 0 26px 70px rgba(17, 216, 197, 0.34);
  font-size: 36px;
  font-weight: 950;
  letter-spacing: -0.08em;
}

.onboarding-kicker {
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.2em;
}

.onboarding-shell h2 {
  margin-top: 6px;
  color: var(--text-primary);
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1;
  font-weight: 950;
  letter-spacing: -0.06em;
}

.onboarding-desc {
  max-width: 540px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.8;
}

.onboarding-progress {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  margin-top: 22px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.46);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.dark .onboarding-progress {
  background: rgba(2, 12, 23, 0.32);
  border-color: rgba(203, 255, 239, 0.12);
}

.onboarding-progress span,
.onboarding-progress b {
  display: block;
}

.onboarding-progress span {
  color: var(--accent-color);
  font-size: 22px;
  font-weight: 950;
}

.onboarding-progress b {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.onboarding-progress-track {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  box-shadow: inset 0 1px 4px rgba(15, 23, 42, 0.16);
}

.dark .onboarding-progress-track {
  background: rgba(255, 255, 255, 0.08);
}

.onboarding-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #55f5b6, #11d8c5 52%, #38bdf8);
}

.onboarding-console {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.onboarding-check {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74), 0 18px 46px rgba(15, 23, 42, 0.08);
}

.dark .onboarding-check {
  background: rgba(2, 12, 23, 0.36);
  border-color: rgba(203, 255, 239, 0.12);
}

.onboarding-check.is-ready {
  border-color: rgba(34, 197, 94, 0.32);
}

.onboarding-check.is-primary {
  border-color: rgba(85, 245, 182, 0.72);
  box-shadow: 0 22px 70px rgba(17, 216, 197, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.check-index {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 18px;
  color: var(--accent-color);
  background: rgba(34, 197, 94, 0.12);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.14em;
}

.check-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.check-title h3 {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
}

.check-title span {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  color: #047857;
  background: rgba(34, 197, 94, 0.12);
  font-size: 11px;
  font-weight: 850;
}

.onboarding-check:not(.is-ready) .check-title span {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

.check-body p {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.check-body small {
  display: block;
  margin-top: 6px;
  color: color-mix(in srgb, var(--text-secondary) 76%, var(--accent-color));
  font-size: 12px;
  font-weight: 750;
}

.onboarding-check button {
  min-width: 128px;
  height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 999px;
  color: #052e2b;
  background:
    radial-gradient(circle at 22% 0%, rgba(255, 255, 255, 0.8), transparent 42%),
    linear-gradient(135deg, #dffef7, #55f5b6 52%, #38bdf8);
  box-shadow: 0 16px 36px rgba(17, 216, 197, 0.2);
  font-size: 13px;
  font-weight: 900;
}

.onboarding-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-top: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.onboarding-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 0;
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .hero-grid,
  .inspiration-grid,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .showcase-grid {
    grid-template-columns: 1fr;
  }

  .showcase-card-1,
  .showcase-card-2,
  .showcase-card-3 {
    grid-column: auto;
    height: 250px;
  }

  .home-main {
    width: min(100% - 24px, 720px);
    padding: 8px 18px 80px clamp(132px, 17vw, 150px);
  }

  .hero-title-line {
    font-size: clamp(38px, 7.4vw, 58px);
    line-height: 1.02;
  }

  .hero-line {
    min-height: 206px;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .hero-prism {
    display: none;
  }

  .onboarding-head,
  .onboarding-progress,
  .onboarding-check,
  .onboarding-footer {
    grid-template-columns: 1fr;
  }

  .onboarding-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 767px) {
  .home-main {
    width: min(100% - 22px, 680px);
    padding: 22px 14px 76px;
  }

  .hero-title-line {
    font-size: clamp(34px, 10vw, 48px);
  }
}

/* Minimal home skin: keep the product functional, remove visual noise. */
.home-shell,
.home-shell.is-perf-lite {
  background: var(--bg-primary);
}

.dark .home-shell,
.dark .home-shell.is-perf-lite {
  background: #050b14;
}

.y-signal,
.mesh-grid,
.hero-prism,
.prompt-panel-glow,
.welcome-continue,
.hero-metrics,
.feature-strip {
  display: none !important;
}

.home-header {
  top: 0;
  width: 100%;
  border-width: 0 0 1px;
  border-radius: 0;
  background: var(--bg-primary);
  box-shadow: none;
}

.dark .home-header {
  background: #050b14;
  box-shadow: none;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  box-shadow: none;
}

.brand-subtitle,
.hero-eyebrow {
  display: none;
}

.home-main {
  width: min(1120px, calc(100vw - 32px));
  padding: 28px 18px 64px;
}

.home-main.is-workspace {
  width: min(1280px, calc(100vw - 32px));
}

.hero-grid {
  min-height: auto;
  gap: 22px;
  padding-top: 22px;
}

.hero-grid.is-collapsed {
  grid-template-columns: minmax(190px, 240px) minmax(0, 1fr);
}

.hero-copy {
  max-width: 760px;
}

.hero-line {
  min-height: 150px;
}

.hero-title-line {
  font-size: clamp(40px, 6vw, 76px);
}

.hero-title-typewriter::before {
  display: none;
}

.hero-desc {
  max-width: 620px;
  margin-top: 14px;
  font-size: 15px;
  line-height: 1.75;
}

.mode-card,
.workspace-brand-strip,
.inspiration-toolbar,
.project-card,
.inspiration-card,
.showcase-card,
.empty-state,
::global(.onboarding-modal.n-card) {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  box-shadow: none;
}

.dark .mode-card,
.dark .workspace-brand-strip,
.dark .inspiration-toolbar,
.dark .project-card,
.dark .inspiration-card,
.dark .showcase-card,
.dark .empty-state,
::global(.dark .onboarding-modal.n-card) {
  background: #07111f;
  box-shadow: none;
}

.mode-card {
  min-height: auto;
  padding: 18px;
  border-radius: 20px;
}

.mode-tabs {
  gap: 6px;
  margin-bottom: 14px;
  padding: 4px;
  border-radius: 16px;
  background: var(--bg-secondary);
  box-shadow: none;
}

.mode-tabs button {
  gap: 8px;
  min-height: 46px;
  border-radius: 12px;
  padding: 10px 12px;
  background: transparent;
}

.mode-tabs button small,
.integrated-launch-card small,
.entry-copy span,
.section-desc,
.inspiration-tags,
.inspiration-meta {
  display: none;
}

.mode-tabs button.active,
.dark .mode-tabs button.active {
  background: var(--bg-primary);
  box-shadow: none;
}

.mode-tabs button.active::after {
  display: none;
}

.quick-canvas-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.integrated-launch-grid,
.integrated-inline-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0 14px;
}

.integrated-launch-card,
.integrated-inline-actions button {
  min-height: auto;
  border-radius: 14px;
  padding: 11px 12px;
  background: var(--bg-secondary);
  box-shadow: none;
}

.integrated-launch-card:hover,
.mode-tabs button:hover,
.showcase-card:hover,
.inspiration-card:hover,
.project-card:hover,
.source-link:hover,
.new-project-button:hover,
.secondary-action:hover,
.ghost-chip:hover,
.header-pill:hover {
  transform: none;
  box-shadow: none;
}

.integrated-launch-card span,
.integrated-launch-card b {
  margin: 0;
  font-size: 11px;
}

.integrated-launch-card strong {
  margin: 4px 0;
  font-size: 14px;
}

.chat-thread {
  max-height: 260px;
}

.chat-image-controls,
.suggestion-cloud {
  gap: 6px;
  margin-top: 10px;
}

.showcase-section,
.inspiration-section,
.projects-section {
  margin-top: 36px;
}

.section-title {
  margin-bottom: 12px;
}

.section-title h2 {
  font-size: 21px;
}

.showcase-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.showcase-card,
.showcase-card-1,
.showcase-card-2,
.showcase-card-3 {
  grid-column: auto;
  height: 168px;
  border-radius: 18px;
}

.showcase-card::after,
.project-card::before,
.inspiration-card::before {
  display: none;
}

.showcase-card:hover img,
.inspiration-card:hover .inspiration-image img,
.inspiration-card.is-awesome-case:hover .inspiration-image img {
  transform: none;
}

.showcase-overlay {
  padding: 14px;
  background: linear-gradient(180deg, transparent 8%, rgba(2, 6, 23, 0.78));
}

.showcase-overlay h3 {
  font-size: 17px;
}

.showcase-overlay p,
.showcase-overlay b {
  display: none;
}

.inspiration-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.inspiration-card {
  border-radius: 16px;
}

.inspiration-image {
  aspect-ratio: 16 / 9;
}

.inspiration-body {
  padding: 11px;
}

.inspiration-body h3 {
  font-size: 14px;
}

.inspiration-body p {
  -webkit-line-clamp: 2;
  font-size: 11px;
  line-height: 1.45;
}

.project-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.project-card {
  padding: 8px;
  border-radius: 18px;
}

.project-thumb {
  border-radius: 12px;
}

/* Keep bottom brand identity, but make it quiet and static. */
.brand-footer {
  display: grid !important;
  min-height: 150px;
  margin-top: 48px;
  overflow: hidden;
  perspective: none;
}

.brand-footer-glow {
  display: none;
}

.brand-footer p {
  color: rgba(15, 23, 42, 0.08);
  text-shadow: none;
  transform: none;
  -webkit-text-stroke: 0;
}

.dark .brand-footer p {
  color: rgba(238, 242, 247, 0.08);
  text-shadow: none;
  -webkit-text-stroke: 0;
}

.brand-footer span {
  bottom: 22px;
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

@media (max-width: 960px) {
  .hero-grid.is-collapsed,
  .quick-canvas-actions,
  .integrated-launch-grid,
  .integrated-inline-actions,
  .showcase-grid,
  .inspiration-grid,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .home-main {
    width: min(100% - 22px, 720px);
    padding: 18px 12px 72px;
  }
}

.gemini-home-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  background:
    linear-gradient(180deg, rgba(241, 247, 255, 0.82), rgba(246, 250, 255, 0.92)),
    var(--bg-primary);
}

.dark .gemini-home-shell {
  background:
    linear-gradient(180deg, rgba(10, 16, 25, 0.96), rgba(13, 22, 34, 0.96)),
    var(--bg-primary);
}

.gemini-sidebar {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 12px;
  background: #e8eef6;
  border-right: 1px solid rgba(148, 163, 184, 0.22);
}

.dark .gemini-sidebar {
  background: #101827;
  border-right-color: rgba(148, 163, 184, 0.16);
}

.gemini-sidebar-top,
.gemini-composer-footer,
.gemini-tools,
.gemini-topbar {
  display: flex;
  align-items: center;
}

.gemini-sidebar-top {
  justify-content: space-between;
}

.gemini-icon-button,
.gemini-new-chat,
.gemini-nav button,
.gemini-sidebar-section button,
.gemini-sidebar-bottom button,
.gemini-topbar button,
.gemini-tools button,
.gemini-suggestions button,
.gemini-send {
  border: 0;
  font: inherit;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
}

.gemini-icon-button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 999px;
}

.gemini-icon-button:hover,
.gemini-nav button:hover,
.gemini-sidebar-bottom button:hover,
.gemini-sidebar-section button:hover,
.gemini-suggestions button:hover,
.gemini-tools button:hover {
  background: rgba(15, 23, 42, 0.06);
}

.dark .gemini-icon-button:hover,
.dark .gemini-nav button:hover,
.dark .gemini-sidebar-bottom button:hover,
.dark .gemini-sidebar-section button:hover,
.dark .gemini-suggestions button:hover,
.dark .gemini-tools button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.gemini-new-chat {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  text-align: left;
  font-weight: 700;
}

.dark .gemini-new-chat {
  background: rgba(255, 255, 255, 0.08);
}

.gemini-nav,
.gemini-sidebar-section,
.gemini-sidebar-bottom {
  display: grid;
  gap: 4px;
}

.gemini-nav button,
.gemini-sidebar-bottom button {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 12px;
  text-align: left;
}

.gemini-sidebar-section {
  margin-top: 10px;
}

.gemini-sidebar-section strong {
  padding: 0 10px 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.gemini-sidebar-section button {
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}

.gemini-sidebar-bottom {
  margin-top: auto;
}

.gemini-main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.gemini-topbar {
  height: 56px;
  justify-content: space-between;
  padding: 0 28px;
}

.gemini-topbar strong {
  font-size: 16px;
  letter-spacing: -0.02em;
}

.gemini-topbar button {
  min-height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.gemini-center {
  width: min(720px, calc(100vw - 360px));
  margin: auto auto 0;
  padding-bottom: 11vh;
}

.gemini-center.has-chat {
  width: min(880px, calc(100vw - 360px));
  height: calc(100vh - 96px);
  margin: 20px auto 0;
  padding-bottom: 24px;
  display: flex;
  flex-direction: column;
}

.gemini-welcome {
  margin-top: auto;
}

.gemini-chat-thread {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 12px 2px 18px;
}

.gemini-chat-thread .chat-message {
  max-width: min(760px, 92%);
}

.gemini-chat-thread .chat-message.user {
  align-self: flex-end;
}

.gemini-chat-thread .chat-message.assistant {
  align-self: flex-start;
}

.gemini-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
}

.gemini-hello {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.gemini-center h1 {
  margin: 0 0 12px;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.08;
  font-weight: 760;
  letter-spacing: -0.06em;
}

.gemini-typewriter {
  min-height: 32px;
  margin: 0 0 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: clamp(17px, 1.6vw, 22px);
  font-weight: 650;
  line-height: 1.35;
}

.gemini-typewriter-text {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
}

.gemini-typewriter-char {
  display: inline-block;
}

.gemini-typewriter-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #24d18b;
  flex: 0 0 auto;
}

.gemini-composer {
  border-radius: 28px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08);
  padding: 18px;
}

.dark .gemini-composer {
  box-shadow: none;
}

.gemini-composer textarea {
  width: 100%;
  min-height: 76px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  line-height: 1.6;
}

.gemini-composer textarea::placeholder {
  color: var(--text-muted);
}

.gemini-composer-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.gemini-tools {
  display: flex;
  flex-wrap: wrap;
  align-self: stretch;
  gap: 8px;
}

.gemini-tools button,
.gemini-suggestions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-secondary);
  white-space: nowrap;
}

.dark .gemini-tools button,
.dark .gemini-suggestions button {
  background: rgba(255, 255, 255, 0.08);
}

.gemini-composer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  align-self: stretch;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.gemini-model-field {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  height: 36px;
  padding: 0 0 0 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.dark .gemini-model-field {
  background: rgba(255, 255, 255, 0.08);
}

.gemini-model-select {
  width: 148px;
  max-width: 26vw;
  height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 28px 0 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.dark .gemini-model-select {
  background: transparent;
  color: var(--text-secondary);
}

.gemini-send {
  min-height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  background: #1fce7c;
  color: #042013;
  font-weight: 800;
}

.gemini-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 980px) {
  .gemini-composer-actions {
    justify-content: flex-start;
  }

  .gemini-model-field {
    flex: 1 1 180px;
  }

  .gemini-model-select {
    width: 100%;
    max-width: none;
  }

  .gemini-send {
    flex: 1 1 120px;
  }
}

.gemini-brand-mark {
  margin-top: auto;
  padding: 34px 24px 28px;
  text-align: center;
  pointer-events: none;
}

.gemini-brand-mark p {
  margin: 0;
  font-size: clamp(44px, 8vw, 118px);
  line-height: 0.9;
  font-weight: 950;
  letter-spacing: -0.08em;
  color: rgba(15, 23, 42, 0.07);
}

.dark .gemini-brand-mark p {
  color: rgba(238, 242, 247, 0.06);
}

.gemini-brand-mark span {
  display: inline-block;
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.gemini-library {
  width: min(1040px, calc(100vw - 360px));
  height: calc(100vh - 96px);
  margin: 20px auto 0;
  padding: 8px 2px 28px;
  overflow-y: auto;
}

.gemini-library-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.gemini-library-head p {
  margin: 0 0 6px;
  color: #10b981;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: 0.16em;
}

.gemini-library-head h2 {
  margin: 0 0 8px;
  font-size: clamp(28px, 3vw, 42px);
  line-height: 1.05;
  letter-spacing: -0.05em;
}

.gemini-library-head span {
  color: var(--text-secondary);
}

.gemini-library-head button,
.gemini-library-toolbar > button,
.gemini-more-row button {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  min-height: 34px;
  padding: 0 14px;
  cursor: pointer;
}

.gemini-library-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.gemini-library-search {
  flex: 1;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
}

.gemini-library-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
}

.gemini-chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 16px;
}

.gemini-chip-row button {
  flex: 0 0 auto;
  min-height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-secondary);
  cursor: pointer;
}

.gemini-chip-row button.active {
  background: #1fce7c;
  color: #042013;
  font-weight: 800;
}

.gemini-chip-row span {
  opacity: 0.72;
}

.gemini-case-grid,
.gemini-workflow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.gemini-case-card,
.gemini-workflow-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.gemini-case-card img,
.gemini-case-placeholder,
.gemini-workflow-card img,
.gemini-workflow-placeholder {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-muted);
  font-weight: 900;
}

.gemini-case-card > div:last-child,
.gemini-workflow-card > div:last-child {
  padding: 12px;
}

.gemini-case-card b,
.gemini-workflow-card b {
  display: block;
  font-size: 14px;
  line-height: 1.35;
}

.gemini-case-card p,
.gemini-workflow-card p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.gemini-workflow-card span,
.gemini-workflow-card small {
  color: var(--text-muted);
  font-size: 11px;
}

.case-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(15, 23, 42, 0.78);
  color: white;
  font-size: 11px;
  font-weight: 800;
}

.gemini-more-row {
  display: flex;
  justify-content: center;
  padding: 18px 0 6px;
}

@media (max-width: 900px) {
  .gemini-home-shell {
    grid-template-columns: 1fr;
  }

  .gemini-sidebar {
    display: none;
  }

  .gemini-center {
    width: min(100% - 32px, 720px);
    padding-top: 18vh;
  }

  .gemini-center.has-chat {
    width: min(100% - 32px, 720px);
    height: calc(100vh - 74px);
    padding-top: 12px;
  }

  .gemini-library {
    width: min(100% - 32px, 720px);
    height: calc(100vh - 74px);
  }

  .gemini-case-grid,
  .gemini-workflow-grid {
    grid-template-columns: 1fr;
  }

  .gemini-topbar {
    padding: 0 16px;
  }
}
</style>
