// Separate experiment artifact. Normal `npm run build` never uses this entry.
import { defineConfig } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/AniView/',
  publicDir: false,
  build: {
    outDir: '.tools/gif-encoder-site',
    emptyOutDir: true,
    rollupOptions: { input: resolve('experiments/gif-encoder/index.html') },
  },
  plugins: [{
    name: 'spike-third-party-notices',
    async generateBundle() {
      const source = await readFile('public/third-party-notices.txt', 'utf8')
      this.emitFile({ type: 'asset', fileName: 'third-party-notices.txt', source })
    },
  }],
})
