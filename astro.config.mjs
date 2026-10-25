import { defineConfig } from 'astro/config';

// Project Pages has a mandatory repository prefix, including for local QA.
export default defineConfig({
  site: 'https://joeshang.github.io',
  base: '/turtle-notes-site',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
