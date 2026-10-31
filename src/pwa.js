import { useCallback, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

export function usePwa() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true,
  );
  const [prompt, setPrompt] = useState(null);
  const [installHelp, setInstallHelp] = useState("");
  const updateWorker = useRef(null);
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    const beforeInstall = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    const didInstall = () => {
      setInstalled(true);
      setPrompt(null);
      setInstallHelp("");
    };
    const display = window.matchMedia("(display-mode: standalone)");
    const displayChanged = () =>
      setInstalled(display.matches || navigator.standalone === true);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    display.addEventListener("change", displayChanged);
    if (import.meta.env.PROD && !updateWorker.current) {
      updateWorker.current = registerSW({
        immediate: true,
        onOfflineReady() {
          setOfflineReady(true);
        },
        onNeedRefresh() {
          setUpdateAvailable(true);
        },
        onRegisterError(error) {
          console.warn("Не удалось включить офлайн-режим:", error);
        },
      });
    }
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      display.removeEventListener("change", displayChanged);
    };
  }, []);

  const updateApp = useCallback(async () => {
    if (updateWorker.current) await updateWorker.current(true);
  }, []);

  const install = useCallback(async () => {
    if (installed) return;
    if (prompt) {
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        setInstallHelp("Браузер не смог открыть установку. Откройте его меню → «Установить приложение» или воспользуйтесь инструкцией ниже.");
      } finally {
        setPrompt(null);
      }
    } else if (isIOS) {
      setInstallHelp(
        "Откройте приложение в Safari. Нажмите «Поделиться» (квадрат со стрелкой), затем «На экран «Домой»» → «Добавить».",
      );
    } else {
      setInstallHelp(
        "Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран». Если пункта нет, попробуйте Chrome или Edge. Приложение работает и без установки.",
      );
    }
  }, [installed, prompt, isIOS]);

  return {
    offline,
    offlineReady,
    updateAvailable,
    updateApp,
    install,
    installed,
    canInstall: !installed && (Boolean(prompt) || isIOS),
    installHelp,
    setInstallHelp,
  };
}
