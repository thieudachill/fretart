import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // getUserMedia requires a secure context; localhost is secure by default.
  },
  build: {
    target: 'es2022',
  },
});
