// APP-ARCH-06: app-version startup gate extracted from live-main.tsx without behaviour change.
export function StartupStatus({startup,t,canUseSaved,onRetry,onUseSaved}:{startup:string;t:(en:string,th:string)=>string;canUseSaved:boolean;onRetry:()=>void;onUseSaved:()=>void}){
 return <section className="startup-version" role="status">{startup==='error'&&<h2>{t('Unable to check app version','ไม่สามารถตรวจสอบเวอร์ชันแอป')}</h2>}{startup==='error'&&<><button onClick={onRetry}>{t('Retry','ลองอีกครั้ง')}</button>{canUseSaved&&<button onClick={onUseSaved}>{t('Waiting to sync','รอซิงค์')}</button>}</>}</section>;
}
