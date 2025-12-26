import { defineConfig } from 'vite';

export default defineConfig({
  // Set base path for GitHub Pages deployment
  // Change 'a10city-verify' to your repository name if different
  base: process.env.GITHUB_ACTIONS ? '/verify/' : '/',
  
  // Ensure WASM files are properly served
  optimizeDeps: {
    exclude: ['@contentauth/c2pa-web'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer support (optional, for better performance)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
  },
});