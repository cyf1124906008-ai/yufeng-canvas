<script setup>
/**
 * Root App component | 根组件
 * Provides naive-ui config and router view
 */
import { computed } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider, darkTheme } from 'naive-ui'
import { agentSettings } from './stores/settings'
import AppFeedbackProvider from './components/AppFeedbackProvider.vue'
import DataEyesCodeStartup from './components/DataEyesCodeStartup.vue'

// Naive UI theme based on dark mode | 基于深色模式的 Naive UI 主题
const theme = computed(() => agentSettings.isDark.value ? darkTheme : null)

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

</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <app-feedback-provider>
          <router-view />
          <data-eyes-code-startup />
        </app-feedback-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
