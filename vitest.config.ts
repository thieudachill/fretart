import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom gives the DOM-touching units (presets/localStorage, recorder)
    // a real-enough document; pure-math tests don't notice it.
    environment: 'happy-dom',
  },
});
