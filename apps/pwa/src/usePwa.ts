import { useEffect, useRef, useState } from 'react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// No test hostname override is shipped. The worker can be tested by a separate harness.
const canonical = import.meta.env.PROD && import.meta.env.MODE === 'live-dev'
  && location.origin === 'https://dev-lm.mw-credit.com';

export function usePwa() {
  const [startup,setStartup]=useState<'checking'|'upgrading'|'ready'|'error'|'offline'>(canonical?(navigator.onLine?'checking':'offline'):'ready');
  const [attempt,setAttempt]=useState(0);
  const startupReload=useRef(false);
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
    if(!navigator.onLine){setStartup('offline');return;}
    setStartup('checking');startupReload.current=false;
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
      if(startupReload.current){startupReload.current=false;location.reload();return;}
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
        try {
          const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
          let latest:{schemaVersion:number;version:string;entry:string};
          try{const response=await fetch('/build-version.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:abort.signal});if(!response.ok)throw Error('version_unavailable');latest=await response.json();if(latest.schemaVersion!==1||!/^[a-f0-9]{24}$/.test(latest.version)||!/^\/assets\/[^/]+\.js$/.test(latest.entry))throw Error('invalid_version')}finally{clearTimeout(timer)}
          if(disposed)return;
          const current=Array.from(document.scripts).some(script=>new URL(script.src||location.href).pathname===latest.entry);
          if(!current)setStartup('upgrading');
          let updateTimer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([value.update(),new Promise((_,reject)=>{updateTimer=setTimeout(()=>reject(Error('update_timeout')),20000)})]);}finally{clearTimeout(updateTimer)}
          if(disposed)return;
          const installing=value.installing;
          if(installing&& !['installed','activated'].includes(installing.state))await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>finish(false),20000);const changed=()=>{if(['installed','activated'].includes(installing.state))finish(true);else if(installing.state==='redundant')finish(false)};function finish(ok:boolean){clearTimeout(timer);installing!.removeEventListener('statechange',changed);ok?resolve():reject(Error('install_failed'))}installing.addEventListener('statechange',changed);changed()});
          if(disposed)return;
          const target=value.waiting??value.active??installing;if(!target)throw Error('worker_unavailable');
          const installedVersion=await new Promise<string>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('version_timeout'))},5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data?.version)};target.postMessage({type:'GET_BUILD_VERSION'},[channel.port2])});
          if(disposed)return;if(installedVersion!==latest.version)throw Error('deployment_changed');
          if(!current||value.waiting){
            if(sessionStorage.getItem('mw-startup-upgrade')===latest.version)throw Error('upgrade_reload_incomplete');
            sessionStorage.setItem('mw-startup-upgrade',latest.version);
            setStartup('upgrading');
            if(value.waiting){startupReload.current=true;value.waiting.postMessage({type:'ACTIVATE_UPDATE'});setTimeout(()=>{if(!disposed){startupReload.current=false;setStartup('error')}},20000)}
            else {startupReload.current=true;location.reload()}
          }else {sessionStorage.removeItem('mw-startup-upgrade');setStartup('ready');}
        } catch { if (!disposed){startupReload.current=false;setUnavailable(true);setStartup(navigator.onLine?'error':'offline')} }
      }).catch(() => { if (!disposed){startupReload.current=false;setUnavailable(true);setStartup(navigator.onLine?'error':'offline')} });
      document.addEventListener('visibilitychange', checkUpdate);
    } else {setUnavailable(true);setStartup('error');}
    return () => {
      disposed = true; startupReload.current=false; manifest.remove(); touch.remove(); theme.remove();
      display.removeEventListener('change', checkDisplay);
      window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installed);
      navigator.serviceWorker?.removeEventListener('controllerchange', changed);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, [attempt]);
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
  return { startup,retryStartup:()=>setAttempt(value=>value+1),useSavedOffline:()=>setStartup('offline'),canonical, standalone, canInstall: Boolean(installPrompt), install, waiting: Boolean(waiting), reloadAvailable, unavailable, activating, update };
}