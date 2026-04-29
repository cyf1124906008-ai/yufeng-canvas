<script setup>
/**
 * Root App component | 根组件
 * Provides naive-ui config and router view
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NConfigProvider, NDialogProvider, NInput, NMessageProvider, darkTheme } from 'naive-ui'
import { isDark } from './stores/theme'
import AppFeedbackProvider from './components/AppFeedbackProvider.vue'

const INVITE_CODE = 'swsb'
const INVITE_STORAGE_KEY = 'yufeng-canvas-invite-accepted'

const inviteCode = ref('')
const inviteAccepted = ref(false)
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

const submitInviteCode = () => {
  if (inviteCode.value.trim().toLowerCase() !== INVITE_CODE) {
    inviteError.value = '邀请码不正确，请重新输入。'
    return
  }

  try {
    localStorage.setItem(INVITE_STORAGE_KEY, 'yes')
  } catch {
    // Local storage can be unavailable in restricted environments; keep this session unlocked.
  }

  inviteAccepted.value = true
  inviteError.value = ''
}

onMounted(() => {
  try {
    inviteAccepted.value = localStorage.getItem(INVITE_STORAGE_KEY) === 'yes'
  } catch {
    inviteAccepted.value = false
  }
})
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <app-feedback-provider>
          <router-view v-if="inviteAccepted" />
          <div v-else class="invite-gate">
            <div class="invite-bg" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <section class="invite-card" aria-label="YUFENG Canvas 邀请码验证">
              <div class="invite-mark">
                <img src="./assets/logo.png" alt="YUFENG Canvas" />
              </div>
              <p class="invite-kicker">YUFENG CANVAS ACCESS</p>
              <h1>输入邀请码，继续创作。</h1>
              <p class="invite-desc">
                本次更新后首次打开需要验证邀请码。验证通过后会保存在本机，以后可直接使用。
              </p>
              <div class="invite-form">
                <n-input
                  v-model:value="inviteCode"
                  type="password"
                  show-password-on="click"
                  size="large"
                  placeholder="请输入邀请码"
                  autofocus
                  @keyup.enter="submitInviteCode"
                />
                <n-button type="primary" size="large" @click="submitInviteCode">
                  进入软件
                </n-button>
              </div>
              <p v-if="inviteError" class="invite-error">{{ inviteError }}</p>
            </section>
          </div>
        </app-feedback-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/* Global app styles handled in style.css */

.invite-gate {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 24px;
  color: #eafff8;
  background:
    radial-gradient(circle at 20% 16%, rgba(45, 212, 191, 0.34), transparent 34%),
    radial-gradient(circle at 82% 76%, rgba(14, 165, 233, 0.24), transparent 36%),
    linear-gradient(135deg, #020617 0%, #042f2e 46%, #061826 100%);
}

.invite-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.8;
}

.invite-bg span {
  position: absolute;
  width: 34vw;
  height: 34vw;
  border-radius: 999px;
  background: rgba(94, 234, 212, 0.12);
  filter: blur(52px);
}

.invite-bg span:nth-child(1) {
  left: -10vw;
  top: 8vh;
}

.invite-bg span:nth-child(2) {
  right: -8vw;
  bottom: 2vh;
  background: rgba(56, 189, 248, 0.14);
}

.invite-bg span:nth-child(3) {
  left: 38vw;
  top: 56vh;
  width: 18vw;
  height: 18vw;
  background: rgba(34, 197, 94, 0.12);
}

.invite-card {
  position: relative;
  z-index: 1;
  width: min(520px, calc(100vw - 32px));
  border: 1px solid rgba(203, 255, 239, 0.2);
  border-radius: 34px;
  padding: 38px;
  background:
    radial-gradient(circle at 18% 0%, rgba(125, 249, 231, 0.18), transparent 34%),
    rgba(5, 18, 32, 0.76);
  box-shadow:
    0 40px 130px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(28px) saturate(1.25);
}

.invite-mark {
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

.invite-mark img {
  width: 52px;
  height: 52px;
  border-radius: 16px;
}

.invite-kicker {
  margin: 0 0 10px;
  color: #5ff6d2;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.2em;
}

.invite-card h1 {
  margin: 0;
  color: #f8fffc;
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 950;
  letter-spacing: -0.06em;
  line-height: 1.02;
}

.invite-desc {
  margin: 18px 0 28px;
  color: rgba(234, 255, 248, 0.72);
  font-size: 15px;
  line-height: 1.8;
}

.invite-form {
  display: grid;
  gap: 12px;
}

.invite-form .n-button {
  height: 46px;
  border-radius: 16px;
  font-weight: 900;
}

.invite-error {
  margin: 12px 0 0;
  color: #fecaca;
  font-size: 13px;
}
</style>
