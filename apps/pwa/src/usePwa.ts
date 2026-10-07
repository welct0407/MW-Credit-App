import { useEffect, useRef, useState } from 'react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// No test hostname override is shipped. The worker can be tested by a separate harness.
const canonical = import.meta.env.PROD && import.meta.env.MODE === 'live-dev'
  && location.origin === 'https://dev-lm.mw-credit.com';

export function usePwa() {
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [reloadAvailable, setReloadAvailable] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [activating, setActivating] = useState(false);
  const chosenActivation = useRef<ServiceWorker | null>(null);
  const activationCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { activationCleanup.current?.(); chosenActivation.current = null; }, []);
  useEffect(() => {
    if (!canonical) return;
    const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = '/manifest.webmanifest';
    const touch = document.createElement('link'); touch.rel = 'apple-touch-icon'; touch.href = '/icons/apple-touch-icon.png';
    const theme = document.createElement('meta'); theme.name = 'theme-color'; theme.content = '#e8710a';
    document.head.append(manifest, touch, theme);
    const display = matchMedia('(display-mode: standalone)');
    const checkDisplay = () => setStandalone(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    checkDisplay(); display.addEventListener('change', checkDisplay);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent); };
    const installed = () => { setStandalone(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let previousController = navigator.serviceWorker?.controller ?? null;
    let lastCheck = 0;
    const checkUpdate = () => {
      if (document.visibilityState !== 'visible' || !registration || performance.now() - lastCheck < 60000) return;
      lastCheck = performance.now();
      void registration.update().catch(() => { if (!disposed) setUnavailable(true); });
    };
    const changed = () => {
      if (chosenActivation.current === navigator.serviceWorker.controller && chosenActivation.current) { activationCleanup.current?.(); chosenActivation.current = null; location.reload(); return; }
      if (previousController) { setWaiting(null); setReloadAvailable(true); }
      previousController = navigator.serviceWorker.controller;
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(async value => {
        if (disposed) return;
        registration = value;
        if (value.waiting) setWaiting(value.waiting);
        const inspect = () => {
          const worker = value.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (disposed) return;
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(value.waiting);
            if (worker.state === 'redundant') setUnavailable(true);
          });
        };
        value.addEventListener('updatefound', inspect); inspect();
        lastCheck = performance.now();
        try { await value.update(); } catch { if (!disposed) setUnavailable(true); }
      }).catch(() => { if (!disposed) setUnavailable(true); });
      document.addEventListener('visibilitychange', checkUpdate);
    } else setUnavailable(true);
    return () => {
      disposed = true; manifest.remove(); touch.remove(); theme.remove();
      display.removeEventListener('change', checkDisplay);
      window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installed);
      navigator.serviceWorker?.removeEventListener('controllerchange', changed);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, []);
  async function install() {
    if (!installPrompt) return;
    try { await installPrompt.prompt(); await installPrompt.userChoice; }
    catch { setUnavailable(true); }
    finally { setInstallPrompt(null); }
  }
  function update() {
    if (reloadAvailable) { location.reload(); return; }
    if (!waiting) return;
    activationCleanup.current?.();
    const target = waiting;
    chosenActivation.current = target; setActivating(true); setUnavailable(false);
    const failed = () => {
      activationCleanup.current?.(); chosenActivation.current = null;
      setActivating(false); setUnavailable(true);
      if (target.state === 'redundant') setWaiting(null);
    };
    const stateChanged = () => { if (target.state === 'redundant') failed(); };
    const timeout = window.setTimeout(failed, 15000);
    target.addEventListener('statechange', stateChanged);
    activationCleanup.current = () => {
      window.clearTimeout(timeout); target.removeEventListener('statechange', stateChanged);
      activationCleanup.current = null;
    };
    try {
      if (target.state === 'redundant') { failed(); return; }
      target.postMessage({ type: 'ACTIVATE_UPDATE' });
    } catch { failed(); }
  }
  return { canonical, standalone, canInstall: Boolean(installPrompt), install, waiting: Boolean(waiting), reloadAvailable, unavailable, activating, update };
}