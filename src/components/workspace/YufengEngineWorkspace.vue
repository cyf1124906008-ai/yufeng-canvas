<template>
  <aside class="engine-workspace-panel">
    <header class="workspace-header">
      <div class="workspace-title-block">
        <p class="workspace-kicker">YUFENG Cloud Creative Workspace</p>
        <h3 class="workspace-title">云端工作流 + 短剧工作区</h3>
        <p class="workspace-subtitle">用云端 API 执行专业图片/视频工作流，用短剧工作区管理角色、场景和镜头。</p>
      </div>
      <button class="collapse-btn" type="button" @click="$emit('close')">收起</button>
    </header>

    <nav class="workspace-tabs" aria-label="工作区切换">
      <button
        type="button"
        class="workspace-tab"
        :class="{ active: activeTab === 'comfy' }"
        @click="activeTab = 'comfy'"
      >
        云端专业工作流
      </button>
      <button
        type="button"
        class="workspace-tab"
        :class="{ active: activeTab === 'drama' }"
        @click="activeTab = 'drama'"
      >
        短剧 Drama
      </button>
    </nav>

    <main class="workspace-body">
      <section v-if="activeTab === 'comfy'" class="cloud-section">
        <div class="cloud-card">
          <div class="cloud-card-header">
            <strong>云端工作流执行</strong>
            <span>API 优先</span>
          </div>
          <p>
            这里不会要求普通用户连接本地 ComfyUI。专业参数会映射到你配置的云端图片/视频模型；不支持的参数会自动回退或给出中文错误提示。
          </p>
          <div class="cloud-actions">
            <button class="shell-action primary" type="button" @click="$emit('action', 'createCloudImageWorkflow')">创建云端专业工作流</button>
            <button class="shell-action" type="button" @click="$emit('action', 'openCloudModelSettings')">模型 API 设置</button>
          </div>
        </div>
      </section>

      <DramaWorkspacePanel
        v-else
        @action="(action, payload) => $emit('action', action, payload)"
        @close="$emit('close')"
      />
    </main>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue'
import DramaWorkspacePanel from './DramaWorkspacePanel.vue'

const props = defineProps({
  initialTab: { type: String, default: 'comfy' }
})

defineEmits(['action', 'close'])

const activeTab = ref(props.initialTab === 'drama' ? 'drama' : 'comfy')

watch(
  () => props.initialTab,
  (value) => {
    activeTab.value = value === 'drama' ? 'drama' : 'comfy'
  }
)
</script>

<style scoped>
.engine-workspace-panel {
  position: absolute;
  top: 5rem;
  right: 1rem;
  z-index: 30;
  display: flex;
  width: min(430px, calc(100vw - 2rem));
  max-height: calc(100vh - 7rem);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  color: #fff;
  background:
    radial-gradient(circle at 16% 0%, rgba(52, 211, 153, 0.18), transparent 34%),
    linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(7, 24, 39, 0.92));
  box-shadow: 0 28px 80px rgba(2, 6, 23, 0.42);
}

.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.workspace-title-block {
  min-width: 0;
}

.workspace-kicker {
  margin: 0 0 4px;
  color: rgba(167, 243, 208, 0.68);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.workspace-title {
  margin: 0;
  color: rgba(255, 255, 255, 0.96);
  font-size: 15px;
  font-weight: 900;
  line-height: 1.25;
}

.workspace-subtitle {
  margin: 5px 0 0;
  color: rgba(226, 232, 240, 0.68);
  font-size: 11px;
  line-height: 1.55;
}

.collapse-btn {
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  font-size: 11px;
  padding: 6px 10px;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.workspace-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.workspace-tab {
  border: 0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  padding: 10px 12px;
}

.workspace-tab:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.workspace-tab.active {
  background: #34d399;
  color: #020617;
}

.workspace-body {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}

.cloud-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cloud-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  padding: 14px;
}

.cloud-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.cloud-card-header strong {
  color: rgba(255, 255, 255, 0.94);
  font-size: 14px;
}

.cloud-card-header span {
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.18);
  color: #bbf7d0;
  font-size: 10px;
  font-weight: 800;
  padding: 4px 8px;
}

.cloud-card p {
  margin: 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 12px;
  line-height: 1.7;
}

.cloud-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.shell-action {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  padding: 9px 12px;
}

.shell-action:hover {
  border-color: rgba(110, 231, 183, 0.48);
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

.shell-action.primary {
  border-color: transparent;
  background: #34d399;
  color: #020617;
}
</style>
