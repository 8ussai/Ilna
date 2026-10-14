import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `vite preview` serves the built site to the public domain through the tunnel
  preview: {
    port: 4173,
    allowedHosts: ['ilna-academic.com', 'www.ilna-academic.com'],
  },
})
