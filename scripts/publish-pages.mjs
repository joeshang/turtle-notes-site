import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repository, syncRelease } from './sync-release.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

// Use gh's existing login for API reads. Never extract an OAuth token or
// attach credentials to release-download/CDN requests.
export async function releaseFetch(url, options, api = async endpoint => {
  const { stdout } = await execute('gh', ['api', '--hostname', 'github.com', endpoint], { cwd: root, maxBuffer: 8 * 1024 * 1024, timeout: 120_000 });
  return stdout;
}, anonymousFetch = fetch) {
  const parsed = new URL(url);
  if (parsed.origin === 'https://api.github.com') {
    const body = await api(parsed.pathname.slice(1) + parsed.search);
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  }
  return anonymousFetch(url, options);
}

async function command(file, args, cwd = root) {
  const result = await execute(file, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return result.stdout.trim();
}

export function validateRequestedRelease(result, { releaseTag, releaseBuild } = {}) {
  if (!result) throw new Error('No verified release available; nothing published');
  for (const id of ['notes', 'editor']) {
    if (releaseTag && `v${result[id]?.version}` !== releaseTag) throw new Error(`Latest verified ${id} release differs from requested ${releaseTag}; nothing published`);
    if (releaseBuild && result[id]?.build !== releaseBuild) throw new Error(`Verified ${id} build differs from requested ${releaseBuild}; nothing published`);
  }
}

export async function publish({ releaseTag, releaseBuild, expectedRepository, resultFile } = {}) {
  if (expectedRepository && expectedRepository !== repository) throw new Error('Publisher repository differs from the requested target');
  if (releaseTag && !/^v\d+\.\d+(?:\.\d+)?$/.test(releaseTag)) throw new Error('Invalid requested release tag');
  if (releaseBuild && !/^[1-9]\d*$/.test(releaseBuild)) throw new Error('Invalid requested build number');
  const sourceCommit = await command('git', ['rev-parse', 'HEAD']);
  const result = await syncRelease(join(root, 'src/data/releases.json'), releaseFetch, join(root, 'public/updates'));
  validateRequestedRelease(result, { releaseTag, releaseBuild });
  process.stdout.write(await command('npm', ['test']) + '\n');
  process.stdout.write(await command('npm', ['run', 'verify']) + '\n');
  const version = result.notes.version;
  const temporary = await mkdtemp(join(tmpdir(), 'turtle-pages-publish-'));
  try {
    const checkout = join(temporary, 'site');
    const remote = `https://github.com/${repository}.git`;
    const existing = await command('git', ['ls-remote', '--heads', remote, 'refs/heads/gh-pages']);
    await command('git', ['init', '--initial-branch=gh-pages', checkout]);
    await command('git', ['remote', 'add', 'origin', remote], checkout);
    if (existing) {
      await command('git', ['fetch', '--depth=1', 'origin', 'gh-pages'], checkout);
      await command('git', ['reset', '--hard', 'FETCH_HEAD'], checkout);
      for (const entry of await readdir(checkout)) if (entry !== '.git') await rm(join(checkout, entry), { recursive: true, force: true });
    }
    await cp(join(root, 'dist'), checkout, { recursive: true });
    await writeFile(join(checkout, '.nojekyll'), '');
    await command('git', ['add', '.'], checkout);
    const changed = await command('git', ['diff', '--cached', '--name-only'], checkout);
    if (changed) {
      await command('git', ['commit', '-m', `publish: macOS ${version}`], checkout);
      // A concurrent publisher must not be overwritten.
      await command('git', ['push', 'origin', 'HEAD:refs/heads/gh-pages'], checkout);
    }
    const commit = await command('git', ['rev-parse', 'HEAD'], checkout);
    const receipt = { schema: 1, repository, tag: `v${version}`, version, build: result.notes.build ?? null, sourceCommit, pagesCommit: commit };
    if (resultFile) {
      const target = resolve(resultFile);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(`${target}.tmp`, JSON.stringify(receipt, null, 2) + '\n');
      await rename(`${target}.tmp`, target);
    }
    console.log(`Published verified static files for ${version}: gh-pages ${commit}`);
    return receipt;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    'release-tag': { type: 'string' }, 'release-build': { type: 'string' },
    repository: { type: 'string' }, 'result-file': { type: 'string' },
  } });
  await publish({ releaseTag: values['release-tag'], releaseBuild: values['release-build'],
    expectedRepository: values.repository, resultFile: values['result-file'] });
}
