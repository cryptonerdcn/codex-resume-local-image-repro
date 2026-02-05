# Codex SDK resume + local_image Repro

This repo contains a focused, English-only reproduction harness for a Codex SDK bug:
when `resumeThread()` is combined with `local_image`, the SDK used to emit CLI
arguments in the wrong order, causing the CLI to treat `resume`/UUID as an image
path and start a new session.

## Contents
- `reports/verify-args-order.mjs`: Inspects CLI arg order (no API key required)
- `reports/verify-resume-local-image.mjs`: End-to-end check using `thread.run`
- `reports/verify-args-order-runstreamed.mjs`: Arg order check for `runStreamed`
- `reports/verify-resume-local-image-runstreamed.mjs`: End-to-end check for `runStreamed`
- `reports/final-report.md`: Full report
- `reports/pr.md`: PR template text
- `image/test_image.png`: Test image used by scripts

## Prerequisites
- Node.js >= 18
- Codex CLI available on PATH (or set `CODEX_PATH_OVERRIDE`)
- `OPENAI_API_KEY` (or `CODEX_API_KEY`) for end-to-end tests

## Build SDK from source
This repo expects you to test a locally built SDK from the official Codex source.

```bash
# Clone upstream
cd ..
git clone https://github.com/openai/codex.git codex-upstream

# Build SDK
cd codex-upstream/sdk/typescript
npm install
npm run build
npm pack
```

Install the local tarball into this repo:

```bash
cd ../codex-resume-local-image-repro
npm install ../codex-upstream/sdk/typescript/*.tgz
```

## Repro Steps

### 1) Args-order check (no API key)
```bash
node reports/verify-args-order.mjs
node reports/verify-args-order-runstreamed.mjs
```

Expected (after fix): `ORDER_OK`

### 2) End-to-end check (API key required)
```bash
export OPENAI_API_KEY=...
node reports/verify-resume-local-image.mjs
node reports/verify-resume-local-image-runstreamed.mjs
```

Expected (after fix): `sameThreadId: true`

## Notes
- `runStreamed` accepts `local_image` in the SDK implementation, but is not
  explicitly documented. See `reports/final-report.md` for details.
- If Codex CLI is not on PATH, set `CODEX_PATH_OVERRIDE=/path/to/codex`.

## runStreamed local_image Usage (example)
```js
import { Codex } from "@openai/codex-sdk";

const codex = new Codex({ apiKey: process.env.OPENAI_API_KEY });
const thread = codex.startThread({
  workingDirectory: process.cwd(),
  skipGitRepoCheck: true,
});

const streamed = await thread.runStreamed([
  { type: "local_image", path: "image/test_image.png" },
  { type: "text", text: "describe the image in one word" },
]);

for await (const event of streamed.events) {
  if (event.type === "thread.started") {
    console.log("thread id:", event.thread_id);
  }
}
```
