import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from the root of the custom domain (icons.knurled.studio). If the
  // site ever moves back to a github.io project path, set BASE_PATH to
  // '/knurl-icons/'.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
