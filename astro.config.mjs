// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://rumoca.cognipilot.org',
  integrations: [react()],

  // The guides used to be mirrored here; keep old links working by sending
  // them to the official copies published by CogniPilot/rumoca.
  redirects: {
    '/user-guide': 'https://cognipilot.github.io/rumoca/user-guide/',
    '/dev-guide': 'https://cognipilot.github.io/rumoca/dev-guide/',
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      watch: {
        ignored: ['**/target/**', '**/rumoca_ws_proxy/**'],
      },
    },
  }
});