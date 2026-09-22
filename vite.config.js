import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://masonlavinder.github.io/knurl-icons/, so assets need
  // the repo name as a prefix. Overridable for other hosts via BASE_PATH.
  base: process.env.BASE_PATH ?? '/knurl-icons/',
  plugins: [react()],
})
