// Self-contained (no relative imports) so unit tests can load it directly.
type Environment='synthetic'|'dev'|'prod';
/** Production shows the bare release; every other build says it is still in development. */
export function releaseLabel(release:string,environment:Environment,thai:boolean){return environment==='prod'?release:release+' · '+(thai?'กำลังพัฒนา':'in development')}
export function environmentLabel(environment:Environment,thai:boolean){return environment==='prod'?(thai?'ระบบจริง':'Production')+' · lm.mw-credit.com':'DEV · dev-lm.mw-credit.com'}
/** English support text; never carries the account email, uid or borrower data. */
export function copyText({release,environment,build,commit,standalone,online,pending}:{release:string;environment:Environment;build:string|null;commit:string;standalone:boolean;online:boolean;pending:number}){
 return ['MW Credit','Release: '+releaseLabel(release,environment,false),'Build: '+(build??'unavailable'),'Commit: '+commit,'Environment: '+(environment==='prod'?'Production (https://lm.mw-credit.com)':'Development (https://dev-lm.mw-credit.com)'),'App mode: '+(standalone?'Installed app':'Browser tab'),'Connection: '+(online?'Online':'Offline'),'Waiting to sync: '+pending].join('\n');
}
