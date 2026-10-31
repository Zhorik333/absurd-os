import React, { useEffect, useId, useRef, useState } from 'react';
import { MOODS } from './boris.js';
import { EXPERIMENTS } from './experiments.js';
import './boris.css';

const RISK = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const noop = () => {};
const QUESTION = 'Борис, оцени состояние нашей вселенной и посоветуй безопасный следующий шаг.';

/** Presentational work area. World state, AI, persistence and confirmation belong to the parent. */
export default function BorisLab({ state = {}, onSend = noop, onExperiment = noop, busy = false, mode = 'local', notice = '', effects = true }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const inputId = useId();
  const hintId = useId();
  const logRef = useRef(null);
  const inFlight = useRef(false);
  const boris = state.boris ?? {};
  const mood = MOODS.find(item => item.id === boris.mood) ?? MOODS[3];
  const trust = Math.max(0, Math.min(100, Number(boris.trust) || 0));
  const chat = Array.isArray(boris.chat) ? boris.chat : [];
  const ended = state.chaos >= 100;
  const locked = busy || sending || ended;
  const recommendation = EXPERIMENTS[0];

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat.length, busy]);

  async function send(text, clearDraft = false) {
    const message = text.trim().slice(0, 500);
    if (locked || inFlight.current || !message) return;
    inFlight.current = true;
    setSending(true);
    setSendError('');
    try {
      await onSend(message);
      if (clearDraft) setDraft(current => current === text ? '' : current);
    } catch {
      setSendError('Сообщение не доставлено. Текст сохранён — попробуйте ещё раз.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <section id="boris" className="boris-lab" data-effects={effects ? 'on' : 'off'} aria-labelledby="boris-lab-title">
      <header className="bl-heading">
        <div><p className="bl-kicker">ОТДЕЛ ПРИКЛАДНОЙ НЕВОЗМОЖНОСТИ / 02</p><h1 id="boris-lab-title">Лаборатория Бориса<span aria-hidden="true">_</span></h1><p className="bl-subtitle">Гипотезы сомнительны. Собеседник — ещё больше.</p></div>
        <span className="bl-mode" data-testid="boris-mode"><i aria-hidden="true" />{mode === 'ai' ? 'AI · серверный ответ' : 'Автономный · локальные реплики'}</span>
      </header>

      <div className="bl-workspace">
        <aside className="bl-identity" aria-label="Состояние Бориса">
          <div className="bl-panel-label"><span>СУБЪЕКТ B–01</span><span>НЕ КЛОНИРОВАТЬ</span></div>
          <div className="bl-portrait" data-mood={mood.id} role="img" aria-label={`Борис: ${mood.label}`} style={{ '--mood-color': mood.color }}>
            <span className="bl-reticle bl-reticle-a" aria-hidden="true" /><span className="bl-reticle bl-reticle-b" aria-hidden="true" />
            <div className="bl-avatar" aria-hidden="true"><div className="bl-aerial"><i /></div><div className="bl-head"><div className="bl-brows"><i /><i /></div><div className="bl-eyes"><i /><i /></div><div className="bl-mouth" /><span className="bl-cheek" /></div><div className="bl-neck" /><div className="bl-shoulders"><i /><span>B</span></div></div>
            <span className="bl-scan-label" aria-hidden="true">ЛИЧНОСТЬ ОБНАРУЖЕНА<br />ЗДРАВЫЙ СМЫСЛ: Н/Д</span>
          </div>
          <div className="bl-bio"><p className="bl-kicker">ШТАТНЫЙ НЕШТАТНЫЙ УЧЁНЫЙ</p><h2>БОРИС<span aria-hidden="true">®</span></h2><p className="bl-ai-status">Нестабильный искусственный интеллект</p><p>Он знает, что делает.<br />Но не всегда знает, зачем.</p></div>
          <dl className="bl-vitals"><div><dt>Настроение</dt><dd style={{ color: mood.color }}>{mood.label}</dd></div><div><dt>Доверие к оператору</dt><dd>{trust}<span> / 100</span></dd></div></dl>
          <div className="bl-trust" role="meter" aria-label="Доверие Бориса" aria-valuemin={0} aria-valuemax={100} aria-valuenow={trust}><span style={{ width: `${trust}%` }} /></div>
          <p className="bl-footnote">Доверие накапливается в разговорах.<br />Кофе ускоряет только время.</p>
        </aside>

        <section className="bl-terminal" aria-label="Диалог с Борисом">
          <div className="bl-terminal-head"><h2><span aria-hidden="true">&gt;_</span> Прямая связь</h2><span className="bl-kicker">КАНАЛ B / {busy || sending ? 'ОБРАБОТКА' : 'ОТКРЫТ'}</span></div>
          <div className="bl-messages" ref={logRef} role="log" aria-label="История разговора" aria-live="polite" aria-relevant="additions" aria-busy={busy || sending}>
            {chat.length === 0 ? <div className="bl-empty"><span aria-hidden="true">[ ? ]</span><h3>Контакт ещё не установлен</h3><p>Спросите о гравитации, доверии или последней катастрофе. Борис уже подготовил несколько сомнительных объяснений.</p><small>СООБЩЕНИЯ СОХРАНЯЮТСЯ В ЭТОЙ ВСЕЛЕННОЙ</small></div> : chat.map((message, index) => <article className={`bl-message bl-message-${message.role === 'operator' ? 'operator' : 'boris'}`} data-role={message.role === 'operator' ? 'operator' : 'boris'} key={message.id ?? index}><div className="bl-message-meta"><strong>{message.role === 'operator' ? 'ОПЕРАТОР' : 'БОРИС'}</strong>{message.role !== 'operator' && <span>{message.mode === 'ai' ? 'AI' : 'ЛОКАЛЬНО'}</span>}</div><p>{message.text}</p></article>)}
            {(busy || sending) && <p className="bl-thinking" role="status">Борис сверяет реальность с черновиком<span aria-hidden="true">…</span></p>}
          </div>
          <div className="bl-compose">
            <div className="bl-quick-actions"><button type="button" disabled={locked} onClick={() => send(QUESTION)}>Спросить Бориса <span aria-hidden="true">↗</span></button><button type="button" disabled={locked} onClick={() => onExperiment(recommendation.id)}>Провести эксперимент <span aria-hidden="true">↗</span></button></div>
            <form onSubmit={event => { event.preventDefault(); send(draft, true); }}>
              <label htmlFor={inputId}>Сообщение Борису</label>
              <div className="bl-input-row"><textarea id={inputId} value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} rows={2} disabled={locked} aria-describedby={hintId} placeholder="Борис, у нас всё ещё есть гравитация?" /><button className="bl-send" type="submit" aria-label="Отправить сообщение" disabled={locked || !draft.trim()}><span aria-hidden="true">↗</span></button></div>
              <div id={hintId} className="bl-input-hint"><span>Enter — новая строка · кнопка ↗ — отправить</span><span>{draft.length}/500</span></div>
            </form>
            <div className="bl-notices" role="status">{ended ? 'Реальность завершена. Перезапустите вселенную, чтобы продолжить.' : sendError || (typeof notice === 'string' ? notice : '')}</div>
          </div>
        </section>
      </div>

      <section className="bl-catalogue" aria-labelledby="bl-experiments-title">
        <header className="bl-catalogue-heading"><div><p className="bl-kicker">ПРАКТИЧЕСКИЙ АБСУРД / {EXPERIMENTS.length.toString().padStart(2, '0')} ПРОТОКОЛОВ</p><h2 id="bl-experiments-title">Испытательный стенд</h2></div><p>Сначала — гипотеза. Затем — ваше подтверждение.<br />Никаких запусков без согласия оператора.</p></header>
        <div className="bl-experiment-grid">{EXPERIMENTS.map((experiment, index) => <article className="bl-experiment" key={experiment.id}>
          <div className="bl-experiment-top"><span className="bl-protocol-number">EXP / {(index + 1).toString().padStart(2, '0')}</span><span className={`bl-risk bl-risk-${experiment.risk}`}>Риск: {RISK[experiment.risk]}</span></div>
          <h3><span aria-hidden="true">{experiment.emoji}</span>{experiment.title}</h3><p className="bl-experiment-description">{experiment.description}</p>
          <div className="bl-probability"><span>Вероятность успеха</span><strong>{Math.round(experiment.probability * 100)}%</strong></div><div className="bl-probability-track" aria-hidden="true"><span style={{ width: `${experiment.probability * 100}%` }} /></div>
          <p className="bl-consequences">{experiment.consequences}</p><button type="button" disabled={locked} onClick={() => onExperiment(experiment.id)} aria-label={`Запустить: ${experiment.title}`}>К подтверждению <span aria-hidden="true">↗</span></button>
        </article>)}</div>
        <p className="bl-disclaimer">ПРЕДУПРЕЖДЕНИЕ БЮРО: вероятность — не обещание. Ответственность — не наша.</p>
      </section>
    </section>
  );
}
