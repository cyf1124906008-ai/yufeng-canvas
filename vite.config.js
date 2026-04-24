import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appTarget = env.APP_TARGET || 'web'
  const isDesktop = appTarget === 'desktop'

  return {
    base: isDesktop ? './' : '/huobao-canvas/',
    define: {
      'import.meta.env.APP_TARGET': JSON.stringify(appTarget)
    },
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/v1': {
          target: 'https://api.chatfire.site',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: isDesktop ? 'dist-desktop' : 'dist'
    }
  }
})
