# Boris V2 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Complete Boris V2 in the existing Absurd OS without losing V1 progress or mechanics.

**Architecture:** Preserve engine.js/content.js as the V1 core; world.js composes validated V2 data and mutations. React renders inert text; only whitelisted experiment commands can mutate the world. GitHub Pages hosts the offline frontend; optional Cloudflare Worker holds provider secrets.

**Tech Stack:** React 19, Vite 6, Web Audio, node:test, Playwright, Workbox, Cloudflare Workers.

## 1. Recover world engine
Files: src/world.js, tests/world.test.js. Run existing failing tests first (`node --test tests/world.test.js`); implement wrappers preserving extensions, migration, validated experiments, bounded rare events and achievements. Re-run engine/world tests. No changes to V1 contracts or storage key.

## 2. Verify offline Boris and AI boundary
Files: src/boris*.js, src/ai-client.js, worker/*, corresponding node tests, docs/AI-SETUP.md. Isolate the stalled test, reproduce with a regression, fix minimally; pass bounded requests, full structured context, input/output validation, request/cost caps and server timeouts. Document setup, consent and fallback without claiming live deployment.

## 3. Laboratory tracer bullet
Files: src/BorisLab.jsx, src/boris.css, src/main.jsx, tests/browser/v2.spec.js. Run the existing missing-Boris test (RED). Add #boris navigation and lab, local reply and save. Pass chat/reload scenario before experiments integration. Then run experiment confirmation/archive scenario (RED), implement parent-owned validated execution and full event dialog, re-run (GREEN).

## 4. Reactive world UI
Files: src/Anomaly.jsx, src/camera.css, src/main.jsx, src/v2.css, tests/browser/v2-world.spec.js. Add and run stage-boundary/effects/critical-ending tests first. Connect camera without replacing its eye design. Hook world pulse only on visible pages at bounded cadence, suppress catch-up; add V2 achievements, hidden-until-unlocked cards, risk/source archive filters. Preserve all V1 selectors, buttons and secret sequences.

## 5. Sound and settings
Files: src/main.jsx, src/audio.js, corresponding tests. Keep sound off initially and preserve the V1 alarm notes. Add volume/channel controls and explicit opt-in AI endpoint with privacy disclosure. Abort pending AI on setting changes/restart/unmount; always fall back locally on errors.

## 6. Acceptance and release
Run `npm test`, `node --test scripts/pwa.test.mjs`, `npm run build`, `PWA_TEST=1 npx playwright test --workers=1`, real SW update regression, and new offline lab checks. Inspect desktop/mobile screenshots. Review diff/security and obtain independent specification then quality reviews, fix blockers with regressions. Update README/version, commit verified changes, push, verify remote commit, Actions success and deployed browser scenarios. Physical Android/iPhone installation remains explicitly unverified unless real devices are available.
