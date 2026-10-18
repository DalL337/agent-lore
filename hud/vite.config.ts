// Builds the HUD in two passes (see `npm run build`): the page into
// dist/client, and the server (`--ssr server/main.ts`) into dist/server as
// plain JavaScript for Node 20+. Nothing from node_modules is needed at run
// time: the page bundles its fonts, the server uses Node built-ins only.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** The bundled JetBrains Mono ships under the SIL Open Font License, which travels with it. */
const fontLicense = (): Plugin => ({
  name: 'lore-font-license',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'licenses/JetBrainsMono-OFL.txt',
      source: readFileSync(new URL('../node_modules/@fontsource/jetbrains-mono/LICENSE', import.meta.url), 'utf8'),
    });
  },
});

export default defineConfig(({ isSsrBuild }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  clearScreen: false,
  plugins: isSsrBuild ? [] : [fontLicense()],
  build: isSsrBuild
    ? { outDir: 'dist/server', emptyOutDir: true, target: 'node20', minify: false }
    : { outDir: 'dist/client', emptyOutDir: true, target: 'es2022' },
}));
