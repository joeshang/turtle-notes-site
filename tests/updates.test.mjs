import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, verifyRelease, syncRelease } from '../scripts/sync-release.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(version = '1.2.0', architecture = 'arm64') {
  const files = new Map();
  const products = ['notes', 'editor'].map(id => {
    const filename = `${id}-${version}-3-${architecture}-release.dmg`;
    const data = Buffer.from(`${id} signed DMG`); files.set(filename, data);
    const sha256 = hash(data), checksumFilename = `${filename}.sha256`;
    files.set(checksumFilename, Buffer.from(`${sha256}  ${filename}\n`));
    const feed = `${id}-${architecture}-appcast.xml`;
    const xml = Buffer.from(`<?xml version="1.0"?><rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><item><sparkle:version>3</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion><enclosure url="https://github.com/${repository}/releases/download/v${version}/${filename}" length="${data.length}" sparkle:edSignature="${Buffer.alloc(64).toString('base64')}"/></item></channel></rss>`);
    files.set(feed, xml);
    return { id, filename, checksumFilename, sha256, bytes: data.length, architecture, minimumMacOS: '14.0', build: '3',
      update: { filename: feed, bytes: xml.length, sha256: hash(xml) } };
  });
  const data = { schema: 1, repository, tag: `v${version}`, version, products };
  const release = { tag_name: data.tag, draft: false, prerelease: false };
  const refresh = () => {
    const metadata = Buffer.from(JSON.stringify(data)); files.set('turtle-downloads.json', metadata);
    release.body = `<!-- turtle-public-release:${hash(metadata)} -->`;
    release.assets = [...files].map(([name, bytes]) => ({ name, size: bytes.length, state: 'uploaded', digest: `sha256:${hash(bytes)}` }));
  };
  refresh();
  const fetcher = async url => {
    if (url.startsWith('https://api.github.com/')) return Response.json([release]);
    const bytes = files.get(decodeURIComponent(url.split('/').at(-1)));
    return new Response(bytes, { status: bytes ? 200 : 404 });
  };
  return { files, data, release, refresh, fetcher };
}
test('publish verified feeds at stable product/architecture paths', async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), 'turtle-updates-'));
  try {
    await syncRelease(join(root, 'releases.json'), f.fetcher, join(root, 'updates'));
    assert.deepEqual(await readFile(join(root, 'updates/notes/arm64/appcast.xml')), f.files.get('notes-arm64-appcast.xml'));
  } finally { await rm(root, { recursive: true }); }
});
for (const [name, mutate] of [
  ['changed feed', f => f.files.set('notes-arm64-appcast.xml', Buffer.alloc(f.files.get('notes-arm64-appcast.xml').length))],
  ['cross-product feed', f => { f.data.products[0].update.filename = 'editor-arm64-appcast.xml'; f.refresh(); }],
  ['unsafe path', f => { f.data.products[0].update.filename = '../appcast.xml'; f.refresh(); }],
  ['missing feed', f => { f.files.delete('editor-arm64-appcast.xml'); f.refresh(); }],
  ['invalid build', f => { f.data.products[0].build = 'release'; f.refresh(); }],
]) test(`reject ${name} before writing downloads or feeds`, async () => {
  const f = fixture(); mutate(f);
  const root = await mkdtemp(join(tmpdir(), 'turtle-updates-'));
  try {
    const destination = join(root, 'releases.json'); await writeFile(destination, 'previous');
    await assert.rejects(syncRelease(destination, f.fetcher, join(root, 'updates')));
    assert.equal(await readFile(destination, 'utf8'), 'previous');
  } finally { await rm(root, { recursive: true }); }
});
test('preserve the latest other-architecture feed when releases alternate architectures', async () => {
  const arm = fixture(), intel = fixture('1.1.1', 'x86_64');
  const root = await mkdtemp(join(tmpdir(), 'turtle-updates-'));
  const fetcher = async url => url.startsWith('https://api.github.com/') ? Response.json([arm.release, intel.release]) :
    (url.includes('/v1.1.1/') ? intel.fetcher(url) : arm.fetcher(url));
  try {
    await syncRelease(join(root, 'releases.json'), fetcher, join(root, 'updates'));
    assert.deepEqual(await readFile(join(root, 'updates/editor/x86_64/appcast.xml')), intel.files.get('editor-x86_64-appcast.xml'));
    assert.deepEqual(await readFile(join(root, 'updates/editor/arm64/appcast.xml')), arm.files.get('editor-arm64-appcast.xml'));
  } finally { await rm(root, { recursive: true }); }
});
test('unknown attachments remain rejected with update feeds', async () => {
  const f = fixture(); f.release.assets.push({ name: 'private.log', size: 1, state: 'uploaded' });
  await assert.rejects(verifyRelease(f.release, f.fetcher), /Unexpected public attachments/);
});
for (const [name, transform] of [
  ['wrong target', xml => xml.replace('/notes-1.2.0-3-arm64-release.dmg', '/editor-1.2.0-3-arm64-release.dmg')],
  ['wrong build', xml => xml.replace('<sparkle:version>3', '<sparkle:version>4')],
  ['wrong display version', xml => xml.replace('<sparkle:shortVersionString>1.2.0', '<sparkle:shortVersionString>2.0.0')],
  ['wrong minimum system', xml => xml.replace('>14.0<', '>15.0<')],
  ['missing signature', xml => xml.replace(/sparkle:edSignature="[^"]*"/, '')],
  ['DTD', xml => xml.replace('<rss', '<!DOCTYPE rss><rss')],
]) test(`reject semantically incorrect appcast: ${name}`, async () => {
  const f = fixture(); const feed = f.data.products[0].update;
  const xml = Buffer.from(transform(f.files.get(feed.filename).toString('utf8')));
  f.files.set(feed.filename, xml); feed.bytes = xml.length; feed.sha256 = hash(xml); f.refresh();
  await assert.rejects(verifyRelease(f.release, f.fetcher), /Appcast|appcast/);
});
