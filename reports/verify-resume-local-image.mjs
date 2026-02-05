#!/usr/bin/env node
// End-to-end verification: resume + local_image should keep same thread id.
// Requires: @openai/codex-sdk installed, Codex CLI available, and API key.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const apiKey = process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || '';
if (!apiKey) {
  console.error('Missing API key. Set CODEX_API_KEY or OPENAI_API_KEY.');
  process.exit(1);
}

function findInPath(cmd) {
  const pathEnv = process.env.PATH || '';
  const parts = pathEnv.split(path.delimiter);
  for (const p of parts) {
    const full = path.join(p, cmd);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const codexPath = process.env.CODEX_PATH_OVERRIDE ||
  findInPath(process.platform === 'win32' ? 'codex.exe' : 'codex');
if (!codexPath) {
  console.error('Codex CLI not found. Set CODEX_PATH_OVERRIDE or ensure codex is on PATH.');
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-e2e-'));
const imgPathFallback = path.join(tmpDir, 'tiny.png');
const imgPathCandidate = path.resolve('image/test_image.png');
const imgPath = fs.existsSync(imgPathCandidate) ? imgPathCandidate : imgPathFallback;

if (imgPath === imgPathFallback) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    'base64'
  );
  fs.writeFileSync(imgPath, png);
}

const { Codex } = await import('@openai/codex-sdk');
const codex = new Codex({ apiKey, codexPathOverride: codexPath });

const thread = codex.startThread({ workingDirectory: process.cwd(), skipGitRepoCheck: true });

// Warm-up run (text only) to establish thread id
await thread.run('ping');
const initialId = thread.id;

const resumed = codex.resumeThread(initialId, { workingDirectory: process.cwd(), skipGitRepoCheck: true });
const resumeId = resumed.id;

await resumed.run([
  { type: 'local_image', path: imgPath },
  { type: 'text', text: 'describe the image in one word' }
]);

const reportedId = resumed.id || null;

console.log(JSON.stringify({
  initialId,
  resumeId,
  reportedId,
  sameThreadId: reportedId ? reportedId === initialId : 'unknown'
}, null, 2));

try { if (imgPath === imgPathFallback) fs.unlinkSync(imgPath); } catch {}
try { fs.rmdirSync(tmpDir); } catch {}
