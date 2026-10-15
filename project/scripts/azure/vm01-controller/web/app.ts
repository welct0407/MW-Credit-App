import { PublicClientApplication, BrowserCacheLocation, type AccountInfo } from '@azure/msal-browser';
import { StatusCheckError, responseData, statusException, statusFailure } from './diagnostics.js';
import { APPROVAL_REFERENCE_PATTERN, validApprovalReference } from '../src/confirmation.js';
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
const noticeKey = 'vm01-action-notice';
const terminal = (phase: string): boolean => ['completed', 'noop', 'desired_state_observed', 'rejected'].includes(phase);
const actionNotice = (value: string): void => {
  element('action-message').textContent = value;
  if (value) sessionStorage.setItem(noticeKey, value); else sessionStorage.removeItem(noticeKey);
};
// Only explicit pre-dispatch failures from the first submission permit a new request.
const preDispatchFailures: Record<string, { status: number; help: string }> = {
  invalid_confirmation: { status: 400, help: 'Use one valid approval reference, without spaces or semicolons, then confirm again.' },
  invalid_request: { status: 400, help: 'Refresh status and confirm again. If this repeats, ask the controller administrator to review it.' },
  stale_precondition: { status: 412, help: 'Refresh status and confirm again using the current VM state.' },
  expired_request: { status: 412, help: 'Refresh status and confirm again.' },
  interruption_confirmation_required: { status: 412, help: 'Save work, hold new VM work, and confirm the interruption.' },
  mutations_disabled: { status: 409, help: 'Ask the controller administrator to review whether new actions are enabled.' },
  state_not_actionable: { status: 409, help: 'Refresh status and wait for a stable VM state.' }
};
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-action]')];
const disable = (): void => buttons.forEach(button => { button.disabled = true; });
const message = (value: string): void => { element('message').textContent = value; };
async function token(): Promise<string> {
  if (!account) throw new Error('Sign in to continue.');
  try { return (await msal.acquireTokenSilent({ account, scopes: [scope] })).accessToken; }
  catch { return (await msal.acquireTokenPopup({ account, scopes: [scope] })).accessToken; }
}
async function api(path: string, body?: unknown): Promise<{ status: number; data: Status }> {
  let accessToken: string;
  try { accessToken = await token(); } catch { throw new StatusCheckError('token'); }
  let response: Response;
  try { response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', headers: { authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new StatusCheckError('transport'); }
  return { status: response.status, data: await responseData(response) as Status };
}
function render(data: Status): void {
  snapshot = data; disable();
  element('power').textContent = data.observation?.powerState ?? 'Unknown';
  element('observed').textContent = data.observation ? `Observed ${new Date(data.observation.observedAt).toLocaleTimeString()}` : '';
  element('provisioning').textContent = `Provisioning: ${data.observation?.provisioningState ?? 'unknown'}`;
  const op = data.operation;
  const unresolved = op && !terminal(op.phase);
  const description = op ? `${op.action}: ${op.phase.replaceAll('_', ' ')}${op.reason ? ` (${op.reason.replaceAll('_', ' ')})` : ''}` : '';
  const fallback = op?.reason === 'operation_tracking_url_rejected' || op?.reason === 'operation_tracking_header_missing';
  const off = data.observation?.powerState === 'deallocated' && data.observation.provisioningState === 'Succeeded';
  element('operation').textContent = unresolved
    ? `${description}. ${fallback ? 'Azure accepted the action; the controller is verifying its result using the saved request ID. ' : ''}${off ? 'VM power is deallocated; the operation receipt is still pending verification.' : 'The operation receipt is still pending verification.'} Keep new VM work held. Check status or ask the controller administrator to reconcile; do not send another power action.`
    : description;
  if (!busy && !unresolved && !sessionStorage.getItem(pendingKey)) buttons.forEach(button => { button.disabled = data.actions?.[button.dataset.action as Action] !== true; });
}
function schedule(): void {
  clearTimeout(timer);
  const paused = Boolean(waitingSince && Date.now() - waitingSince >= 15 * 60000);
  element('polling-note').textContent = paused ? 'Automatic status checks paused after 15 minutes. Use Refresh status to continue verification; the saved request is retained.' : '';
  if (account && !document.hidden && !paused) timer = setTimeout(() => { void refresh(); }, 15000);
}
function settleReceipt(data: Status, id: string | undefined): boolean {
  const op = data.operation;
  if (!id || !op || op.requestId !== id || !terminal(op.phase)) return false;
  sessionStorage.removeItem(pendingKey); element('retry').hidden = true; waitingSince = 0;
  actionNotice(op.phase === 'rejected' ? 'The saved operation was rejected. Review its receipt before authorizing a new action.' : '');
  return true;
}
async function refresh(): Promise<void> {
  if (!account || document.hidden || busy) return;
  try {
    const pending = sessionStorage.getItem(pendingKey);
    const id = pending ? (JSON.parse(pending) as { body: { requestId: string } }).body.requestId : undefined;
    if (pending && !waitingSince) waitingSince = Number(id?.slice(0, 13)) || Date.now();
    element('retry').hidden = !pending;
    const result = await api(`/api/vm01/status${id ? `?requestId=${encodeURIComponent(id)}` : ''}`);
    if (result.status === 404 && pending) { snapshot = undefined; message('No receipt was found for the saved request. Keep its ID and new VM work held; ask the controller administrator to reconcile before any new action.'); disable(); return; }
    if (result.status >= 400 || result.data.error) { snapshot = undefined; disable(); element('power').textContent = 'Unknown'; message(statusFailure(result.status, result.data.error)); return; }
    render(result.data);
    if (pending && settleReceipt(result.data, id)) render(result.data);
    const missingReceipt = pending && result.data.operation?.requestId !== id;
    if (missingReceipt) disable();
    message(missingReceipt ? 'The saved request has no matching receipt in this response. Keep its ID and check status; ask the controller administrator to reconcile if it remains unavailable.' : '');
  } catch (error) { snapshot = undefined; disable(); element('power').textContent = 'Unknown'; message(statusException(error)); }
  finally { schedule(); }
}
async function confirm(action: Action): Promise<{ workSaved: true; admissionHeld: true; approvalReference: string } | undefined> {
  if (action === 'start') return undefined;
  const dialog = element<HTMLDialogElement>('confirm');
  dialog.returnValue = '';
  element('confirm-title').textContent = action === 'restart' ? 'Restart VM-01?' : 'Deallocate VM-01?';
  element<HTMLInputElement>('saved').checked = false; element<HTMLInputElement>('held').checked = false;
  const approval = element<HTMLInputElement>('approval');
  approval.value = ''; approval.pattern = APPROVAL_REFERENCE_PATTERN; approval.setCustomValidity('');
  element<HTMLButtonElement>('confirm-submit').disabled = true;
  const validate = (): void => {
    approval.setCustomValidity(validApprovalReference(approval.value) ? '' : 'Use one approval reference, up to 128 characters, without spaces or semicolons.');
    element<HTMLButtonElement>('confirm-submit').disabled = !element<HTMLInputElement>('saved').checked || !element<HTMLInputElement>('held').checked || !approval.checkValidity();
  };
  dialog.oninput = validate; dialog.showModal();
  return new Promise(resolve => { dialog.onclose = () => resolve(dialog.returnValue === 'confirm' && element<HTMLInputElement>('saved').checked && element<HTMLInputElement>('held').checked && validApprovalReference(approval.value) && approval.checkValidity() ? { workSaved: true, admissionHeld: true, approvalReference: approval.value } : undefined); });
}
async function perform(action: Action): Promise<void> {
  if (busy || !snapshot?.stateVersion || !snapshot.observation || sessionStorage.getItem(pendingKey)) return;
  const confirmation = await confirm(action); if (action !== 'start' && !confirmation) return;
  busy = true; disable(); clearTimeout(timer); actionNotice('');
  const body = { requestId: `${Date.now()}.${crypto.randomUUID()}`, stateVersion: snapshot.stateVersion, observedAt: snapshot.observation.observedAt, ...(confirmation ? { confirmation } : {}) };
  sessionStorage.setItem(pendingKey, JSON.stringify({ action, body })); waitingSince = Date.now();
  try {
    const result = await api(`/api/vm01/${action}`, body);
    const rejection = result.data.error ? preDispatchFailures[result.data.error] : undefined;
    if (settleReceipt(result.data, body.requestId)) {
      render(result.data);
    } else if (rejection && result.status === rejection.status && !result.data.operation) {
      sessionStorage.removeItem(pendingKey); waitingSince = 0;
      actionNotice(`Action was not accepted (${result.data.error}). ${rejection.help}`);
    } else if (result.status >= 400 || result.data.error) {
      actionNotice(`Action outcome needs verification (HTTP ${result.status}). Its ID is preserved. Check status; sign in again if needed. Ask the controller administrator to reconcile before any new power action.`);
    } else {
      actionNotice(result.data.operation && !terminal(result.data.operation.phase) ? 'The request is saved. Check status until its operation receipt is verified; keep new VM work held.' : '');
      render(result.data);
    }
  } catch {
    actionNotice('The request outcome is uncertain. Its ID is preserved. Check status; ask the controller administrator to reconcile before any new power action.');
  }
  finally { busy = false; await refresh(); }
}
buttons.forEach(button => { button.onclick = () => { void perform(button.dataset.action as Action); }; });
const checkStatus = (): void => { waitingSince = sessionStorage.getItem(pendingKey) ? Date.now() : 0; void refresh(); };
element('refresh').onclick = checkStatus;
// This control never POSTs, including after an accepted or uncertain dispatch.
element('retry').onclick = checkStatus;
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else void refresh(); });
element('sign-in').onclick = async () => { try { account = (await msal.loginPopup({ scopes: [scope] })).account; await signedIn(); } catch { message('Sign-in did not complete.'); } };
element('sign-out').onclick = async () => { disable(); clearTimeout(timer); const previous = account; account = null; snapshot = undefined; element('control').hidden = true; element('sign-out').hidden = true; element('sign-in').hidden = false; element('identity').textContent = ''; await msal.logoutPopup({ account: previous, postLogoutRedirectUri: `${config.origin}/auth/callback` }); };
async function signedIn(): Promise<void> { element('control').hidden = !account; element('sign-in').hidden = Boolean(account); element('sign-out').hidden = !account; element('identity').textContent = account?.username ?? ''; if (account) await refresh(); }
element('action-message').textContent = sessionStorage.getItem(noticeKey) ?? '';
await msal.initialize(); await signedIn();
