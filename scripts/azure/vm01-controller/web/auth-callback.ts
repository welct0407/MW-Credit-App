import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
try { await broadcastResponseToMainFrame(); }
catch { document.getElementById('auth-result')!.textContent = 'Return to VM-01 control and sign in again.'; }
