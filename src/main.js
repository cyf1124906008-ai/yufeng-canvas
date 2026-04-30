/**
 * Main entry point | 主入口
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import {
  migrateLegacyLocalStorageKeys,
  restoreUserDataFromDiskIfNeeded,
  startUserDataAutoBackup
} from './utils/appDataBackup'
import './style.css'

const bootstrap = async () => {
  migrateLegacyLocalStorageKeys()

  if (import.meta.env.APP_TARGET === 'desktop') {
    await restoreUserDataFromDiskIfNeeded()
    startUserDataAutoBackup()
  }

  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)

  if (import.meta.env.APP_TARGET === 'desktop') {
    await router.replace('/')
  }

  await router.isReady()
  app.mount('#app')
}

bootstrap()
