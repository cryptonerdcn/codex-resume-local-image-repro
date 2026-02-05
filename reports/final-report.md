# Codex SDK Resume + local_image Bug Report (Local Build + PR Prep)

日期: 2026-02-05

## 1. 摘要
在 Codex TypeScript SDK 中，当 `resumeThread()` + `local_image` 同时使用时，SDK 生成的 CLI 参数顺序为 `--image ... resume <threadId>`。Codex CLI 会将 `resume` 与 UUID 当作图片路径，从而**忽略 resume 并新建会话**，导致 `threadId` 发生变化。

修复方式: 在 SDK 中确保 `resume <threadId>` **始终在** `--image` 之前。

本地验证显示:
- 修复前: `thread.run` 与 `runStreamed` 都出现 **threadId 变化**。
- 修复后: `thread.run` 与 `runStreamed` 都保持同一 threadId。

## 2. 环境
- Node: v23.11.0
- npm: 10.9.2
- Codex CLI: `/opt/homebrew/bin/codex` (PATH 可见)
- API Key: 使用 `OPENAI_API_KEY`
- SDK 来源: `https://github.com/openai/codex` 本地构建 `sdk/typescript`

## 3. 复现条件
- 使用 `resumeThread(threadId)`
- 输入包含 `local_image`
- SDK 生成的参数顺序是 `--image` 在前，`resume` 在后

## 4. 复现步骤

### A. 参数顺序检查 (无需 API Key)
1. 安装本地构建 SDK
2. 运行 `node reports/verify-args-order.mjs`
3. 输出 `ORDER_BAD` 表示 resume 在 image 之后

### B. 端到端验证 (需要 API Key + Codex CLI)
1. `node reports/verify-resume-local-image.mjs`
2. 观察 `sameThreadId` 是否为 `false`

### C. runStreamed 验证 (需要 API Key + Codex CLI)
1. `node reports/verify-args-order-runstreamed.mjs`
2. `node reports/verify-resume-local-image-runstreamed.mjs`

## 5. 复现结果

### 修复前
- 参数顺序 (`thread.run`): `ORDER_BAD`
- 参数顺序 (`runStreamed`): `ORDER_BAD`
- 端到端 (`thread.run`): `sameThreadId: false`
- 端到端 (`runStreamed`): `sameThreadId: false`

### 修复后
- 参数顺序 (`thread.run`): `ORDER_OK`
- 参数顺序 (`runStreamed`): `ORDER_OK`
- 端到端 (`thread.run`): `sameThreadId: true`
- 端到端 (`runStreamed`): `sameThreadId: true`

## 6. 根因分析
在 `sdk/typescript/src/exec.ts` 中构建 CLI 参数时，SDK 先拼接 `--image`，再拼接 `resume <threadId>`。CLI 按序解析，导致将 `resume`/UUID 误判为图片路径，从而忽略 resume。

## 7. 修复方案
在 `sdk/typescript/src/exec.ts` 中，移动 resume 参数拼接逻辑至 image 之前:

- before:
  - `--image` ... `resume <threadId>`
- after:
  - `resume <threadId>` ... `--image`

新增回归测试 `tests/exec.test.ts`，断言 `resume` 在 `--image` 之前。

## 8. 验证说明
- SDK 单测: `npm test` 在本机失败，原因是缺少 `codex-rs/target/debug/codex` 二进制 (ENOENT)。
- 不影响本次修复的逻辑正确性，但建议在具备 codex-rs 编译产物的环境中重跑。

## 9. PR 内容 (建议)

**分支**: `codex/resume-image-args-order`

**提交**: `fix: ensure resume args precede image args`

**变更文件**:
- `sdk/typescript/src/exec.ts`
- `sdk/typescript/tests/exec.test.ts`

**PR 描述模板**:
```
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
```

---

# 附加篇章: runStreamed 上传 local_image 用法

> 官方文档未提供 `runStreamed` 上传图片的示例，但 SDK 实现上是支持的。

示例:
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

注意事项:
- 若运行环境不支持图片输入或 CLI 解析失败，可能抛错；可在 catch 中降级为文本输入。
- 从稳定性角度，如果你依赖图片输入，`thread.run` 仍是官方文档明确给出的接口。
