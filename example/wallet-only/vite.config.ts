import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const ROOT = path.resolve(__dirname);
const SHARED_ENV = path.resolve(ROOT, '..', '.env');
dotenv.config({ path: SHARED_ENV });

const APP_ID =
  process.env.APP_WALLETLESS_ID ||
  process.env.APP_ID ||
  process.env.CHERRY_APP_ID ||
  '';
const ROOM_ID = process.env.ROOM_ID || process.env.CHERRY_ROOM_ID || '';
const EMBED_URL = process.env.CHERRY_EMBED_URL || 'https://embed.cherry.fun';
const PORT = Number(process.env.PORT) || 8088;

const SDK_BUNDLE = path.resolve(ROOT, '..', '..', 'dist', 'index.global.js');

/**
 * Dev-only middleware that mirrors the production server.js endpoints:
 *   GET /config.json    — public app config from the shared example/.env
 *   GET /cherry-embed.js — IIFE bundle from the local SDK build
 *
 * Production deploy flow stays untouched: `bun run build` writes static
 * assets to dist/ and `node server.js` serves them with the same routes.
 */
function devEndpoints(): Plugin {
  return {
    name: 'wallet-only-demo-endpoints',
    configureServer(server) {
      server.middlewares.use('/config.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            appId: APP_ID,
            embedUrl: EMBED_URL,
            roomId: ROOM_ID || null,
          }),
        );
      });
      server.middlewares.use('/cherry-embed.js', (_req, res) => {
        if (!fs.existsSync(SDK_BUNDLE)) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'text/plain');
          res.end(
            '// chat-embed-sdk bundle not built. Run `bun run build` from chat-embed-sdk/.',
          );
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        // Disable caching so a fresh `bun run build` of the SDK is served
        // immediately on the next page reload — without this the browser
        // pins the IIFE bundle and `chat.resetTheme()` (or any other
        // newly-added method) appears missing until the user nukes the cache.
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.end(fs.readFileSync(SDK_BUNDLE));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devEndpoints()],
  server: {
    port: PORT,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
