#!/usr/bin/env node
// End-to-end verification using runStreamed: resume + local_image should keep same thread id.
// If runStreamed rejects local_image, fall back to text-only runStreamed to confirm resume stability.

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-e2e-stream-'));
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

// Warm-up runStreamed to establish thread id
{
  const warm = await thread.runStreamed('ping');
  for await (const _event of warm.events) {
    // drain
  }
}
const initialId = thread.id;

const resumed = codex.resumeThread(initialId, { workingDirectory: process.cwd(), skipGitRepoCheck: true });
let resumeId = resumed.id;

try {
  const streamed = await resumed.runStreamed([
    { type: 'local_image', path: imgPath },
    { type: 'text', text: 'describe the image in one word' }
  ]);
  let streamedThreadId = null;
  for await (const event of streamed.events) {
    if (event?.type === 'thread.started') {
      streamedThreadId = event.thread_id;
    }
  }
  resumeId = resumed.id;
  const reportedId = streamedThreadId || resumed.id || null;
  console.log(JSON.stringify({
    initialId,
    resumeId,
    reportedId,
    sameThreadId: reportedId ? reportedId === initialId : 'unknown',
    unsupported: false
  }, null, 2));
} catch (err) {
  const errorMessage = String(err?.message || err);
  let textOnlySameThreadId = 'unknown';
  let textOnlyReportedId = null;
  let textOnlyError = null;
  try {
    const resumedText = codex.resumeThread(initialId, { workingDirectory: process.cwd(), skipGitRepoCheck: true });
    const streamedText = await resumedText.runStreamed('ping');
    let streamedThreadId = null;
    for await (const event of streamedText.events) {
      if (event?.type === 'thread.started') {
        streamedThreadId = event.thread_id;
      }
    }
    const reported = streamedThreadId || resumedText.id || null;
    textOnlyReportedId = reported;
    textOnlySameThreadId = reported ? reported === initialId : 'unknown';
  } catch (err2) {
    textOnlyError = String(err2?.message || err2);
  }

  console.log(JSON.stringify({
    initialId,
    resumeId,
    unsupported: true,
    error: errorMessage,
    textOnlyReportedId,
    textOnlySameThreadId,
    textOnlyError
  }, null, 2));
} finally {
  try { if (imgPath === imgPathFallback) fs.unlinkSync(imgPath); } catch {}
  try { fs.rmdirSync(tmpDir); } catch {}
}
