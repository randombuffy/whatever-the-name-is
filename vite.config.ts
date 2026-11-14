import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nvidiaNimPlugin } from './src/si/vitePlugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), nvidiaNimPlugin(env.NVIDIA_API_KEY)],
    server: {
      port: 5173,
      watch: {
        ignored: ['**/node_modules/**', '**/.git/**', '**/references/**', '**/public/models/**', '**/public/3d/**', '**/public/props/**', '**/*.usdz', '**/*.glb'],
      },
    },
  }
})
