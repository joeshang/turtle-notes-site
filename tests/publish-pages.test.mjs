import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseFetch, readGitHubApi, validateRequestedRelease } from '../scripts/publish-pages.mjs';

test('local publisher reads GitHub metadata through the existing gh login', async () => {
  const calls = [];
  const response = await releaseFetch('https://api.github.com/repos/joeshang/turtle-notes-site/releases?per_page=100', {},
    async endpoint => { calls.push(endpoint); return '[]'; },
    async () => { throw new Error('API request was anonymous'); });
  assert.deepEqual(calls, ['repos/joeshang/turtle-notes-site/releases?per_page=100']);
  assert.deepEqual(await response.json(), []);
});

test('release downloads remain anonymous and do not use gh credentials', async () => {
  let called = false;
  const options = { headers: { Accept: 'application/octet-stream' } };
  const response = await releaseFetch('https://github.com/joeshang/turtle-notes-site/releases/download/v1.2.0/test.dmg', options,
    async () => { throw new Error('Download must not use authenticated API'); },
    async (url, passed) => { called = true; assert.equal(passed, options); return new Response('bytes'); });
  assert.ok(called); assert.equal(await response.text(), 'bytes');
});

test('release integration accepts only the requested version and both build numbers', () => {
  const result = { notes: { version: '1.2.0', build: '5' }, editor: { version: '1.2.0', build: '5' } };
  const options = { releaseTag: 'v1.2.0', releaseBuild: '5' };
  validateRequestedRelease(result, options);
  assert.throws(() => validateRequestedRelease(result, { ...options, releaseTag: 'v1.3.0' }), /differs/);
  assert.throws(() => validateRequestedRelease(result, { ...options, releaseBuild: '6' }), /differs/);
  assert.throws(() => validateRequestedRelease({ ...result, editor: { ...result.editor, build: '6' } }, options), /editor build/);
  assert.throws(() => validateRequestedRelease({ notes: { version: '1.2.0' }, editor: { version: '1.2.0' } }, options), /build differs/);
});

test('Actions token is used only for API reads and authentication errors fail closed', async () => {
  const calls = [];
  assert.equal(await readGitHubApi('repos/example/site/releases', 'test-token', async (url, options) => {
    calls.push({ url, options }); return Response.json([]);
  }), '[]');
  assert.equal(calls[0].url, 'https://api.github.com/repos/example/site/releases');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  await assert.rejects(readGitHubApi('repos/example/site/releases', 'test-token', async () => new Response('', { status: 403 })), /403/);
});
