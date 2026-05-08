<script setup>
/**
 * Root App component | 根组件
 * Provides naive-ui config and router view
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NConfigProvider, NDialogProvider, NMessageProvider, NModal, NInput, darkTheme } from 'naive-ui'
import { isDark } from './stores/theme'
import AppFeedbackProvider from './components/AppFeedbackProvider.vue'
import SupportModal from './components/SupportModal.vue'

const SUPPORT_HINT_STORAGE_KEY = 'yufeng-canvas-support-hint-v1'
const INVITE_STORAGE_KEY = 'yufeng-canvas-invite-pass-v1'
const INVITE_CODE = 'sbsw'

const showSupportHint = ref(false)
const showSupportModal = ref(false)
const invitePassed = ref(false)
const inviteCode = ref('')
const inviteError = ref('')

// Naive UI theme based on dark mode | 基于深色模式的 Naive UI 主题
const theme = computed(() => isDark.value ? darkTheme : null)

// Global theme overrides | 全局主题覆盖
const themeOverrides = {
  common: {
    borderRadius: '12px',
    borderRadiusSmall: '8px'
  },
  Dialog: {
    borderRadius: '16px',
    padding: '24px'
  },
  Modal: {
    borderRadius: '16px',
    padding: '24px'
  },
  Card: {
    borderRadius: '16px',
    padding: '24px'
  },
  Button: {
    borderRadiusMedium: '10px',
    borderRadiusSmall: '8px',
    borderRadiusLarge: '12px',
    heightMedium: '36px',
    paddingMedium: '0 16px'
  },
  Input: {
    borderRadius: '10px',
    heightMedium: '36px'
  }
}

const closeSupportHint = () => {
  try {
    localStorage.setItem(SUPPORT_HINT_STORAGE_KEY, 'yes')
  } catch {
    // Local storage can be unavailable in restricted environments.
  }

  showSupportHint.value = false
}

const openSupportFromHint = () => {
  closeSupportHint()
  showSupportModal.value = true
}

const submitInviteCode = () => {
  const value = String(inviteCode.value || '').trim()
  if (value === INVITE_CODE) {
    try {
      localStorage.setItem(INVITE_STORAGE_KEY, 'yes')
    } catch {
      // Local storage can be unavailable in restricted environments.
    }

    invitePassed.value = true
    inviteError.value = ''

    try {
      showSupportHint.value = localStorage.getItem(SUPPORT_HINT_STORAGE_KEY) !== 'yes'
    } catch {
      showSupportHint.value = true
    }
    return
  }

  inviteError.value = '邀请码不正确，请重新输入。'
}

onMounted(() => {
  try {
    invitePassed.value = localStorage.getItem(INVITE_STORAGE_KEY) === 'yes'
  } catch {
    invitePassed.value = false
  }

  if (!invitePassed.value) {
    showSupportHint.value = false
    return
  }

  try {
    showSupportHint.value = localStorage.getItem(SUPPORT_HINT_STORAGE_KEY) !== 'yes'
  } catch {
    showSupportHint.value = true
  }
})
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <app-feedback-provider>
          <router-view v-if="invitePassed" />

          <n-modal
            :show="!invitePassed"
            preset="card"
            class="invite-gate-modal"
            :bordered="false"
            :mask-closable="false"
            :close-on-esc="false"
          >
            <div class="invite-gate">
              <div class="invite-gate-mark">
                <img src="./assets/logo.png" alt="YUFENG Canvas" />
              </div>
              <p class="invite-gate-kicker">YUFENG CANVAS</p>
              <h2>请输入邀请码</h2>
              <p class="invite-gate-desc">
                当前版本需要通过邀请码后才能使用。验证通过后，本机后续打开会自动进入。
              </p>
              <n-input
                v-model:value="inviteCode"
                class="invite-gate-input"
                placeholder="输入邀请码"
                size="large"
                round
                clearable
                autofocus
                @keydown.enter="submitInviteCode"
              />
              <p v-if="inviteError" class="invite-gate-error">{{ inviteError }}</p>
              <div class="invite-gate-actions">
                <n-button type="primary" round size="large" @click="submitInviteCode">
                  进入 YUFENG Canvas
                </n-button>
              </div>
            </div>
          </n-modal>

          <n-modal
            v-model:show="showSupportHint"
            preset="card"
            class="support-hint-modal"
            :bordered="false"
            :mask-closable="false"
          >
            <div class="support-hint">
              <div class="support-hint-mark">
                <img src="./assets/logo.png" alt="YUFENG Canvas" />
              </div>
              <p class="support-hint-kicker">YUFENG CANVAS</p>
              <h2>遇到问题，直接联系作者。</h2>
              <p>
                有任何问题、扣费异常、模型配置失败或改进建议，请点击软件右上角的信封图标联系作者。
                反馈时带上运行日志截图、模型名和请求时间，我们会更快定位。
              </p>
              <div class="support-hint-actions">
                <n-button strong secondary round @click="closeSupportHint">
                  我知道了
                </n-button>
                <n-button type="primary" round @click="openSupportFromHint">
                  立即联系作者
                </n-button>
              </div>
            </div>
          </n-modal>

          <support-modal v-model:show="showSupportModal" />
        </app-feedback-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
.invite-gate-modal {
  width: min(460px, calc(100vw - 32px));
  border: 1px solid rgba(203, 255, 239, 0.26);
  border-radius: 34px;
  overflow: hidden;
  background:
    radial-gradient(circle at 14% 0%, rgba(70, 245, 203, 0.22), transparent 36%),
    radial-gradient(circle at 92% 100%, rgba(56, 189, 248, 0.18), transparent 40%),
    rgba(5, 18, 32, 0.9);
  box-shadow:
    0 44px 140px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(30px) saturate(1.25);
}

.invite-gate-modal .n-card__content {
  padding: 34px;
}

.invite-gate {
  color: #eafff8;
}

.invite-gate-mark {
  display: grid;
  place-items: center;
  width: 70px;
  height: 70px;
  margin-bottom: 20px;
  border: 1px solid rgba(125, 249, 231, 0.3);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 54px rgba(20, 184, 166, 0.24);
}

.invite-gate-mark img {
  width: 50px;
  height: 50px;
  border-radius: 16px;
}

.invite-gate-kicker {
  margin: 0 0 10px;
  color: #5ff6d2;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.2em;
}

.invite-gate h2 {
  margin: 0;
  color: #f8fffc;
  font-size: clamp(30px, 4.5vw, 42px);
  font-weight: 950;
  letter-spacing: -0.05em;
  line-height: 1.04;
}

.invite-gate-desc {
  margin: 16px 0 22px;
  color: rgba(234, 255, 248, 0.72);
  font-size: 14px;
  line-height: 1.7;
}

.invite-gate-input {
  margin-bottom: 10px;
}

.invite-gate-error {
  margin: 8px 0 0;
  color: #ff9a9a;
  font-size: 13px;
  font-weight: 800;
}

.invite-gate-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.invite-gate-actions .n-button {
  min-width: 158px;
  height: 44px;
  border-radius: 18px;
  font-weight: 900;
}

.support-hint-modal {
  width: min(520px, calc(100vw - 32px));
  border: 1px solid rgba(203, 255, 239, 0.22);
  border-radius: 34px;
  overflow: hidden;
  background:
    radial-gradient(circle at 16% 0%, rgba(125, 249, 231, 0.2), transparent 34%),
    radial-gradient(circle at 88% 100%, rgba(56, 189, 248, 0.16), transparent 38%),
    rgba(5, 18, 32, 0.82);
  box-shadow:
    0 40px 130px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(28px) saturate(1.25);
}

.support-hint-modal .n-card__content {
  padding: 34px;
}

.support-hint {
  color: #eafff8;
}

.support-hint-mark {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-bottom: 22px;
  border: 1px solid rgba(125, 249, 231, 0.28);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 54px rgba(20, 184, 166, 0.22);
}

.support-hint-mark img {
  width: 52px;
  height: 52px;
  border-radius: 16px;
}

.support-hint-kicker {
  margin: 0 0 10px;
  color: #5ff6d2;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.2em;
}

.support-hint h2 {
  margin: 0;
  color: #f8fffc;
  font-size: clamp(30px, 4.5vw, 44px);
  font-weight: 950;
  letter-spacing: -0.06em;
  line-height: 1.02;
}

.support-hint p:not(.support-hint-kicker) {
  margin: 18px 0 28px;
  color: rgba(234, 255, 248, 0.72);
  font-size: 15px;
  line-height: 1.8;
}

.support-hint-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

.support-hint-actions .n-button {
  min-width: 116px;
  height: 42px;
  border-radius: 16px;
  font-weight: 900;
}
</style>
