import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

export async function publish() {
  const result = await syncRelease(join(root, 'src/data/releases.json'), releaseFetch, join(root, 'public/updates'));
  if (!result) throw new Error('No verified release available; nothing published');
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
    console.log(`Published verified static files for ${version}: gh-pages ${commit}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await publish();
