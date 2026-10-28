// Separate engineering artifact; never used by normal npm run build.
import { defineConfig } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/AniView/', publicDir: false,
  build: { outDir: '.tools/conversion-site', emptyOutDir: true,
    rollupOptions: { input: resolve('experiments/conversion/index.html') } },
  plugins: [{ name: 'conversion-spike-notices', async generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'third-party-notices.txt', source: await readFile('public/third-party-notices.txt', 'utf8') })
  } }],
})
