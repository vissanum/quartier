# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast,
trust your instincts, and ship with confidence — without them, vibe coding is
just yolo coding. With tests, it's a superpower.

## Framework

[Vitest](https://vitest.dev) v4 — zero-config, ESM-native, fast.

## Run

```bash
npm test          # full suite (vitest run)
npx vitest        # watch mode while developing
npx vitest run test/rewrite-paths.test.js   # one file
```

## Layout

```
test/*.test.js    # one file per module under test, mirrors the source name
```

## Conventions

- Tests import with ESM (`import { describe, it, expect } from 'vitest'`);
  source modules stay CommonJS — Vitest handles the interop.
- Test real behavior with meaningful assertions. Never `toBeDefined()` —
  assert what the function DOES with realistic inputs.
- Pure modules first (deploy/rewrite-paths, lib/emails). Modules that touch
  the filesystem or network get fixtures or are exercised via the QA flow.
- Regression tests carry an attribution comment: what broke, found by whom,
  date, and the report path.

## What to test when

- New function → a test alongside it
- Bug fix → a regression test that would have caught it
- Error handling → a test that triggers the error
- New conditional → tests for BOTH paths
- Never commit code that makes existing tests fail
