# Optional Boris AI: Cloudflare Worker

## Подключение для владельца приложения

Сейчас настоящий AI не подключён: приложение работает с автономным Борисом. Для обычной игры ничего настраивать не нужно.

Если позже захотите включить нейросеть:

1. Создайте аккаунт Cloudflare и получите ключ выбранного OpenAI-совместимого провайдера. В кабинете провайдера установите жёсткий денежный лимит. Ограничения Worker не заменяют лимит расходов в деньгах.
2. В корне проекта выполните `npx wrangler@4 login` и авторизуйтесь самостоятельно в браузере.
3. В `worker/wrangler.toml` укажите `AI_BASE_URL` и `AI_MODEL`. Это публичные параметры; ключ в этот файл не вставляйте. Оставьте `AI_ENABLED = "false"` до проверки бюджета и настроек.
4. Выполните `npx wrangler@4 secret put AI_API_KEY --config worker/wrangler.toml` и введите ключ в защищённом интерактивном запросе. Не присылайте его в чат и не добавляйте в Git.
5. По готовности измените `AI_ENABLED` на `"true"` и выполните `npx wrangler@4 deploy --config worker/wrangler.toml`. Команда создаёт внешние ресурсы Cloudflare; нижеописанные ограничения расходов должны быть понятны владельцу до этого шага.
6. Скопируйте полученный публичный адрес вида `https://absurd-os-boris.<account>.workers.dev/boris`. В приложении откройте «Настройки» → «Адрес AI-сервера», вставьте адрес и включите «Использовать AI-сервер». API-ключ в браузер не вводится.
7. Отправьте сообщение из приложения. Только успешно полученный серверный ответ помечается `AI`; ошибка, отсутствие сети или исчерпание лимита дают локальный ответ с уведомлением. `/health` проверяет конфигурацию, но не доказывает работоспособность провайдера.
8. Для отключения снимите переключатель в приложении. Для полного запрета платных вызовов также выставьте `AI_ENABLED = "false"` в Worker и повторите deploy.

Лимиты по умолчанию: 6 запросов с IP за скользящую минуту и 200 запросов суммарно за скользящие сутки, до 250 выходных токенов на вызов. CORS не является авторизацией: посторонний может исчерпать общий лимит. Для публичного AI при необходимости добавьте WAF/Turnstile или настоящую авторизацию. Ключи, аккаунт, deploy и реальный ответ провайдера в ходе разработки не создавались и не проверялись.

## Status and honest offline behavior

No provider account, credential, or deployment is supplied or required for the frontend. Nothing has been deployed. The default is **local authored dialogue**, not an AI model. Do not label a local answer as a successful AI response.

`worker/wrangler.toml` ships with `AI_ENABLED = "false"`. Missing settings, missing secret, disabled service, invalid origin, unavailable limiter, exhausted quota, provider errors and timeouts fail closed. `replyWithFallback` returns a local reply with `mode: "local"` and a sanitized `fallbackReason`; `requestBoris` alone throws a sanitized error. Cancellation propagates instead of generating an unwanted fallback turn.

Node tests exercise the real request handler, streaming/cancellation code and Durable Object class with injected provider responses and transactional memory storage. They are not proof of a deployed service or a provider account. The attempted local Wrangler launch was denied by the execution policy; Cloudflare/workerd runtime and a live provider remain unverified.

## Frontend integration API

Only the public Worker URL belongs in frontend configuration; **never an API key**. There is no implicit environment variable lookup or account detection in these modules. An opt-in UI/caller must explicitly pass `endpoint`.

```js
import { buildContext, appendConversation } from './boris.js';
import { replyWithFallback } from './ai-client.js';

const context = buildContext(world);
const answer = await replyWithFallback(message, context, {
  endpoint: aiOptedIn ? publicWorkerURL : undefined,
  usedLines: world.boris.usedLines,
  signal: abortController.signal,
  timeoutMs: 12000, // optional; default client deadline is 8000 ms
});
// Do this in the caller's normal state updater; modules do not mutate world.
const nextBoris = appendConversation(
  world.boris, message, { ...answer, mood: answer.mood ?? context.mood },
  Date.now(), answer.mode,
);
// Render answer.text as React text, never HTML. Display mode honestly.
```

- `requestBoris(message, context, {endpoint, signal?, timeoutMs?, fetchImpl?})` resolves `{text, command:null, mode:"ai"}` or throws with `.code` (`CONFIG`, `INPUT`, `NETWORK`, `RATE_LIMIT`, `UNAVAILABLE`, `RESPONSE`, `TIMEOUT`, `ABORTED`). No automatic retries.
- `replyWithFallback(message, context, {usedLines?, rng?, ...requestOptions})` resolves the same AI object on success; otherwise resolves `{text, mood, lineId, command:null, mode:"local", fallbackReason}`. An aborted signal still throws `ABORTED`.
- `localReply(message, context, usedLines?, rng?)` is synchronous, network-free and resolves `{text,mood,lineId}`. Critical chaos (81+) overrides topic with panic; otherwise explicit topics or the current one of eight moods choose the pool. World-status questions (`состояние`, `вселенная`, `хаос`, `реальность`) take precedence over the generic name match “Борис”, reporting current chaos, the last operator action/protocol and latest event. Event/action questions also reflect that context; explicit coffee/gravity/etc. questions keep their topic. Exhausted pools reuse their least-recent line instead of jumping to unrelated topics. The phrase library is finite, not generative. Trust questions reflect current trust.
- Persist `usedLines` via `appendConversation` to avoid immediate repetition. Conversation is bounded to 80 rows; recent line memory to 30. AI replies have no `mood` or `lineId`, so retain the existing mood as shown above.

`buildContext(world)` derives a missing active protocol from the last recognized `operatorActions`/`actionTrail` entry, using its matching history title when available. With no trail it uses the newest operator history event, ignoring autonomous `system`/`boris` incidents. An explicit protocol takes precedence.

Only explicitly allowlisted game context is sent: chaos/energy/stability/trust (0–100), catastrophes/universes (0–1,000,000), eight supported mood IDs, screen/activeExperiment (at most 64 characters), activeProtocol title (64), first three recent event titles/types (80/24), last three operator actions (32 each). `achievements` accepts only the eight recognized V1 achievement names and ten V2 achievement IDs; duplicates and unknown values are removed. `secrets` accepts only the public **gameplay mechanism IDs** `logo`, `sequence`, `oracle`. These are discovered game unlocks, not confidential information. Arbitrary secret strings (including `do not transmit`), credentials/API keys/tokens, saved chat, provider settings and unknown fields are dropped. Credentials must never be placed in a message or in allowed free-text game fields: the allowlist is not a credential detector. `worker/context.js` is a shared **data-only** allowlist; the browser never imports `worker/index.js`.

The shared sanitizer additionally caps serialized context at **1024 UTF-8 bytes**. If needed it prunes older events/actions, shortens optional free text, then prunes optional lists/fields. Normal small contexts retain the above bounds; large contexts can contain fewer entries/shorter strings. This reserves space for even a worst-case 500-unit message (3000 JSON bytes when escaped) plus the JSON envelope, keeping generated client requests below the unchanged **4096-byte** Worker input ceiling. This does not relax server limits or shorten the operator's message.

## HTTP interface

All requests must have exact `Origin: https://zhorik333.github.io` (origin has no path or trailing slash). The origin check is fixed in code and must also match `ALLOWED_ORIGIN` in configuration.

- `OPTIONS /boris`: preflight permits only `POST` and `Content-Type`; no credentialed CORS.
- `POST /boris`, `Content-Type: application/json`: body `{"message":"Привет","context":{"chaos":42,"mood":"curious"}}`. Message is nonempty and at most 500 UTF-16 code units. Context, when present, must be an object. Unknown top-level keys are rejected.
- Success: `200 {"text":"…","command":null,"mode":"ai"}`. Provider tool calls never become game actions. Text is nonempty, at most 1800 UTF-16 code units, and must remain inert display text.
- Errors: `{"error":{"code":"…"}}`, without provider body, URLs, stack traces or secrets. Typical HTTP statuses: 400 invalid input; 403 origin/IP denial; 408 upload timeout; 413 body limit; 415 content type; 429 quota; 499 caller cancellation; 502 provider failure; 503 disabled/misconfigured/limiter unavailable; 504 provider timeout.
- `GET /health` from the allowed origin returns `{enabled,configured,providerVerified:false}`. It checks configuration only, never claims successful provider verification or makes a paid probe.

The client permits HTTPS endpoints (or HTTP loopback for development), forbids embedded credentials/URL fragments, omits cookies and refuses redirects. The Worker uses a server-configured HTTPS OpenAI-compatible `AI_BASE_URL` and appends `/chat/completions`; no public request can select a model, endpoint, token budget or API key. Server redirects are refused to avoid leaking Authorization.

## Security / cost boundary

- `AI_API_KEY` exists only as a Worker secret. Never put it in `VITE_*`, public assets, TOML vars, git, URL query parameters or browser storage. `.dev.vars`/`.env*` and Wrangler state are ignored under `worker/`.
- Request stream is bounded to 4096 bytes independently of `Content-Length`; input has a 2-second hard deadline. Invalid JSON/UTF-8, oversized actual bytes and malformed lengths are rejected. Streams are cancelled on overflow/abort.
- A single named `BorisLimiter` Durable Object (`boris-global-v1`) atomically reserves admission in persistent storage before every provider call, across Worker instances. Failed provider calls still spend an admission; no retries/refunds.
- Defaults: **6 requests per IP per rolling minute**, **200 requests globally per rolling 24 hours**. `CF-Connecting-IP` must be valid; its SHA-256 digest, not the raw IP, is sent to storage. This is pseudonymization, not anonymity. Production relies on Cloudflare setting this header; do not expose a local development server publicly.
- Limits fail closed on invalid settings/storage errors. Limiter round-trip has a 1-second hard deadline. Maximum accepted administrative settings are 100/minute and 10,000/day; increasing defaults deliberately increases spend. Keep defaults unless you have reviewed provider pricing and budget.
- Provider output is capped with `max_tokens:250`, an 8-second hard deadline covering fetch **and** body, and a 65536-byte response cap. Client independently bounds response to 8192 bytes and enforces its own fetch/body deadline, including noncooperative streams.
- This is a bounded **request/token** budget, not a dollar accounting system. Provider/model pricing and extra provider charges may vary: set a separate hard account/project spending cap at the provider. An aborted/timeout call can still be billed.
- **CORS is not authentication.** Non-browser callers can spoof Origin, and all apps on the same GitHub Pages origin share it. An attacker can drain the shared daily allowance, but cannot exceed that allowance through admitted provider calls. Add Cloudflare WAF/Turnstile or real auth if abuse warrants it. No auth secret should be embedded in the frontend.
- Worker logs/observability are disabled in the supplied config. Do not log prompts, keys or raw provider error bodies. External provider privacy/billing terms still apply to the bounded message/context sent after opt-in.

## Configuration and later operator setup (not performed)

`worker/wrangler.toml` includes the entry point, binding and initial SQLite Durable Object migration. Do not replace the singleton name or delete its storage to reset a quota. SQLite storage exposes the transactional KV methods used here.

1. With a Cloudflare account, use Wrangler v4. Start only a **local** disabled Worker from the repository root:
   ```sh
   npx --yes wrangler@4 dev --local --config worker/wrangler.toml --ip 127.0.0.1
   ```
   No provider key is needed for disabled health/CORS checks. Do not bind this to a public interface.
2. Choose an OpenAI-compatible provider/model. Set only nonsecret `AI_BASE_URL` and `AI_MODEL` in TOML. The sample OpenAI URL/model are examples, not evidence of account availability. Keep `AI_ENABLED = "false"` until setup and billing limits are reviewed.
3. When independently authorized to provision Cloudflare secrets, use `npx wrangler@4 secret put AI_API_KEY --config worker/wrangler.toml` and enter the key interactively. For local provider testing only, an untracked `worker/.dev.vars` can hold a private test key; never copy it to `public/` or paste it into documentation.
4. Deployment/enabling requires separate operator authorization. No login, secret creation or deployment was run for this task. After that authorized setup, check disabled and enabled `/health`, a real bounded `/boris` call, CORS rejection, and quota denial. Only then can you say the provider works. The health field intentionally stays `providerVerified:false`.
5. Set `AI_ENABLED = "true"` only on the server after the above preparation, and pass the resulting **public** `/boris` URL to the frontend opt-in caller. Until then leave the frontend local. Disable AI server-side and remove the endpoint to return to fully offline behavior.

Manual local health check (from the allowed origin header):
```sh
curl -i http://127.0.0.1:8787/health -H 'Origin: https://zhorik333.github.io'
```
Expected with the shipped config and no key: `enabled:false`, `configured:false`, `providerVerified:false`. This is an expectation for an operator check, not a fabricated runtime result.

## Reproducible offline verification

From the repository root, each command is bounded:
```sh
timeout 10s node --test tests/boris.test.js
timeout 10s node --test tests/ai-client.test.js
timeout 10s node --test tests/worker.test.js
timeout 30s node --test tests/*.test.js
```
The original hang was an unlimited `response.json()` consuming an endless client response stream; continuously available chunks could starve the timeout. Bounded stream reading fixes the root cause. A separate limiter promise had no deadline and caused pending-test cancellation; it now fails closed within one second. Tests also cover local mood/topic exhaustion and optional honest local fallback. No external network/provider credentials are used by these unit tests.
