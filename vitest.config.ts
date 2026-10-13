import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  resolve: {
    alias: {
      '@earendil-works/pi-coding-agent': fileURLToPath(new URL('./src/pi-coding-agent-shim.ts', import.meta.url)),
    },
  },
});
