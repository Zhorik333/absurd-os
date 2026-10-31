import { localReply } from './boris.js';

// Explicit opt-in; absence/failure never masquerades as a provider response.
export async function replyWithFallback(message, context, { usedLines = [], rng = Math.random, ...options } = {}) {
  if (options.signal?.aborted) throw failure('ABORTED');
  try {
    return await requestBoris(message, context, options);
  } catch (error) {
    if (error.code === 'ABORTED') throw error;
    return { ...localReply(message, context, usedLines, rng), mode: 'local', command: null, fallbackReason: error.code || 'UNAVAILABLE' };
  }
}

// All AI output is inert data: render text via React, never innerHTML.
// Commands are disabled until the application and server agree a fixed allowlist.
const ERRORS = {
  CONFIG: 'AI endpoint is not configured safely.', INPUT: 'Invalid AI request.',
  NETWORK: 'AI service is unavailable.', RATE_LIMIT: 'AI request limit reached.',
  UNAVAILABLE: 'AI service is unavailable.', RESPONSE: 'Invalid AI response.',
  TIMEOUT: 'AI request timed out.', ABORTED: 'AI request cancelled.',
};
function failure(code) { return Object.assign(new Error(ERRORS[code]), { code }); }
import { sanitizeContext as contextForAI } from '../worker/context.js';
export async function requestBoris(message, context, { endpoint, fetchImpl = fetch, timeoutMs = 8000, signal } = {}) {
  let url;
  try { url = new URL(endpoint); } catch { throw failure('CONFIG'); }
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw failure('CONFIG');
  if (typeof message !== 'string' || !message.trim() || message.length > 500 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw failure('INPUT');
  if (signal?.aborted) throw failure('ABORTED');
  const controller = new AbortController();
  let timer, onAbort;
  const interruption = new Promise((_, reject) => {
    onAbort = () => { reject(failure('ABORTED')); controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { reject(failure('TIMEOUT')); controller.abort(); }, timeoutMs);
  });
  const operation = async () => {
    let response;
    try {
      response = await fetchImpl(url.href, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, context: contextForAI(context) }), signal: controller.signal });
    } catch { throw failure('NETWORK'); }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw failure(response.status === 429 ? 'RATE_LIMIT' : 'UNAVAILABLE');
    }
    let data;
    try {
      if (!response.body) throw failure('RESPONSE');
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      if (controller.signal.aborted) cancel();
      try {
        const chunks = [];
        let size = 0;
        const length = response.headers.get('Content-Length');
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192)) { cancel(); throw failure('RESPONSE'); }
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) { cancel(); throw failure('RESPONSE'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        reader.releaseLock();
      }
    } catch { throw failure('RESPONSE'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['text', 'command', 'mode'].includes(key)) || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1800 || data.command !== null || (data.mode !== undefined && data.mode !== 'ai')) throw failure('RESPONSE');
    return { text: data.text, command: null, mode: 'ai' };
  };
  try { return await Promise.race([operation(), interruption]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
