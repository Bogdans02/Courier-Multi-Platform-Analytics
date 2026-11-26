import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

export const SETUP_TIMEOUT_MS = 30_000;
export const CLEANUP_TIMEOUT_MS = 10_000;

const root = fileURLToPath(new URL('../../', import.meta.url));

function bounded(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Static SSR tests need JSX transforms, but no CSS scanner, HMR socket, or filesystem watcher.
// Register disposal before setup so it also runs when a subsequent ssrLoadModule fails.
export async function createTestServer(registerCleanup) {
  let server;
  let creating;
  let closing;
  const close = () => {
    closing ??= bounded((async () => {
      // If a setup hook timed out during construction, close a server that finishes later.
      // A failed construction has no returned server to dispose; preserve its original error.
      const current = server ?? await creating?.catch(() => undefined);
      await current?.close();
    })(), CLEANUP_TIMEOUT_MS, 'Vite test server cleanup');
    return closing;
  };
  registerCleanup(close);

  creating = createServer({
    configFile: false,
    root,
    plugins: [react()],
    cacheDir: join(tmpdir(), 'courstat-ssr-tests', `${process.pid}-${randomUUID()}`),
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  server = await creating;
  return server;
}
