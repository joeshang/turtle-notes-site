import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve('dist');
const base = '/turtle-notes-site/';
const pages = ['index.html', 'privacy/index.html', 'support/index.html', 'downloads/index.html', 'changelog/index.html', 'web-clipper/index.html', '404.html'];
let checked = 0;
async function checkRef(ref, current) {
  ref = ref.replaceAll('&amp;', '&');
  if (/^(?:https?:|mailto:|data:)/.test(ref)) return;
  assert(ref.startsWith(base) || ref.startsWith('#'), `Reference escapes the Pages base: ${ref}`);
  const url = new URL(ref, `https://joeshang.github.io${base}${current}`);
  let target = resolve(root, decodeURIComponent(url.pathname.slice(base.length)));
  if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
  if (url.hash) {
    const linked = await readFile(target, 'utf8');
    assert(linked.includes(`id="${url.hash.slice(1)}"`), `${current}: missing anchor ${ref}`);
  }
  checked++;
}
for (const page of pages) {
  const html = await readFile(join(root, page), 'utf8');
  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /name="description"/);
  assert(html.includes(`href="${base}support/"`), `${page}: missing support navigation`);
  assert.doesNotMatch(html, /github\.com\/joeshang\/turtle-notes(?:["/])/, 'Private App repository must not be a public download destination');
  for (const match of html.matchAll(/(?:href|src)="([^"\s]+)"/g)) await checkRef(match[1], page);
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const src = match[0].match(/src="([^"]+)"/)?.[1];
    const width = Number(match[0].match(/\bwidth="(\d+)"/)?.[1]);
    const height = Number(match[0].match(/\bheight="(\d+)"/)?.[1]);
    if (!src?.endsWith('.png') || !src.startsWith(base) || !width || !height) continue;
    const bytes = await readFile(join(root, src.slice(base.length)));
    const actualWidth = bytes.readUInt32BE(16), actualHeight = bytes.readUInt32BE(20);
    assert(Math.abs((width / height) / (actualWidth / actualHeight) - 1) < 0.001, `${page}: image dimensions distort ${src}`);
  }
}
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else {
      assert(!/\.(?:m|h|sh|env|sqlite|map|mobileprovision|p12|dmg)$/.test(entry.name), `Internal or installer file in Pages artifact: ${path}`);
      if (entry.name.endsWith('.css')) {
        const css = await readFile(path, 'utf8');
        for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) await checkRef(match[1], 'index.html');
      }
    }
  }
}
await inspect(root);
const home = await readFile(join(root, 'index.html'), 'utf8');
assert.match(home, /龙龟载文，/);
assert.match(home, /落笔成章/);
const releases = JSON.parse(await readFile('src/data/releases.json', 'utf8'));
const changelog = await readFile(join(root, 'changelog/index.html'), 'utf8');
const downloadPage = await readFile(join(root, 'downloads/index.html'), 'utf8');
assert(downloadPage.includes(`href="${base}changelog/"`), 'Download page must link to the changelog');
const changelogSource = await readFile('CHANGELOG.md', 'utf8');
for (const [, version] of changelogSource.matchAll(/^## \[([\d.]+)\]/gm)) assert(changelog.includes(version), `Missing changelog version ${version}`);
for (const id of ['notes', 'editor']) {
  assert(home.includes(`href="${base}downloads/#${id}"`), `${id}: homepage must navigate to its section on the shared download page`);
  if (releases[id]) {
    const href = `href="${releases[id].downloadURL}"`;
    assert(!home.includes(href), `${id}: installer links belong on the download page`);
    const downloadPage = await readFile(join(root, 'downloads/index.html'), 'utf8');
    assert(downloadPage.includes(href), `${id}: download details must offer the same installer`);
    assert(downloadPage.includes(`href="${releases[id].checksumURL}"`), `${id}: missing checksum download`);
  }
  for (const suffix of ['', '-dark']) await stat(join(root, `images/${id}-app${suffix}.png`));
}
const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
assert.match(sitemap, /https:\/\/joeshang.github.io\/turtle-notes-site\/privacy\//);
const robots = await readFile(join(root, 'robots.txt'), 'utf8');
assert.match(robots, /Sitemap: https:\/\/joeshang.github.io\/turtle-notes-site\/sitemap.xml/);
console.log(`Verified ${pages.length} project Pages routes and ${checked} links/assets, including CSS and day/night screenshots.`);
