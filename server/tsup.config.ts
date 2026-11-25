import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  external: ['@libsql/client', 'node:async_hooks', 'node:crypto', 'node:fs', 'node:path', 'node:url'],
  noExternal: ['@pran-rekha/contracts', '@pran-rekha/domain']
});
