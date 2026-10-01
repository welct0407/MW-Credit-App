import { PublicClientApplication, BrowserCacheLocation, type AccountInfo } from '@azure/msal-browser';
type Action = 'start' | 'restart' | 'deallocate';
interface PublicConfig { tenantId: string; browserClientId: string; apiClientId: string; origin: string }
interface Status { observation?: { powerState: string; provisioningState: string; observedAt: string }; stateVersion?: string; actions?: Record<Action, boolean>; operation?: { phase: string; requestId: string; action: Action; reason?: string }; error?: string }
declare global { interface Window { VM01_CONFIGURATION: PublicConfig } }
const config = window.VM01_CONFIGURATION;
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const msal = new PublicClientApplication({ auth: { clientId: config.browserClientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: `${config.origin}/auth/callback`, postLogoutRedirectUri: `${config.origin}/auth/callback` }, cache: { cacheLocation: BrowserCacheLocation.MemoryStorage } });
const scope = `api://${config.apiClientId}/vm01.control`;
let account: AccountInfo | null = null; let snapshot: Status | undefined; let timer: ReturnType<typeof setTimeout> | undefined; let busy = false; let waitingSince = 0;
const pendingKey = 'vm01-pending-request';
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-action]')];
const disable = (): void => buttons.forEach(button => { button.disabled = true; });
const message = (value: string): void => { element('message').textContent = value; };
async function token(): Promise<string> {
  if (!account) throw new Error('Sign in to continue.');
  try { return (await msal.acquireTokenSilent({ account, scopes: [scope] })).accessToken; }
  catch { return (await msal.acquireTokenPopup({ account, scopes: [scope] })).accessToken; }
}
async function api(path: string, body?: unknown): Promise<{ status: number; data: Status }> {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', headers: { authorization: `Bearer ${await token()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() as Status };
}
function render(data: Status): void {
  snapshot = data; disable();
  element('power').textContent = data.observation?.powerState ?? 'Unknown';
  element('observed').textContent = data.observation ? `Observed ${new Date(data.observation.observedAt).toLocaleTimeString()}` : '';
  element('provisioning').textContent = `Provisioning: ${data.observation?.provisioningState ?? 'unknown'}`;
  element('operation').textContent = data.operation ? `${data.operation.action}: ${data.operation.phase.replaceAll('_', ' ')}${data.operation.reason ? ` (${data.operation.reason.replaceAll('_', ' ')})` : ''}` : '';
  if (!busy && !sessionStorage.getItem(pendingKey)) buttons.forEach(button => { button.disabled = data.actions?.[button.dataset.action as Action] !== true; });
}
function schedule(): void {
  clearTimeout(timer);
  if (account && !document.hidden && (!waitingSince || Date.now() - waitingSince < 15 * 60000)) timer = setTimeout(() => { void refresh(); }, 15000);
}
async function refresh(): Promise<void> {
  if (!account || document.hidden || busy) return;
  try {
    const pending = sessionStorage.getItem(pendingKey);
    const id = pending ? (JSON.parse(pending) as { body: { requestId: string } }).body.requestId : undefined;
    const result = await api(`/api/vm01/status${id ? `?requestId=${encodeURIComponent(id)}` : ''}`);
    element('retry').hidden = !pending;
    if (result.status === 404 && pending) { message('The pending request has no stored receipt. Use its saved request to retry; do not create another action.'); disable(); return; }
    render(result.data);
    if (result.data.operation && ['completed', 'noop', 'desired_state_observed', 'rejected'].includes(result.data.operation.phase)) { sessionStorage.removeItem(pendingKey); element('retry').hidden = true; waitingSince = 0; render(result.data); }
    message(result.data.error ? 'Status is unavailable. Actions are disabled.' : result.data.operation?.phase === 'accepted_unverified' ? 'Restart was accepted. Completion needs operation-status verification or administrator reconciliation.' : '');
  } catch { disable(); message('Connection or sign-in failed. Actions are disabled.'); }
  finally { schedule(); }
}
async function confirm(action: Action): Promise<{ workSaved: true; admissionHeld: true; approvalReference: string } | undefined> {
  if (action === 'start') return undefined;
  const dialog = element<HTMLDialogElement>('confirm');
  dialog.returnValue = '';
  element('confirm-title').textContent = action === 'restart' ? 'Restart VM-01?' : 'Deallocate VM-01?';
  element<HTMLInputElement>('saved').checked = false; element<HTMLInputElement>('held').checked = false; element<HTMLInputElement>('approval').value = '';
  element<HTMLButtonElement>('confirm-submit').disabled = true;
  const validate = (): void => { element<HTMLButtonElement>('confirm-submit').disabled = !element<HTMLInputElement>('saved').checked || !element<HTMLInputElement>('held').checked || !element<HTMLInputElement>('approval').checkValidity(); };
  dialog.oninput = validate; dialog.showModal();
  return new Promise(resolve => { dialog.onclose = () => resolve(dialog.returnValue === 'confirm' && element<HTMLInputElement>('saved').checked && element<HTMLInputElement>('held').checked && element<HTMLInputElement>('approval').checkValidity() ? { workSaved: true, admissionHeld: true, approvalReference: element<HTMLInputElement>('approval').value } : undefined); });
}
async function perform(action: Action): Promise<void> {
  if (busy || !snapshot?.stateVersion || !snapshot.observation || sessionStorage.getItem(pendingKey)) return;
  const confirmation = await confirm(action); if (action !== 'start' && !confirmation) return;
  busy = true; disable(); clearTimeout(timer);
  const body = { requestId: `${Date.now()}.${crypto.randomUUID()}`, stateVersion: snapshot.stateVersion, observedAt: snapshot.observation.observedAt, ...(confirmation ? { confirmation } : {}) };
  sessionStorage.setItem(pendingKey, JSON.stringify({ action, body })); waitingSince = Date.now();
  try { const result = await api(`/api/vm01/${action}`, body); if (result.status >= 400 && result.status < 500) { sessionStorage.removeItem(pendingKey); message(`Action was not accepted: ${result.data.error ?? 'unavailable'}.`); } else if (result.status >= 500) message('The request outcome needs verification. Its ID is preserved.'); else render(result.data); }
  catch { message('The request outcome is uncertain. Its ID is preserved. Check status before retrying the same request.'); }
  finally { busy = false; await refresh(); }
}
buttons.forEach(button => { button.onclick = () => { void perform(button.dataset.action as Action); }; });
element('refresh').onclick = () => { waitingSince = 0; void refresh(); };
element('retry').onclick = async () => {
  if (busy) return;
  const pending = sessionStorage.getItem(pendingKey); if (!pending) return;
  busy = true; disable();
  try { const saved = JSON.parse(pending) as { action: Action; body: unknown }; const result = await api(`/api/vm01/${saved.action}`, saved.body); if (result.status >= 400 && result.status < 500) { sessionStorage.removeItem(pendingKey); message(`Saved request rejected: ${result.data.error ?? 'unavailable'}.`); } else if (result.status < 400) render(result.data); }
  catch { message('Saved request outcome is still uncertain.'); }
  finally { busy = false; waitingSince = Date.now(); await refresh(); }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else void refresh(); });
element('sign-in').onclick = async () => { try { account = (await msal.loginPopup({ scopes: [scope] })).account; await signedIn(); } catch { message('Sign-in did not complete.'); } };
element('sign-out').onclick = async () => { disable(); clearTimeout(timer); const previous = account; account = null; snapshot = undefined; element('control').hidden = true; element('sign-out').hidden = true; element('sign-in').hidden = false; element('identity').textContent = ''; await msal.logoutPopup({ account: previous, postLogoutRedirectUri: `${config.origin}/auth/callback` }); };
async function signedIn(): Promise<void> { element('control').hidden = !account; element('sign-in').hidden = Boolean(account); element('sign-out').hidden = !account; element('identity').textContent = account?.username ?? ''; if (account) await refresh(); }
await msal.initialize(); await signedIn();
