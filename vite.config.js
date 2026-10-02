import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = import.meta.dirname
const library = join(root, 'library')

/**
 * Serves every library icon at /icons/<name>.svg, in dev and in the build.
 *
 * The gallery inlines the icons it draws, but a download needs a real file at
 * a URL that does not change with the build hash, so people can link to one.
 * public/ would give that for free, except the files live in library/ with
 * their metadata, and copying them by hand is exactly the drift to avoid.
 */
function iconFiles() {
  const svgs = () => readdirSync(library).filter((f) => f.endsWith('.svg'))
  return {
    name: 'icon-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/icons\/([a-z0-9-]+\.svg)$/.exec(req.url?.split('?')[0] ?? '')
        if (!m || !svgs().includes(m[1])) return next()
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(readFileSync(join(library, m[1])))
      })
    },
    generateBundle() {
      for (const file of svgs()) {
        this.emitFile({ type: 'asset', fileName: `icons/${file}`, source: readFileSync(join(library, file)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Served from the root of the custom domain (icons.knurled.studio). If the
  // site ever moves back to a github.io project path, set BASE_PATH to
  // '/knurl-icons/'.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), iconFiles()],
  build: {
    // One HTML file per page, so GitHub Pages has a real file at each URL and
    // needs no single-page-app 404 fallback.
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        editor: resolve(root, 'editor/index.html'),
        icons: resolve(root, 'icons/index.html'),
      },
    },
  },
})
