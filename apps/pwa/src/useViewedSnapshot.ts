import {useEffect} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {projectViewedSnapshot,type ViewedDomain} from './viewed-snapshot';
/** Only current successfully displayed source records enter the bounded device cache. */
export function useViewedSnapshot(access:CommandAccess,domain:ViewedDomain,record:any){
 useEffect(()=>{let active=true;if(!record||!access.offline||access.offlineOnly||!navigator.onLine)return;const {asOf,businessDate}=record;if(typeof asOf!=='string'||typeof businessDate!=='string')return;void(async()=>{try{const snapshot=projectViewedSnapshot(domain,record,businessDate,asOf);if(!await access.offline!.authorized()||!active)return;await access.offline!.saveViewedSnapshot(snapshot);if(active)window.dispatchEvent(new Event('mw-offline-saved'))}catch{if(active)window.dispatchEvent(new Event('mw-offline-save-failed'))}})();return()=>{active=false}},[record,access.offline,access.offlineOnly,domain]);
}
