# PR: fix resume args order for local_image

## Title
fix: ensure resume args precede image args

## Summary
When `local_image` is provided with `resumeThread`, the SDK emits CLI args with `--image` before `resume <threadId>`. The CLI interprets `resume`/UUID as image paths, so it starts a new session instead of resuming. This PR reorders arguments so `resume <threadId>` appears before `--image`, and adds a regression test.

## Repro
1. Build SDK from source
2. Run resume + local_image:
   - Args order: `--image <path> resume <id>`
   - Result: new session created (thread id changes)

## Fix
Move `resume <threadId>` before `--image` in `CodexExec.run`.

## Tests
- `npm test`
  - NOTE: fails locally without codex-rs binary (`codex-rs/target/debug/codex`)

## Verification (local)
- Args order: ORDER_BAD -> ORDER_OK
- E2E thread.run: sameThreadId false -> true
- E2E runStreamed: sameThreadId false -> true

## Links
- OpenAI issue: https://github.com/openai/codex/issues/10708
- Bug report (repro repo): https://github.com/cryptonerdcn/codex-resume-local-image-repro/issues/1
- Repro repo: https://github.com/cryptonerdcn/codex-resume-local-image-repro

## Files changed
- `sdk/typescript/src/exec.ts`
- `sdk/typescript/tests/exec.test.ts`
