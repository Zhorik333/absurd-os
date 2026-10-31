import React, { useEffect, useId, useRef } from 'react';
import { getStatus } from './engine.js';
import './camera.css';

/** The original containment eye, with progressively unreliable instrumentation. */
export default function Anomaly({ chaos = 0, effects = true }) {
  const value = Number.isFinite(chaos) ? Math.max(0, Math.min(100, chaos)) : 0;
  const stage = value >= 100 ? 5 : value >= 81 ? 4 : value >= 61 ? 3 : value >= 41 ? 2 : value >= 21 ? 1 : 0;
  const status = getStatus(value);
  const camera = useRef(null);
  const id = useId().replaceAll(':', '');
  const glow = `camera-glow-${id}`;
  const eye = `camera-eye-${id}`;
  const resetTracking = () => {
    camera.current?.style.removeProperty('--camera-x');
    camera.current?.style.removeProperty('--camera-y');
  };
  useEffect(() => {
    resetTracking();
    const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reset = () => resetTracking();
    media?.addEventListener?.('change', reset);
    return () => media?.removeEventListener?.('change', reset);
  }, [effects, stage]);
  const track = (event) => {
    if (!effects || stage === 0 || stage === 5 || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      resetTracking();
      return;
    }
    const node = camera.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    node.style.setProperty('--camera-x', `${x * 12}px`);
    node.style.setProperty('--camera-y', `${y * 8}px`);
  };
  return (
    <div ref={camera} className={`anomaly anomaly-camera ${effects ? 'active' : 'camera-still'}`}
      data-testid="anomaly-camera" data-stage={stage} data-effects={Boolean(effects)}
      role="group" aria-label={`Камера сдерживания: ${status}`}
      onPointerMove={track} onPointerLeave={resetTracking} onPointerCancel={resetTracking}>
      <div className="orbit-label l1">ОБЪЕКТ № 0{Math.floor(value / 10) + 1}</div>
      <div className="orbit-label l2">{stage >= 3 ? 'ТЕЛЕМЕТРИЯ: ДОВЕРИЕ УТРАЧЕНО' : 'НЕ КОРМИТЬ ПОСЛЕ ВЕЧНОСТИ'}</div>
      <svg viewBox="0 0 500 360" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={glow}>
            <stop stopColor="#aaff72" stopOpacity=".19" />
            <stop offset="1" stopColor="#aaff72" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={eye}>
            <stop stopColor="#d1ff99" />
            <stop offset="1" stopColor="#8cef45" />
          </linearGradient>
        </defs>
        <circle cx="250" cy="180" r="170" fill={`url(#${glow})`} />
        <g className="camera-collapse">
          <g className="outer-ring" fill="none" stroke="#344535">
            <circle cx="250" cy="180" r="139" strokeDasharray="1 10" strokeWidth="5" />
            <ellipse cx="250" cy="180" rx="193" ry="65" transform="rotate(-27 250 180)" />
            <ellipse cx="250" cy="180" rx="185" ry="74" transform="rotate(31 250 180)" />
          </g>
          <g className="inner-ring" fill="none" stroke="#82bc56">
            <circle cx="250" cy="180" r="111" strokeDasharray="72 12 4 12" />
            <path d="M78 180h38m268 0h38M250 23v30m0 254v30" />
            <circle cx="94" cy="180" r="4" fill="#b6fa77" />
            <circle cx="406" cy="180" r="4" fill="#b6fa77" />
          </g>
          <g className="camera-twitch">
            <g className="eye">
              <path d="M157 180 Q250 75 343 180 Q250 285 157 180Z" fill={`url(#${eye})`} />
              <g className="camera-iris">
                <circle cx="250" cy="180" r="43" fill="#11180d" />
                <circle cx="250" cy="180" r="26" fill="#aafa70" />
                <ellipse className="camera-pupil" cx="250" cy="180" rx={stage >= 2 ? 17 : 9} ry={stage >= 2 ? 17 : 24} fill="#11180d" />
                <circle cx="261" cy="168" r="6" fill="#f7ffe9" />
              </g>
              <path d="M206 111l-9-19m53 6V77m43 34l9-19" stroke="#b6fa77" strokeWidth="4" />
            </g>
          </g>
        </g>
        <g className="camera-telemetry" fill="#aad786" fontSize="9" fontFamily="monospace">
          <text x="26" y="80">{stage >= 3 ? 'X: NaN.404' : 'X: ∞.004'}</text>
          <text x="380" y="290">{stage >= 3 ? 'Y: ОШИБКА' : 'Y: НЕ ВАЖНО'}</text>
          <text x="24" y="300">{stage === 5 ? '[ СВЯЗЬ ПОТЕРЯНА ]' : '[ ЖИВОЕ? ]'}</text>
          <text x="387" y="60">REC ●</text>
        </g>
        {stage >= 4 && <g className="camera-warning" fill="none" stroke="#f29a94" strokeWidth="2">
          <path d="M40 110V40h70m280 0h70v70M40 250v70h70m280 0h70v-70" />
          <text x="250" y="30" textAnchor="middle" fill="#f29a94" stroke="none" fontSize="9" fontFamily="monospace">
            {stage === 5 ? '410: РЕАЛЬНОСТЬ ОТСУТСТВУЕТ' : 'ВНИМАНИЕ: НАРУШЕНИЕ СДЕРЖИВАНИЯ'}
          </text>
        </g>}
      </svg>
      <div className="anomaly-caption" role="status" aria-live="polite" aria-atomic="true">
        <span className="live-dot" aria-hidden="true" /> {status}
      </div>
    </div>
  );
}
