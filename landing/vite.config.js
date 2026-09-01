import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        howItWorks: path.resolve(__dirname, 'how-it-works.html'),
      },
    },
  },
});
