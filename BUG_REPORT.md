# Bug Report: resume + local_image starts a new session

## Summary
When `resumeThread()` is used with `local_image`, the SDK emits CLI arguments in
an order that causes the Codex CLI to interpret `resume`/UUID as image paths.
The CLI then starts a new session instead of resuming the existing thread.

## Environment
- SDK: `@openai/codex-sdk` (built from source)
- Codex CLI: available on PATH (or set `CODEX_PATH_OVERRIDE`)
- Node: >= 18

## Steps to Reproduce
1. Build the SDK from source (see README)
2. Install the local tarball in this repo
3. Run:
   ```bash
   node reports/verify-args-order.mjs
   node reports/verify-resume-local-image.mjs
   ```

## Expected
- Args order: `resume <threadId>` appears before `--image`
- `sameThreadId: true`

## Actual (before fix)
- Args order: `--image` appears before `resume <threadId>`
- `sameThreadId: false`

## Root Cause
In `sdk/typescript/src/exec.ts`, the SDK appended `--image` flags before `resume <threadId>`.

## Fix
Move `resume <threadId>` before any `--image` flags, and add a regression test.
