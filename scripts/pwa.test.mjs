import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function mount({ production = true, ios = false, standalone = false } = {}) {
  const events = new EventTarget();
  const media = new EventTarget();
  media.matches = standalone;
  let states = [],
    cursor = 0,
    effects = [],
    registration,
    registrations = 0,
    updates = 0;
  const context = {
    navigator: {
      onLine: true,
      userAgent: ios ? "iPhone" : "Chrome",
      standalone: false,
    },
    window: Object.assign(events, { matchMedia: () => media }),
    useState(initial) {
      const i = cursor++;
      if (!(i in states))
        states[i] = typeof initial === "function" ? initial() : initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === "function" ? value(states[i]) : value;
        },
      ];
    },
    useEffect(effect) {
      effects.push(effect);
    },
    useRef(value) {
      return context.useState(() => ({ current: value }))[0];
    },
    useCallback(fn) {
      return fn;
    },
    registerSW(options) {
      registrations++;
      registration = options;
      return async () => {
        updates++;
      };
    },
  };
  let source = readFileSync(new URL("../src/pwa.js", import.meta.url), "utf8")
    .replace(/^import .* from .*$/gm, "")
    .replaceAll("import.meta.env.PROD", String(production))
    .replace("export function usePwa", "function usePwa");
  vm.runInNewContext(source + "\nthis.hook = usePwa", context);
  const render = () => {
    cursor = 0;
    effects = [];
    return context.hook();
  };
  render();
  const cleanup = effects.map((fn) => fn()).filter(Boolean);
  return {
    render,
    context,
    events,
    media,
    cleanup,
    get registration() {
      return registration;
    },
    get registrations() {
      return registrations;
    },
    get updates() {
      return updates;
    },
  };
}

test("offline follows network events; update waits for explicit approval", async () => {
  const app = mount();
  assert.equal(app.registrations, 1);
  assert.equal(app.render().offline, false);
  app.context.navigator.onLine = false;
  app.events.dispatchEvent(new Event("offline"));
  assert.equal(app.render().offline, true);
  app.context.navigator.onLine = true;
  app.events.dispatchEvent(new Event("online"));
  assert.equal(app.render().offline, false);
  app.registration.onNeedRefresh();
  assert.equal(app.render().updateAvailable, true);
  assert.equal(app.updates, 0);
  await app.render().updateApp();
  assert.equal(app.updates, 1);
  app.cleanup.forEach((fn) => fn());
});

test("offline readiness is shown only when precaching completes", () => {
  const app = mount();
  assert.equal(app.render().offlineReady, false);
  app.registration.onOfflineReady();
  assert.equal(app.render().offlineReady, true);
});

test("development never registers a service worker", () => {
  const app = mount({ production: false });
  assert.equal(app.registrations, 0);
});

test("iOS provides manual installation help, standalone is already installed", async () => {
  const app = mount({ ios: true });
  assert.equal(app.render().canInstall, true);
  await app.render().install();
  assert.match(app.render().installHelp, /Поделиться/);
  app.render().setInstallHelp("");
  assert.equal(app.render().installHelp, "");
  const installed = mount({ standalone: true });
  assert.equal(installed.render().installed, true);
  assert.equal(installed.render().canInstall, false);
});

test("rejected native install prompt falls back to help", async () => {
  const app=mount();const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{throw new Error('Unavailable')};e.userChoice=Promise.resolve({outcome:'dismissed'});app.events.dispatchEvent(e);await assert.doesNotReject(()=>app.render().install());assert.ok(app.render().installHelp);
});

test("install prompt requires user action and installed event changes status", async () => {
  const app = mount();
  let prompts = 0;
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => {
    prompts++;
  };
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  app.events.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(app.render().canInstall, true);
  assert.equal(prompts, 0);
  await app.render().install();
  assert.equal(prompts, 1);
  app.events.dispatchEvent(new Event("appinstalled"));
  assert.equal(app.render().installed, true);
  assert.equal(app.render().canInstall, false);
});
