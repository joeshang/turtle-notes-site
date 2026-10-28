import { createHash } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const repository = 'joeshang/turtle-notes-site';
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/;
function requireValue(condition, message) { if (!condition) throw new Error(message); }
const hash = value => createHash('sha256').update(value).digest('hex');
const downloadURL = (tag, name) => `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;

async function request(fetcher, url) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(120_000), headers: { Accept: url.startsWith('https://api.github.com/') ? 'application/vnd.github+json' : 'application/octet-stream' } });
  requireValue(response.ok, `GitHub request failed (${response.status}): ${url}`);
  return response;
}
async function boundedBytes(fetcher, url, size) {
  const response = await request(fetcher, url);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    requireValue(bytes <= size, 'Download exceeds declared size');
    chunks.push(chunk);
  }
  requireValue(bytes === size, 'Downloaded size differs');
  return Buffer.concat(chunks);
}
async function verifyDmg(fetcher, asset, record, tag) {
  if (asset.digest) {
    requireValue(asset.digest === `sha256:${record.sha256}`, 'DMG digest mismatch');
  } else {
    // Older GitHub responses lack digest. Stream and hash without buffering the DMG.
    const response = await request(fetcher, downloadURL(tag, record.filename));
    const digest = createHash('sha256'); let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      requireValue(bytes <= record.bytes, 'DMG exceeds declared size');
      digest.update(chunk);
    }
    requireValue(bytes === record.bytes && digest.digest('hex') === record.sha256, 'DMG download verification failed');
  }
}
export async function verifyRelease(release, fetcher = fetch) {
  requireValue(!release.draft && !release.prerelease && release.tag_name?.startsWith('v') && versionPattern.test(release.tag_name.slice(1)), 'Not a stable published release');
  const assets = new Map();
  for (const asset of release.assets ?? []) {
    requireValue(!assets.has(asset.name) && asset.state === 'uploaded', 'Duplicate or incomplete asset');
    assets.set(asset.name, asset);
  }
  const metadata = assets.get('turtle-downloads.json');
  requireValue(metadata && Number.isSafeInteger(metadata.size) && metadata.size > 0 && metadata.size <= 65536, 'Missing or oversized download metadata');
  const bytes = await boundedBytes(fetcher, downloadURL(release.tag_name, metadata.name), metadata.size);
  const digest = hash(bytes);
  requireValue(release.body?.includes(`<!-- turtle-public-release:${digest} -->`), 'Metadata provenance differs from release');
  if (metadata.digest) requireValue(metadata.digest === `sha256:${digest}`, 'Metadata digest mismatch');
  const data = JSON.parse(bytes.toString('utf8'));
  requireValue(data.schema === 1 && data.repository === repository && data.tag === release.tag_name && data.version === release.tag_name.slice(1), 'Metadata repository, schema or version mismatch');
  requireValue(Array.isArray(data.products) && data.products.length === 2, 'Expected two products');
  const result = {}; const expected = new Set(['turtle-downloads.json']);
  for (const record of data.products) {
    requireValue(['notes', 'editor'].includes(record.id) && !result[record.id], 'Duplicate or unknown product');
    requireValue(typeof record.filename === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_.-]*-release\.dmg$/u.test(record.filename) && record.checksumFilename === `${record.filename}.sha256`, 'Invalid artifact name');
    requireValue(/^[a-f0-9]{64}$/.test(record.sha256) && Number.isSafeInteger(record.bytes) && record.bytes > 0, 'Invalid digest or size');
    requireValue(['arm64', 'x86_64'].includes(record.architecture) && /^\d+\.\d+(?:\.\d+)?$/.test(record.minimumMacOS), 'Invalid architecture or system requirement');
    requireValue(!expected.has(record.filename), 'Two products must have distinct artifacts');
    const dmg = assets.get(record.filename); const checksum = assets.get(record.checksumFilename);
    const expectedChecksum = `${record.sha256}  ${record.filename}\n`;
    requireValue(dmg?.size === record.bytes && checksum?.size === Buffer.byteLength(expectedChecksum), 'Missing or wrong-sized artifact');
    const checksumBytes = await boundedBytes(fetcher, downloadURL(data.tag, record.checksumFilename), checksum.size);
    requireValue(checksumBytes.toString('utf8') === expectedChecksum, 'Checksum file mismatch');
    if (checksum.digest) requireValue(checksum.digest === `sha256:${hash(checksumBytes)}`, 'Checksum asset digest mismatch');
    await verifyDmg(fetcher, dmg, record, data.tag);
    expected.add(record.filename); expected.add(record.checksumFilename);
    result[record.id] = {
      version: data.version, minimumMacOS: record.minimumMacOS,
      architecture: record.architecture === 'arm64' ? 'Apple Silicon' : 'Intel',
      downloadURL: downloadURL(data.tag, record.filename), checksumURL: downloadURL(data.tag, record.checksumFilename),
    };
  }
  requireValue(assets.size === expected.size && [...assets.keys()].every(name => expected.has(name)), 'Unexpected public attachments');
  return result;
}
export async function syncRelease(destination = 'src/data/releases.json', fetcher = fetch) {
  // List rather than interpreting 404/auth/network errors as "no release".
  const response = await request(fetcher, `https://api.github.com/repos/${repository}/releases?per_page=100`);
  const releases = await response.json();
  requireValue(Array.isArray(releases), 'Invalid release list');
  const candidates = releases.filter(item => !item.draft && !item.prerelease && versionPattern.test(item.tag_name?.slice(1)) && item.tag_name.startsWith('v'));
  candidates.sort((a, b) => {
    const av = a.tag_name.slice(1).split('.').map(Number), bv = b.tag_name.slice(1).split('.').map(Number);
    return (bv[0] - av[0]) || (bv[1] - av[1]) || ((bv[2] ?? 0) - (av[2] ?? 0));
  });
  if (!candidates.length) { console.log('No stable public release yet; existing download configuration retained.'); return null; }
  const result = await verifyRelease(candidates[0], fetcher);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(result, null, 2) + '\n');
  await rename(temporary, destination);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncRelease();
}
