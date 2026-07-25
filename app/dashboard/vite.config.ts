import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Force resolve react from root node_modules to prevent duplicate copies
const rootNodeModules = path.resolve(__dirname, '../../node_modules')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'react': path.join(rootNodeModules, 'react'),
      'react-dom': path.join(rootNodeModules, 'react-dom'),
    }
  }
})
