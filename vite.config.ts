import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use VITE_BASE=/jumpy-frogy/ for GitHub Pages static deploys.
  base: process.env.VITE_BASE || '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
