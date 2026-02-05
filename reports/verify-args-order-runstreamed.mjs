#!/usr/bin/env node
// Verify codex-sdk CLI argument order for resume + local_image using runStreamed.
// Prints ORDER_OK if resume appears before --image, otherwise ORDER_BAD.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-args-stream-'));
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

const argsLogPath = path.join(tmpDir, 'codex-args.json');
const wrapperPath = path.join(tmpDir, 'codex-wrapper.js');

const wrapper = `#!/usr/bin/env node\n` +
`const fs = require('node:fs');\n` +
`const logPath = process.env.CODEX_ARGS_LOG;\n` +
`const argv = process.argv.slice(2);\n` +
`if (logPath) {\n` +
`  fs.writeFileSync(logPath, JSON.stringify({ argv }, null, 2));\n` +
`}\n` +
`process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'fake-thread' }) + '\\n');\n` +
`process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: null }) + '\\n');\n`;

fs.writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
process.env.CODEX_ARGS_LOG = argsLogPath;

try {
  const { Codex } = await import('@openai/codex-sdk');
  const codex = new Codex({ codexPathOverride: wrapperPath });
  const thread = codex.resumeThread('00000000-0000-0000-0000-000000000000', {
    workingDirectory: process.cwd(),
    skipGitRepoCheck: true
  });
  const streamed = await thread.runStreamed([
    { type: 'local_image', path: imgPath },
    { type: 'text', text: 'describe the image' }
  ]);
  for await (const _event of streamed.events) {
    // drain
  }

  const logged = JSON.parse(fs.readFileSync(argsLogPath, 'utf8'));
  const argv = Array.isArray(logged?.argv) ? logged.argv : [];
  const resumeIndex = argv.indexOf('resume');
  const imageIndex = argv.indexOf('--image');
  const orderOk = resumeIndex !== -1 && imageIndex !== -1 && resumeIndex < imageIndex;
  console.log(JSON.stringify({
    argv,
    resumeIndex,
    imageIndex,
    order: orderOk ? 'ORDER_OK' : 'ORDER_BAD'
  }, null, 2));
} catch (err) {
  console.error('Unexpected error:', err);
  process.exit(1);
} finally {
  try { fs.unlinkSync(argsLogPath); } catch {}
  try { fs.unlinkSync(wrapperPath); } catch {}
  if (imgPath === imgPathFallback) {
    try { fs.unlinkSync(imgPath); } catch {}
  }
  try { fs.rmdirSync(tmpDir); } catch {}
}
