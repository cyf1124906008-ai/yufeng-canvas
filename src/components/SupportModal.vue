<template>
  <n-modal
    :show="show"
    preset="card"
    class="support-modal"
    :bordered="false"
    :mask-closable="true"
    @update:show="emit('update:show', $event)"
  >
    <div class="support-shell">
      <div class="support-hero">
        <div class="support-mark">Y</div>
        <div>
          <p class="support-kicker">YUFENG SUPPORT</p>
          <h2>联系作者与使用支持</h2>
          <p>安装、模型配置、扣费异常、工作流建议、售后指导，都可以从这里联系。建议反馈时带上运行日志截图、模型名和请求时间。</p>
        </div>
      </div>

      <div class="support-grid">
        <article class="support-card">
          <div class="qr-card qr-author">
            <img :src="wechatQr" alt="作者微信二维码" />
          </div>
          <div>
            <n-icon :size="20"><ChatbubbleOutline /></n-icon>
            <h3>联系作者</h3>
            <p>微信扫码联系作者。用于 bug 反馈、安装失败、模型接口异常、扣费但无结果、功能建议。</p>
          </div>
          <button @click="copyAuthorContact">复制作者联系方式</button>
        </article>

        <article class="support-card">
          <div class="support-api-icon support-mail-icon">
            <n-icon :size="28"><MailOutline /></n-icon>
          </div>
          <div>
            <n-icon :size="20"><MailOutline /></n-icon>
            <h3>邮箱反馈</h3>
            <p>适合发送完整问题描述、截图、视频录屏、供应商后台错误信息和复现步骤。</p>
          </div>
          <button @click="copyEmail">复制邮箱</button>
        </article>

        <article class="support-card">
          <div class="support-api-icon support-github-icon">
            <n-icon :size="28"><LogoGithub /></n-icon>
          </div>
          <div>
            <n-icon :size="20"><LogoGithub /></n-icon>
            <h3>GitHub Issue</h3>
            <p>开源问题、更新建议、可复现 bug 可以提交到仓库，方便跟踪和后续版本修复。</p>
          </div>
          <button @click="openExternal(githubIssuesUrl)">提交 GitHub Issue</button>
        </article>

        <article class="support-card support-card-wide">
          <div class="support-api-icon">
            <n-icon :size="28"><SettingsOutline /></n-icon>
          </div>
          <div>
            <h3>API Key 与模型配置</h3>
            <p>用户需要填写自己的 Key、Base URL 和模型名。模型名要和供应商后台完全一致；文本、图片、视频可以共用一个 Key，也可以分别配置。</p>
          </div>
          <button @click="openExternal(apiKeyHelpUrl)">申请 / 查看 API Key</button>
        </article>

        <article class="support-card support-card-wide">
          <div class="support-api-icon">
            <n-icon :size="28"><SparklesOutline /></n-icon>
          </div>
          <div>
            <h3>本地 API / MCP</h3>
            <p>
              {{ localApiStatus.running ? `已启动：${localApiStatus.origin}` : '未启动或端口被占用' }}
              <span v-if="localApiStatus.running">，MCP 入口：{{ localApiStatus.origin }}/mcp</span>
            </p>
          </div>
          <button @click="copyLocalApiInfo">复制入口</button>
        </article>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { NIcon, NModal } from 'naive-ui'
import { ChatbubbleOutline, LogoGithub, MailOutline, SettingsOutline, SparklesOutline } from '@vicons/ionicons5'
import { getApiKeyHelpUrl, getGithubUrl } from '../config/distribution'
import wechatQr from '../assets/wechat-qr.jpg'

defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show'])

const apiKeyHelpUrl = getApiKeyHelpUrl()
const githubIssuesUrl = computed(() => `${getGithubUrl().replace(/\/$/, '')}/issues`)
const authorEmail = '16689675868@163.com'
const localApiStatus = ref({
  running: false,
  origin: 'http://127.0.0.1:43112',
  error: ''
})

const openExternal = (url) => {
  if (window.desktopApp?.openExternal) {
    window.desktopApp.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

const copySupportText = async () => {
  const text = `YUFENG Canvas 支持入口\n微信：请在软件“联系支持”里扫码\n邮箱：${authorEmail}\nGitHub: ${getGithubUrl()}\nIssues: ${githubIssuesUrl.value}\nAPI Key: ${apiKeyHelpUrl}`
  try {
    await navigator.clipboard?.writeText(text)
    window.$message?.success('已复制支持信息')
  } catch {
    window.$message?.info(text)
  }
}

const copyAuthorContact = async () => {
  const text = `微信：请在 YUFENG Canvas 的“联系支持”里扫码\n邮箱：${authorEmail}`
  try {
    await navigator.clipboard?.writeText(text)
    window.$message?.success('已复制作者联系方式')
  } catch {
    window.$message?.info(text)
  }
}

const copyEmail = async () => {
  try {
    await navigator.clipboard?.writeText(authorEmail)
    window.$message?.success('已复制邮箱')
  } catch {
    window.$message?.info(authorEmail)
  }
}

const copyLocalApiInfo = async () => {
  const endpoint = `${localApiStatus.value.origin || 'http://127.0.0.1:43112'}/mcp`
  try {
    await navigator.clipboard?.writeText(endpoint)
    window.$message?.success('已复制 MCP 入口')
  } catch {
    window.$message?.info(endpoint)
  }
}

onMounted(async () => {
  try {
    const status = await window.desktopApp?.getLocalApiStatus?.()
    if (status) localApiStatus.value = status
  } catch {
    // The web preview has no Electron local API bridge.
  }
})
</script>

<style scoped>
:global(.support-modal.n-card) {
  width: min(760px, calc(100vw - 32px));
  overflow: hidden;
  border-radius: 34px;
  background:
    radial-gradient(circle at 12% 4%, rgba(85, 245, 182, 0.2), transparent 34%),
    radial-gradient(circle at 90% 8%, rgba(56, 189, 248, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(236, 253, 245, 0.72));
  box-shadow: 0 36px 120px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(28px) saturate(1.38);
}

:global(.dark .support-modal.n-card) {
  background:
    radial-gradient(circle at 12% 4%, rgba(85, 245, 182, 0.14), transparent 34%),
    radial-gradient(circle at 90% 8%, rgba(56, 189, 248, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.94), rgba(7, 34, 36, 0.82));
  box-shadow: 0 42px 130px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

:global(.support-modal .n-card__content) {
  padding: 0;
}

.support-shell {
  padding: 28px;
}

.support-hero {
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 18px;
  align-items: center;
  margin-bottom: 22px;
}

.support-mark {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 24px;
  color: #052e2b;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(85, 245, 182, 0.5)),
    radial-gradient(circle at 32% 20%, rgba(255, 255, 255, 0.95), transparent 32%);
  box-shadow: 0 22px 54px rgba(17, 216, 197, 0.28);
  font-size: 34px;
  font-weight: 950;
  letter-spacing: -0.08em;
}

.support-kicker {
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.18em;
}

.support-hero h2 {
  margin-top: 4px;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.05em;
}

.support-hero p {
  margin-top: 8px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.support-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.support-card {
  display: grid;
  grid-template-columns: 118px 1fr;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 18px 44px rgba(15, 23, 42, 0.08);
}

.support-card:nth-child(3) {
  grid-column: 1 / -1;
  grid-template-columns: 68px 1fr auto;
}

.dark .support-card {
  background: rgba(2, 12, 23, 0.34);
  border-color: rgba(203, 255, 239, 0.12);
}

.support-card-wide {
  grid-column: 1 / -1;
  grid-template-columns: 68px 1fr auto;
}

.qr-card,
.support-api-icon {
  display: grid;
  place-items: center;
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(3, 105, 91, 0.74)),
    repeating-linear-gradient(90deg, transparent 0 10px, rgba(255, 255, 255, 0.08) 10px 12px);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
}

.qr-card {
  height: 118px;
  color: #dffef7;
  font-size: 24px;
  font-weight: 950;
  overflow: hidden;
  background: #fff;
  padding: 8px;
}

.qr-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 16px;
}

.qr-group {
  background:
    linear-gradient(135deg, rgba(9, 9, 11, 0.92), rgba(14, 116, 144, 0.72)),
    radial-gradient(circle at 70% 22%, rgba(85, 245, 182, 0.62), transparent 28%);
}

.support-api-icon {
  width: 58px;
  height: 58px;
  color: #55f5b6;
}

.support-mail-icon {
  color: #052e2b;
  background: linear-gradient(135deg, #d9fff5, #55f5b6);
}

.support-github-icon {
  color: #ecfeff;
  background: linear-gradient(135deg, #020617, #064e3b);
}

.support-card h3 {
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 900;
}

.support-card p {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.support-card button {
  grid-column: 1 / -1;
  height: 38px;
  border-radius: 999px;
  color: #052e2b;
  background: linear-gradient(135deg, #a7fff0, #55f5b6 48%, #38bdf8);
  box-shadow: 0 14px 32px rgba(17, 216, 197, 0.22);
  font-size: 13px;
  font-weight: 850;
}

.support-card-wide button {
  grid-column: auto;
  min-width: 150px;
}

@media (max-width: 720px) {
  .support-grid,
  .support-card,
  .support-card-wide,
  .support-hero {
    grid-template-columns: 1fr;
  }
}
</style>
