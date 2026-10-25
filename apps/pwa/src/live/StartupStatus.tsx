// APP-ARCH-06: app-version startup gate extracted from live-main.tsx without behaviour change.
/** R072: About stays reachable when the version check fails (onAbout). */
export function StartupStatus({startup,t,canUseSaved,onRetry,onUseSaved,onAbout}:{startup:string;t:(en:string,th:string)=>string;canUseSaved:boolean;onRetry:()=>void;onUseSaved:()=>void;onAbout:()=>void}){
 return <section className="startup-version" role="status">{startup==='error'&&<h2>{t('Unable to check app version','ไม่สามารถตรวจสอบเวอร์ชันแอป')}</h2>}{startup==='error'&&<><button type="button" onClick={onRetry}>{t('Retry','ลองอีกครั้ง')}</button><button type="button" className="text-action" data-about-trigger="startup" onClick={onAbout}>{t('About','เกี่ยวกับ')}</button>{canUseSaved&&<button type="button" onClick={onUseSaved}>{t('Waiting to sync','รอซิงค์')}</button>}</>}</section>;
}
