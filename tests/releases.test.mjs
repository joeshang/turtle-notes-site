import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, verifyRelease, syncRelease } from '../scripts/sync-release.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(names = {}) {
  const files = new Map();
  const products = ['notes', 'editor'].map(id => {
    const filename = `${names[id] ?? id}-0.2.0-arm64-release.dmg`; const bytes = Buffer.from(`${id} verified bytes`);
    files.set(filename, bytes);
    const sha256 = hash(bytes); const checksumFilename = `${filename}.sha256`;
    files.set(checksumFilename, Buffer.from(`${sha256}  ${filename}\n`));
    return { id, filename, checksumFilename, bytes: bytes.length, sha256, architecture: 'arm64', minimumMacOS: '14.0' };
  });
  const metadata = Buffer.from(JSON.stringify({ schema: 1, repository, version: '0.2.0', tag: 'v0.2.0', products }));
  files.set('turtle-downloads.json', metadata);
  const release = { tag_name: 'v0.2.0', draft: false, prerelease: false,
    body: `<!-- turtle-public-release:${hash(metadata)} -->`,
    assets: [...files].map(([name, bytes]) => ({ name, size: bytes.length, state: 'uploaded', digest: `sha256:${hash(bytes)}` })) };
  const fetcher = async url => {
    if (url.startsWith('https://api.github.com/')) return Response.json([release]);
    const data = files.get(decodeURIComponent(url.split('/').at(-1)));
    return new Response(data, { status: data ? 200 : 404 });
  };
  return { files, products, release, fetcher };
}
test('verified public products map to anonymous versioned GitHub download URLs', async () => {
  const f = fixture(); const result = await verifyRelease(f.release, f.fetcher);
  assert.equal(result.notes.architecture, 'Apple Silicon');
  assert.match(result.editor.downloadURL, /joeshang\/turtle-notes-site\/releases\/download\/v0.2.0\/editor/);
});
test('Chinese product names verify and produce encoded download URLs', async () => {
  const f = fixture({ notes: '龙龟笔记', editor: '龙龟编辑器' });
  const result = await verifyRelease(f.release, f.fetcher);
  assert.match(decodeURIComponent(result.notes.downloadURL), /龙龟笔记-0\.2\.0-arm64-release\.dmg$/);
  assert.match(decodeURIComponent(result.editor.checksumURL), /龙龟编辑器-0\.2\.0-arm64-release\.dmg\.sha256$/);
  assert.ok(!result.notes.downloadURL.includes('龙龟'));
});
for (const name of ['../龙龟', '/龙龟', '龙/龟', '龙\\龟', '龙\0龟', '龙\u202e龟', '%2f龙龟', '.hidden']) {
  test(`reject unsafe Unicode artifact name ${JSON.stringify(name)}`, async () => {
    const f = fixture({ notes: name });
    await assert.rejects(verifyRelease(f.release, f.fetcher), /Invalid artifact name/);
  });
}
test('missing API digest falls back to streamed bytes, detects corruption', async () => {
  const f = fixture(); delete f.release.assets[0].digest;
  await verifyRelease(f.release, f.fetcher);
  f.files.set(f.products[0].filename, Buffer.from('changed bytes'));
  await assert.rejects(verifyRelease(f.release, f.fetcher), /DMG/);
});
for (const [name, mutate] of [
  ['missing file', f => f.release.assets.pop()],
  ['wrong checksum', f => f.files.set(f.products[0].checksumFilename, Buffer.from('x'.repeat(f.release.assets[1].size)))],
  ['wrong size', f => { f.release.assets[0].size++; }],
  ['wrong digest', f => { f.release.assets[0].digest = 'sha256:wrong'; }],
  ['unexpected private attachment', f => f.release.assets.push({ name: 'notes.build-info.json', state: 'uploaded', size: 1 })],
  ['unowned metadata', f => { f.release.body = ''; }],
]) test(`reject ${name} without replacing existing download configuration`, async () => {
  const f = fixture(); mutate(f);
  const dir = await mkdtemp(join(tmpdir(), 'turtle-site-')); const path = join(dir, 'releases.json');
  try {
    await writeFile(path, 'previous verified release');
    await assert.rejects(syncRelease(path, f.fetcher));
    assert.equal(await readFile(path, 'utf8'), 'previous verified release');
  } finally { await rm(dir, { recursive: true }); }
});
test('network errors fail closed, empty public repository keeps existing data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'turtle-site-')); const path = join(dir, 'releases.json');
  try {
    await writeFile(path, 'previous');
    await assert.rejects(syncRelease(path, async () => new Response('', { status: 403 })), /403/);
    assert.equal(await syncRelease(path, async () => Response.json([])), null);
    assert.equal(await readFile(path, 'utf8'), 'previous');
  } finally { await rm(dir, { recursive: true }); }
});
test('successful complete validation replaces both products atomically', async () => {
  const f = fixture(); const dir = await mkdtemp(join(tmpdir(), 'turtle-site-')); const path = join(dir, 'releases.json');
  try {
    await syncRelease(path, f.fetcher);
    assert.deepEqual(Object.keys(JSON.parse(await readFile(path, 'utf8'))), ['notes', 'editor']);
  } finally { await rm(dir, { recursive: true }); }
});

test('drafts cannot be consumed; the updater ignores them and keeps the previous release', async () => {
  const f = fixture(); f.release.draft = true;
  await assert.rejects(verifyRelease(f.release, f.fetcher), /stable published/);
  const dir = await mkdtemp(join(tmpdir(), 'turtle-site-')); const path = join(dir, 'releases.json');
  try {
    await writeFile(path, 'previous');
    assert.equal(await syncRelease(path, f.fetcher), null);
    assert.equal(await readFile(path, 'utf8'), 'previous');
  } finally { await rm(dir, { recursive: true }); }
});
