import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'copy-dashboard-data',
      async closeBundle() {
        const source = resolve('data');
        const destination = resolve('dist/data');
        const entries = await readdir(source, { withFileTypes: true });

        await mkdir(destination, { recursive: true });
        await Promise.all(
          entries
            .filter((entry) => entry.isFile() && /\.(json|csv)$/.test(entry.name))
            .map((entry) => cp(resolve(source, entry.name), resolve(destination, entry.name))),
        );
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
