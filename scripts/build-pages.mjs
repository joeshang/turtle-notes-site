import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from './publish-pages.mjs';

const requestId = process.env.RELEASE_REQUEST_ID || '';
if (requestId && !/^[a-f0-9]{32}$/.test(requestId)) throw new Error('Invalid release request identifier');
const runId = process.env.GITHUB_RUN_ID || null;
if (runId && !/^[1-9]\d*$/.test(runId)) throw new Error('Invalid workflow run identifier');
const result = await buildPages({ releaseTag: process.env.RELEASE_TAG || undefined,
  releaseBuild: process.env.RELEASE_BUILD || undefined, expectedRepository: process.env.RELEASE_REPOSITORY || undefined });
const root = fileURLToPath(new URL('..', import.meta.url));
await writeFile(join(root, 'dist/deployment.json'), JSON.stringify({ ...result, requestId, workflowRunId: runId }, null, 2) + '\n');
