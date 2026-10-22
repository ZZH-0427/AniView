import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/AniView/',
  plugins: [react()],
  server: {
    watch: { ignored: /(^|[\\/])\.tools([\\/]|$)/ },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
