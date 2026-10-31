import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Coffee,
  Download,
  FileText,
  FlaskConical,
  Globe2,
  Infinity as InfinityIcon,
  Orbit,
  Power,
  Radio,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Trophy,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { events } from "./content.js";
import {
  createInitialState,
  loadState,
  saveState,
  applyEvent,
  restartUniverse,
  getStatus,
  makeReport,
  discoverSecret,
  addConversation, runExperiment, systemPulse, V2_ACHIEVEMENTS,
} from "./world.js";
import Anomaly from './Anomaly.jsx';
import BorisLab from './BorisLab.jsx';
import {localReply, buildContext, MOODS} from './boris.js';
import {EXPERIMENTS} from './experiments.js';
import {requestBoris} from './ai-client.js';
import {playSound, SOUND_CHANNELS, SOUND_LABELS} from './audio.js';
import './v2.css';
import { usePwa } from "./pwa.js";
import "./style.css";
import "./event-effects.css";

const TYPES = {
  chaos: "КАТАСТРОФА",
  oracle: "ПРЕДСКАЗАНИЕ",
  alien: "КОНТАКТ",
  money: "ЭКОНОМИКА",
  gravity: "ГРАВИТАЦИЯ",
  coffee: "КОФЕЙНЫЙ КУЛЬТ",
};
const controls = [
  ["chaos", "Запустить хаос", "Не нажимать. Особенно дважды.", Zap, "01"],
  ["oracle", "Оракул", "Знает всё. Но это неточно.", Sparkles, "02"],
  ["alien", "Вызвать инопланетян", "Они уже ищут парковку.", Orbit, "03"],
  ["money", "Напечатать деньги", "Инфляция — это просто число.", Wallet, "04"],
  ["gravity", "Отключить гравитацию", "Пол переоценён.", Globe2, "05"],
  [
    "coffee",
    "Вызвать кофейного бога",
    "Во имя арабики и робусты.",
    Coffee,
    "06",
  ],
];
const achievementLabels = [
  "Первое столкновение с абсурдом",
  "10 катастроф",
  "25 катастроф",
  "50 катастроф",
  "Первый контакт с инопланетянами",
  "Критический уровень хаоса",
  "Полное уничтожение реальности",
  "Обнаружение всех секретов",
];
function Modal({ title, children, onClose, dismissible = true }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { if (dismissible) onClose(); else e.preventDefault(); }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <div>
          <small>ДОКУМЕНТ ОСОБОЙ НЕНУЖНОСТИ</small>
          <h2>{title}</h2>
        </div>
        {dismissible && <button
          className="icon-button"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          <X />
        </button>}
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [state, setState] = useState(() => {
    try {
      return loadState(window.localStorage);
    } catch {
      return createInitialState();
    }
  });
  const [now, setNow] = useState(new Date());
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [storageFailed, setStorageFailed] = useState(false);
  const [floating, setFloating] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [report, setReport] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [route, setRoute] = useState(window.location.hash);
  const [busy, setBusy] = useState(false);
  const [borisMode, setBorisMode] = useState('local');
  const [borisNotice, setBorisNotice] = useState('');
  const [experiment, setExperiment] = useState(null);
  const [experimentResult, setExperimentResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const pendingAI = useRef(null);
  const sending = useRef(false);
  const pwa = usePwa();
  const logoClicks = useRef(0);
  const timers = useRef([]);
  const known = useRef({
    a: state.achievements.length,
    s: state.secrets.length,
    v: state.v2Achievements.length,
  });
  const effects = state.settings.effects;
  const laboratory = route === '#boris';
  useEffect(() => {
    const navigate = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', navigate);
    return () => { window.removeEventListener('hashchange', navigate); pendingAI.current?.abort(); };
  }, []);
  useEffect(() => {
    pendingAI.current?.abort();
    setBorisMode('local');
  }, [state.settings.ai, state.settings.endpoint]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || sending.current) return;
      setState(s => systemPulse(s, Date.now()));
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  const reduced = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const complete = state.chaos === 100;
  const toast = (text) =>
    setToasts((t) => [...t.slice(-3), { id: crypto.randomUUID(), text }]);
  useEffect(() => {
    try {
      setStorageFailed(!saveState(window.localStorage, state));
    } catch {
      setStorageFailed(true);
    }
  }, [state]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(t);
      timers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((x) => x.slice(1)), 5500);
    return () => clearTimeout(t);
  }, [toasts]);
  useEffect(() => {
    state.achievements.slice(known.current.a).forEach(name => toast("Достижение: " + name));
    if (state.secrets.length > known.current.s)
      toast("Секрет раскрыт. Уровень допуска повышен.");
    state.v2Achievements.slice(known.current.v).forEach(id => toast('Достижение V2: ' + V2_ACHIEVEMENTS.find(a => a.id === id)?.name));
    known.current = { a: state.achievements.length, s: state.secrets.length, v: state.v2Achievements.length };
  }, [state.achievements, state.secrets, state.v2Achievements]);
  const trigger = (type) => {
    if (complete) return;
    const pool = events[type];
    const options = pool.filter((e) => e.id !== lastEvent?.sourceId);
    const event =
      options[Math.floor(Math.random() * options.length)] || pool[0];
    setState((s) => applyEvent(s, event));
    setLastEvent({ ...event, sourceId: event.id, key: crypto.randomUUID() });
    playSound(
      state.chaos + event.delta >= 100
        ? "end"
        : state.chaos <= 60 && state.chaos + event.delta >= 61
          ? "alarm"
          : "event",
      state.settings,
    );
    if (type === "gravity") {
      setFloating(true);
      timers.current.push(setTimeout(() => setFloating(false), 5500));
    }
  };
  const sendBoris = async (raw) => {
    const message = typeof raw === 'string' ? raw.trim().slice(0,500) : '';
    if (!message || sending.current || stateRef.current.chaos === 100) return;
    sending.current = true; setBusy(true); setBorisNotice('');
    const controller = new AbortController(); pendingAI.current = controller;
    const snapshot = stateRef.current;
    let response, mode = 'local';
    try {
      if (snapshot.settings.ai && navigator.onLine) {
        try {
          response = await requestBoris(message, buildContext(snapshot), {endpoint:snapshot.settings.endpoint, signal:controller.signal});
          mode = 'ai';
        } catch (error) {
          if (controller.signal.aborted) return;
          setBorisNotice(error.code === 'RATE_LIMIT' ? 'Лимит AI исчерпан. Отвечает автономный Борис.' : 'AI недоступен или не настроен. Отвечает автономный Борис.');
        }
      } else if (snapshot.settings.ai) setBorisNotice('Нет сети. Отвечает автономный Борис.');
      if (controller.signal.aborted) return;
      setState(current => {
        if (current.chaos === 100) return current;
        const answer = response || localReply(message, buildContext(current), current.boris.usedLines);
        return addConversation(current, message, {...answer,mood:current.chaos >= 81 ? 'panic' : answer.mood ?? current.boris.mood}, Date.now(), mode);
      });
      setBorisMode(mode);
      playSound('boris', stateRef.current.settings);
    } finally {
      if (pendingAI.current === controller) pendingAI.current = null;
      sending.current = false; setBusy(false);
    }
  };
  const proposeExperiment = (id) => {
    if (complete || busy) return;
    const selected = EXPERIMENTS.find(e => e.id === id) || EXPERIMENTS[0];
    setExperiment(selected); setModal('experiment');
  };
  const confirmExperiment = () => {
    if (!experiment || complete) return;
    const previousIds = new Set(stateRef.current.history.map(event => event.id));
    const next = runExperiment(stateRef.current, {kind:'experiment',id:experiment.id}, true);
    const result = next.history.find(event => !previousIds.has(event.id) && event.origin === 'experiment');
    stateRef.current = next; setState(next); setModal(null);
    setExperimentResult(result ?? null);
    if (!result) return;
    setLastEvent({...result,key:crypto.randomUUID()});
    playSound('experiment',next.settings);
    playSound(next.chaos === 100 ? 'end' : result.outcome === 'success' ? 'success' : 'error',next.settings);
  };
  const reboot = () => {
    pendingAI.current?.abort();
    setModal(null); setExperimentResult(null);
    setState((s) => restartUniverse(s));
    setLastEvent(null);
    setFloating(false);
    toast("Вселенная перезапущена. Гарантия по-прежнему отсутствует.");
  };
  const showReport = () => {
    setReport(makeReport(state));
    setModal("report");
  };
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast("Отчёт скопирован");
    } catch {
      const el = document.getElementById("report-text");
      el.focus();
      el.select();
      toast("Буфер недоступен. Текст выделен — скопируйте вручную.");
    }
  };
  const filtered = state.history.filter(
    (e) => filter === "all" || e.type === filter || e.origin === filter || (filter === "rare" && e.outcome === "rare"),
  );
  const sanity = Math.min(
    100,
    Math.round(state.chaos * 0.91 + Math.min(9, state.catastrophes * 0.3)),
  );
  return (
    <div
      className={`app stage-${Math.min(5, Math.ceil(Math.max(0, state.chaos - 20) / 20))} ${effects ? "effects" : "quiet"} ${floating && effects ? "zero-g" : ""}`}
    >
      <a href="#controls" className="skip-link">
        К пульту управления
      </a>
      <header className="header">
        <button
          className="brand"
          aria-label="АБСУРД OS — логотип"
          onClick={() => {
            logoClicks.current++;
            if (logoClicks.current === 7) {
              setState((s) => discoverSecret(s, "logo"));
              toast(
                "РЕЖИМ РАЗРАБОТЧИКА: ошибки теперь официально являются функциями.",
              );
            }
          }}
        >
          <span className="brand-mark">
            <Activity size={24} />
          </span>
          <span>
            АБСУРД<span className="brand-os">OS</span>
            <sup>™</sup>
            <small>БЮРО АБСУРДНЫХ СИТУАЦИЙ</small>
          </span>
        </button>
        <nav aria-label="Разделы">
          <a href="#controls" className={!laboratory ? "nav-active" : ""}>
            Пульт
          </a>
          <a href="#archive">
            Архив{" "}
            <span>{state.history.length.toString().padStart(2, "0")}</span>
          </a>
          <button onClick={() => setModal("achievements")}>Достижения</button>
          <a href="#boris" className={laboratory ? 'nav-active' : ''}>Борис</a>
        </nav>
        <div className="header-tools">
          <span className="connection">
            <i className="live-dot" />
            {pwa.offline ? "ЛОКАЛЬНЫЙ КОНТУР" : "СИСТЕМА В СЕТИ"}
          </span>
          <button
            className="icon-button"
            aria-label="Настройки"
            onClick={() => setModal("settings")}
          >
            <Settings size={19} />
          </button>
        </div>
      </header>
      <main>
        <div className="topline">
          <span>
            <span className="live-dot" /> СЕКРЕТНО // ДОПУСК: СЛУЧАЙНЫЙ
          </span>
          <time dateTime={now.toISOString()}>
            {now.toLocaleDateString("ru-RU")}{" "}
            <b>{now.toLocaleTimeString("ru-RU")}</b>
          </time>
        </div>
        {storageFailed && (
          <div className="notice warning" role="alert">
            Хранилище недоступно. Эта вселенная сохранится только до закрытия
            страницы. Освободите место или разрешите LocalStorage.
          </div>
        )}
        {pwa.offline && (
          <div className="notice">
            Автономный режим. Интернет исчез, абсурд остался. Все механики
            доступны.
          </div>
        )}
        {pwa.updateAvailable && (
          <div className="notice">
            Новая версия реальности готова. Прогресс сохранён.
            <button onClick={pwa.updateApp}>
              Обновить систему <RotateCcw size={14} />
            </button>
          </div>
        )}
        {laboratory && <>
          <BorisLab state={state} onSend={sendBoris} onExperiment={proposeExperiment} busy={busy} mode={borisMode} notice={borisNotice} effects={effects} />
          {experimentResult && <div data-testid="experiment-result" className={`experiment-outcome event-result anim-${experimentResult.animation}`}>
            <span className="event-emoji">{experimentResult.emoji}</span><div><small>РЕЗУЛЬТАТ ЭКСПЕРИМЕНТА</small><h3>{experimentResult.title}</h3><p>{experimentResult.description}</p></div><strong>{experimentResult.delta > 0 ? '+' : ''}{experimentResult.delta}%</strong>
          </div>}
        </>}
        <div hidden={laboratory}>
        <section className="intro">
          <div>
            <div className="eyebrow">DEPARTMENT OF UNNECESSARY EMERGENCIES</div>
            <h1>
              Реальность
              <br />
              <span>под контролем.</span>
              <span className="asterisk">*</span>
            </h1>
            <p>* Контроль носит исключительно декоративный характер.</p>
          </div>
          <div className="operator">
            <div className="operator-icon">
              <FlaskConical />
            </div>
            <div>
              <small>ДОБРО ПОЖАЛОВАТЬ, ОПЕРАТОР</small>
              <strong>Хороший день, чтобы всё испортить.</strong>
              <span>
                Вселенная № {String(state.universes + 1).padStart(3, "0")}{" "}
                <i>•</i> Ответственных нет
              </span>
            </div>
          </div>
        </section>
        <a href="#boris" className="boris-status-strip"><span className="live-dot" /> БОРИС / {MOODS.find(m=>m.id===state.boris.mood)?.label} <span>{state.boris.chat.filter(m=>m.role==='boris').at(-1)?.text || 'Лаборатория открыта. Ответственность — нет.'}</span><ArrowUpRight size={16}/></a>
        <section className="dashboard" aria-label="Состояние вселенной">
          <div className="telemetry panel">
            <div className="panel-head">
              <span>
                <Activity size={15} /> МОНИТОР РЕАЛЬНОСТИ
              </span>
              <span className="micro">
                LIVE <i className="live-dot" />
              </span>
            </div>
            <div className="chaos-heading">
              <span>УРОВЕНЬ ХАОСА</span>
              <span className="status-tag">
                {complete ? "НЕ ОБНАРУЖЕНА" : getStatus(state.chaos)}
              </span>
            </div>
            <div className="chaos-number">
              <strong data-testid="chaos-value">{state.chaos}</strong>
              <span>%</span>
              <div className="chaos-trend">
                <ArrowUpRight size={16} />{" "}
                {state.chaos === 0 ? "ПОКА ТИХО" : "ЭТО НЕ УЧЕНИЯ"}
              </div>
            </div>
            <div
              className="meter"
              role="progressbar"
              aria-label="Уровень хаоса"
              aria-valuenow={state.chaos}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div style={{ width: state.chaos + "%" }} />
            </div>
            <div className="meter-labels">
              <span>ПОРЯДОК</span>
              <span>ТОЧКА НЕВОЗВРАТА</span>
            </div>
            <div className="stats">
              <div>
                <ShieldAlert size={18} />
                <span>
                  Угроза реальности<strong>{getStatus(state.chaos)}</strong>
                </span>
              </div>
              <div>
                <Zap size={18} />
                <span>
                  Катастроф за всё время
                  <strong>{String(state.catastrophes).padStart(3, "0")}</strong>
                </span>
              </div>
              <div>
                <Activity size={18} />
                <span>
                  Потеря здравого смысла
                  <strong>
                    {sanity}% <span className="tiny-bars">▂▃▅▇</span>
                  </strong>
                </span>
              </div>
            </div>
            <div className="telemetry-footer">
              <span className="live-dot" /> ПРОТОКОЛ «АВОСЬ» АКТИВИРОВАН
            </div>
          </div>
          <div className="specimen panel">
            <div className="panel-head">
              <span>
                <Orbit size={15} /> КАМЕРА СДЕРЖИВАНИЯ
              </span>
              <span className="micro">CAM_06 / ∞ FPS</span>
            </div>
            <Anomaly chaos={state.chaos} effects={effects} />
            <div className="specimen-bottom">
              <span>НЕИЗВЕСТНАЯ ФОРМА ЗДРАВОГО СМЫСЛА</span>
              <span className="outline-tag">КЛАСС: НУ ТАКОЕ</span>
            </div>
          </div>
        </section>
        <div className="ticker">
          <TriangleAlert size={14} />
          <span>СЛУЖЕБНОЕ ОБЪЯВЛЕНИЕ</span>
          <p>
            {complete
              ? "РЕАЛЬНОСТЬ ОТСУТСТВУЕТ. ПОПРОБУЙТЕ ВКЛЮЧИТЬ И ВЫКЛЮЧИТЬ ВСЕЛЕННУЮ."
              : state.chaos > 60
                ? "При пожаре сохраняйте панику. Лифтом пользуется экзистенциальный ужас."
                : "Сотрудникам запрещено смотреть в бездну. Бездна жалуется в отдел кадров."}
          </p>
          <span className="ticker-end">НЕ ИГНОРИРОВАТЬ →</span>
        </div>
        <section id="controls" className="control-section">
          <div className="section-title">
            <div>
              <span className="section-no">01 /</span>
              <h2>Пульт необратимых решений</h2>
            </div>
            <span className="section-aside">
              ШЕСТЬ СПОСОБОВ СДЕЛАТЬ ХУЖЕ <ArrowDown size={13} />
            </span>
          </div>
          <div className="controls">
            {controls.map(([type, title, subtitle, Icon, n]) => (
              <button
                key={type}
                className={`control ${type}`}
                aria-label={title}
                disabled={complete}
                onClick={() => trigger(type)}
              >
                <div className="control-top">
                  <span className="control-icon">
                    <Icon size={24} />
                  </span>
                  <span className="control-no">
                    {n} <ArrowUpRight size={17} />
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{subtitle}</p>
                <div className="control-bottom">
                  <span>
                    {type === "chaos"
                      ? "ОПАСНО, НО ИНТЕРЕСНО"
                      : type === "oracle"
                        ? "СВЯЗЬ С ПОТУСТОРОННИМ"
                        : "ПРОТОКОЛ ГОТОВ К ЗАПУСКУ"}
                  </span>
                  <span className="live-dot" />
                </div>
              </button>
            ))}
          </div>
        </section>
        <section
          className="event-channel"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="event-label">
            <Radio size={16} /> ПРЯМОЙ ЭФИР<span>ПОСЛЕДНЯЯ АНОМАЛИЯ</span>
          </div>
          {lastEvent ? (
            <div
              key={lastEvent.key}
              className={`event-result anim-${lastEvent.animation || "pop"} type-${lastEvent.type}`}
            >
              <div className="event-emoji">{lastEvent.emoji}</div>
              <div>
                <small>{TYPES[lastEvent.type]}</small>
                <h3>{lastEvent.title}</h3>
                <p>{lastEvent.description}</p>
              </div>
              <span className="event-delta">
                {lastEvent.delta > 0 ? "+" : ""}
                {lastEvent.delta}%<small>ХАОСА</small>
              </span>
            </div>
          ) : (
            <div className="event-empty">
              <span>⌁</span>
              <p>
                Подозрительно спокойно.
                <small>
                  Нажмите что-нибудь. Вселенная сама себя не испортит.
                </small>
              </p>
              <span className="signal">▂ ▃ ▅ ▃ ▂</span>
            </div>
          )}
        </section>
        {state.secrets.includes("logo") && (
          <div className="secret-panel">
            <Code2 size={18} />
            <span>
              РЕЖИМ РАЗРАБОТЧИКА: {state.secrets.length}/3 аномальных допуска.
              Смысл жизни: undefined.
            </span>
            <button
              onClick={() => {
                toast("Консоль утверждает: это не баг. Это философия.");
                playSound("event", state.settings);
              }}
            >
              Проверить смысл
            </button>
          </div>
        )}
        <section id="archive" className="archive-section">
          <div className="section-title">
            <div>
              <span className="section-no">02 /</span>
              <h2>Секретный архив</h2>
              <span className="count-badge">{state.history.length}</span>
            </div>
            <button
              className="text-button"
              onClick={() => setModal("clear")}
              disabled={!state.history.length}
            >
              Очистить архив <X size={14} />
            </button>
          </div>
          <div className="archive-toolbar">
            <div className="archive-filters">
              {[
                ["all", "Все записи"],
                ["chaos", "Катастрофы"],
                ["oracle", "Оракул"],
                ["alien", "Контакты"],
                ["experiment", "Эксперименты"],
                ["system", "Системные"],
                ["rare", "Редкие"],
              ].map(([key, text]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => {
                    setFilter(key);
                    setVisibleCount(12);
                  }}
                >
                  {text}
                </button>
              ))}
              <label className="sr-only" htmlFor="archive-type">
                Все типы событий
              </label>
              <select
                id="archive-type"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setVisibleCount(12);
                }}
              >
                <option value="all">Все типы</option>
                <option value="experiment">Эксперименты</option><option value="system">Системные</option><option value="rare">Редкие события</option>
                {Object.entries(TYPES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <span className="micro">
              ХРАНИТЬ ВЕЧНО. ИЛИ ПОСЛЕДНИЕ 150 ЗАПИСЕЙ.
            </span>
          </div>
          <div className="archive-list">
            {!filtered.length ? (
              <div className="empty-archive">
                <BookOpen />
                <h3>Улик пока нет.</h3>
                <p>Идеальное время, чтобы их создать.</p>
              </div>
            ) : (
              filtered.slice(0, visibleCount).map((e) => (
                <article
                  key={e.id}
                  data-testid="archive-entry"
                  className="archive-entry"
                >
                  <time dateTime={new Date(e.time).toISOString()}>
                    {new Date(e.time).toLocaleTimeString("ru-RU")}
                    <small>
                      {new Date(e.time).toLocaleDateString("ru-RU")}
                    </small>
                  </time>
                  <span className="archive-emoji">{e.emoji}</span>
                  <div className="archive-body">
                    <span className={"type-tag " + e.type}>
                      {e.origin === 'experiment' ? 'ЭКСПЕРИМЕНТ' : e.origin === 'system' ? 'СИСТЕМНЫЙ СБОЙ' : TYPES[e.type] || "АНОМАЛИЯ"}
                    </span>
                    <h3>{e.title}</h3>
                    <p>{e.description}</p>
                    {e.origin && <small className={`risk-label risk-${e.risk}`}>РИСК: {e.risk === 'high' ? 'ВЫСОКИЙ' : e.risk === 'medium' ? 'СРЕДНИЙ' : 'НИЗКИЙ'}{e.outcome === 'rare' ? ' / РЕДКОЕ СОБЫТИЕ' : ''}</small>}
                    <button className="text-button event-detail" aria-label="Полное описание события" onClick={() => {setDetail(e);setModal('detail');}}>Открыть дело ↗</button>
                  </div>
                  <span className="archive-delta">
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}%
                  </span>
                </article>
              ))
            )}
          </div>
          {filtered.length > visibleCount && (
            <button
              className="load-more"
              onClick={() => setVisibleCount((n) => n + 20)}
            >
              Рассекретить ещё {Math.min(20, filtered.length - visibleCount)}{" "}
              записей <ArrowDown size={16} />
            </button>
          )}
        </section>
        <section className="report-card">
          <div className="report-symbol">
            <FileText size={30} />
          </div>
          <div>
            <small>БУМАЖНАЯ РАБОТА САМА СЕБЯ НЕ СДЕЛАЕТ</small>
            <h2>Директору нужно что-то доложить.</h2>
            <p>Желательно до того, как он перестанет существовать.</p>
          </div>
          <button className="primary-button" onClick={showReport}>
            Отчёт директору <ArrowUpRight size={18} />
          </button>
        </section>
        </div>
      </main>
      <footer>
        <span>
          <Activity size={14} /> АБСУРД OS™ <b>v2.0.0 / БОРИС ПРОБУДИЛСЯ</b>
        </span>
        <p>СОЗДАНО ПО ОШИБКЕ. РАБОТАЕТ ПО НЕДОРАЗУМЕНИЮ.</p>
        <button onClick={() => setModal("about")}>
          ПОЛЬЗОВАТЕЛЬСКОЕ НЕСОГЛАШЕНИЕ <ArrowUpRight size={12} />
        </button>
      </footer>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div role="status" key={t.id}>
            <BadgeCheck size={21} />
            <span>{t.text}</span>
            <button
              aria-label="Скрыть уведомление"
              onClick={() => setToasts((x) => x.filter((v) => v.id !== t.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {complete && (
        <Modal title="Реальность закончилась." dismissible={false} onClose={() => {}}>
          <div className="apocalypse">
            <div className="end-symbol">∞</div>
            <span className="eyebrow">ОШИБКА 410: ВСЕЛЕННАЯ УДАЛЕНА</span>
            <h3>
              Вы нажимали.
              <br />
              Мы предупреждали.
            </h3>
            <p>
              Последний атом подал заявление по собственному желанию. Директор
              просит зайти. Директора больше нет.
            </p>
            <p className="boris-intervention">БОРИС: Я сохранил ваши воспоминания. Саму реальность — не успел. Давайте начнём с пространства, а время догоним.</p>
            <p className="muted">
              Архив, достижения и секретные допуски переживут Большой
              перезапуск.
            </p>
            <button className="primary-button" onClick={reboot}>
              Перезапустить вселенную <RotateCcw size={18} />
            </button>
          </div>
        </Modal>
      )}
      {!complete && modal === "settings" && (
        <Modal title="Настройки реальности" onClose={() => setModal(null)}>
          <div className="setting-row">
            <div>
              <h3>Звуковые эффекты</h3>
              <p>Синтезатор тревожных решений. По умолчанию выключен.</p>
            </div>
            <input
              type="checkbox"
              aria-label="Звуковые эффекты"
              checked={state.settings.sound}
              onChange={(e) => {
                const sound = e.target.checked;
                setState((s) => ({ ...s, settings: { ...s.settings, sound } }));
                playSound("event", {...state.settings, sound});
              }}
            />
          </div>
          <div className="setting-row">
            <div>
              <h3>Интенсивные эффекты</h3>
              <p>
                Орбиты, глитчи и временная невесомость. Настройка уменьшения
                движения системы имеет приоритет.
              </p>
            </div>
            <input
              type="checkbox"
              aria-label="Интенсивные эффекты"
              checked={effects}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  settings: { ...s.settings, effects: e.target.checked },
                }))
              }
            />
          </div>
          <div className="setting-row"><label htmlFor="sound-volume">Громкость</label><input id="sound-volume" aria-label="Громкость" type="range" min="0" max="1" step="0.05" value={state.settings.volume} onChange={e=>setState(s=>({...s,settings:{...s.settings,volume:Number(e.target.value)}}))}/></div>
          <fieldset className="channel-settings"><legend>Звуковые каналы</legend>{SOUND_CHANNELS.map(channel=><label key={channel}><span>{SOUND_LABELS[channel]}</span><input type="checkbox" aria-label={'Звуковой канал: '+SOUND_LABELS[channel]} checked={state.settings.channels[channel]} onChange={e=>{const checked=e.target.checked;setState(s=>({...s,settings:{...s.settings,channels:{...s.settings.channels,[channel]:checked}}}));}}/></label>)}</fieldset>
          <div className="ai-settings"><h3>Борис / необязательный AI-сервер</h3><p>По умолчанию Борис работает локально. При включении AI ваше сообщение и краткий контекст вселенной передаются указанному серверу и его AI-провайдеру. Не отправляйте личные данные. API-ключ здесь не нужен.</p>
            <label className="setting-row">Использовать AI-сервер<input type="checkbox" checked={state.settings.ai} onChange={e=>{const ai=e.target.checked;setState(s=>({...s,settings:{...s.settings,ai}}));}}/></label>
            <label className="endpoint-label">Адрес AI-сервера<input type="url" maxLength={240} placeholder="https://your-worker.workers.dev/" value={state.settings.endpoint} onChange={e=>{const endpoint=e.target.value;setState(s=>({...s,settings:{...s.settings,endpoint}}));}}/></label>
            <small>Нет сервера или сети? Автономный Борис продолжит работу. Настройка сама по себе не означает подключения AI.</small>
          </div>
          <div className="install-card">
            <Download />
            <h3>Вселенная в вашем кармане</h3>
            <p>
              Установите приложение. После первого успешного кэширования оно
              работает без интернета.
            </p>
            {pwa.installed ? (
              <span className="installed">
                <Check size={16} /> ПРИЛОЖЕНИЕ УСТАНОВЛЕНО
              </span>
            ) : (
              <button className="primary-button" onClick={pwa.install}>
                📲 УСТАНОВИТЬ АБСУРД OS™
              </button>
            )}
          </div>
          <button
            className="text-button"
            onClick={() => {
              setModal("restart");
            }}
          >
            Перезапустить вселенную вручную <RotateCcw size={14} />
          </button>
        </Modal>
      )}
      {!complete && modal === "achievements" && (
        <Modal title="Личные дела оператора" onClose={() => setModal(null)}>
          <p className="muted">
            Получено {state.achievements.length} из 8. Секретные допуски:{" "}
            {state.secrets.length}/3.
          </p>
          <div className="achievement-grid">
            {achievementLabels.map((name, i) => {
              const earned = state.achievements.includes(name);
              return (
                <div className={earned ? "earned" : ""} key={name}>
                  <Trophy />
                  <div>
                    <small>
                      {earned ? "ПОЛУЧЕНО" : "ЗАСЕКРЕЧЕНО"} /{" "}
                      {String(i + 1).padStart(2, "0")}
                    </small>
                    <h3>{name}</h3>
                  </div>
                  {earned && <Check size={16} />}
                </div>
              );
            })}
          </div>
          <h3 className="v2-achievement-title">Дела лаборатории / V2</h3>
          <p className="muted">Открыто {state.v2Achievements.length} из {V2_ACHIEVEMENTS.length}.</p>
          <div className="achievement-grid">{V2_ACHIEVEMENTS.map(a=>{const earned=state.v2Achievements.includes(a.id);return <div key={a.id} className={earned?'earned':''}><Trophy/><div><small>{earned?'ПОЛУЧЕНО':a.hidden?'СЕКРЕТНО':'НЕ ОТКРЫТО'}</small><h3>{a.hidden&&!earned?'Неизвестное достижение':a.name}</h3><p>{a.hidden&&!earned?'Условия засекречены.':a.description}</p></div>{earned&&<Check size={16}/>}</div>})}</div>
        </Modal>
      )}
      {!complete && modal === 'experiment' && experiment && <Modal title="Подтвердить эксперимент" onClose={()=>setModal(null)}><div className="experiment-confirm"><h3>{experiment.emoji} {experiment.title}</h3><p>{experiment.description}</p><p>Успех: {Math.round(experiment.probability*100)}%. Риск: {experiment.risk === 'high' ? 'высокий' : experiment.risk === 'medium' ? 'средний' : 'низкий'}.</p><p>{experiment.consequences}</p><p className="muted">Редкий побочный эффект: альтернативный Борис (3,5%). Последствия сохранятся в архиве.</p><div className="modal-actions"><button className="primary-button" onClick={confirmExperiment}>Да, запускаем</button><button onClick={()=>setModal(null)}>Отменить</button></div></div></Modal>}
      {!complete && modal === 'detail' && detail && <Modal title="Полное дело события" onClose={()=>setModal(null)}><small>{detail.origin === 'experiment' ? 'ЭКСПЕРИМЕНТ' : detail.origin === 'system' ? 'СИСТЕМНЫЙ СБОЙ' : TYPES[detail.type]}</small><h3>{detail.emoji} {detail.title}</h3><p>{detail.description}</p><p>Изменение хаоса: {detail.delta > 0 ? '+' : ''}{detail.delta}%. {detail.outcome === 'rare' ? 'РЕДКОЕ СОБЫТИЕ.' : ''}</p><time>{new Date(detail.time).toLocaleString('ru-RU')}</time></Modal>}
      {!complete && modal === "report" && (
        <Modal title="Отчёт директору" onClose={() => setModal(null)}>
          <textarea
            id="report-text"
            className="report-text"
            readOnly
            value={report}
            aria-label="Текст отчёта"
          />
          <button className="primary-button" onClick={copyReport}>
            <Clipboard size={17} /> Скопировать отчёт
          </button>
        </Modal>
      )}
      {!complete && modal === "clear" && (
        <Modal title="Уничтожить улики?" onClose={() => setModal(null)}>
          <p>
            Последние записи исчезнут навсегда. Уровень хаоса, достижения и
            счётчик катастроф останутся.
          </p>
          <div className="modal-actions">
            <button
              className="danger-button"
              onClick={() => {
                setState((s) => ({ ...s, history: [] }));
                setModal(null);
                toast("Архив очищен. Ничего не было.");
              }}
            >
              Да, уничтожить записи
            </button>
            <button onClick={() => setModal(null)}>Оставить улики</button>
          </div>
        </Modal>
      )}
      {!complete && modal === "restart" && (
        <Modal title="Начать новую вселенную?" onClose={() => setModal(null)}>
          <p>Хаос обнулится, архив и достижения останутся.</p>
          <button
            className="primary-button"
            onClick={() => {
              reboot();
              setModal(null);
            }}
          >
            Подтвердить перезапуск <RotateCcw size={16} />
          </button>
        </Modal>
      )}
      {!complete && modal === "about" && (
        <Modal
          title="Пользовательское несоглашение"
          onClose={() => setModal(null)}
        >
          <p>
            АБСУРД OS™ — вымышленный симулятор. Ни один муниципалитет не
            пострадал. Все совпадения с вашей работой подозрительно закономерны.
          </p>
          <p>
            Прогресс хранится в вашем браузере. Аналитики и аккаунтов нет.
            В автономном режиме данные никуда не передаются. Только если вы явно включите AI,
            сообщение и краткий контекст отправляются выбранному серверу и его провайдеру; возможны расходы владельца сервера. Очистка
            данных сайта удаляет прогресс. Установка на главный экран может
            создать отдельное хранилище в зависимости от браузера.
          </p>
          <p className="muted">
            Система одобрена Министерством Необязательных Последствий.
          </p>
        </Modal>
      )}
      {pwa.installHelp && (
        <Modal
          title="Установка АБСУРД OS™"
          onClose={() => pwa.setInstallHelp(false)}
        >
          <ol className="install-steps">
            <li>
              Откройте сайт в Safari на iPhone. На Android используйте Chrome
              или другой браузер с поддержкой PWA.
            </li>
            <li>
              На iPhone нажмите «Поделиться» → «На экран Домой». На Android
              откройте меню браузера → «Установить приложение».
            </li>
            <li>
              Подтвердите добавление. На компьютере ищите значок установки в
              адресной строке браузера.
            </li>
          </ol>
          <p className="muted">
            Пункт установки зависит от браузера. Если его нет, приложение
            по-прежнему работает как обычный сайт.
          </p>
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
