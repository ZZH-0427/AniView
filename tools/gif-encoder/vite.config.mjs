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
      const parts = await Promise.all([
        'public/third-party-notices.txt',
        'third_party/licenses/gifenc/LICENSE.md',
        'third_party/licenses/gifenc/SOURCE-HEADER-NOTICES',
      ].map(path => readFile(path, 'utf8')))
      this.emitFile({ type: 'asset', fileName: 'third-party-notices.txt', source: parts.join('\n\n') })
    },
  }],
})
