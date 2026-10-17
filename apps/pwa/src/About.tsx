import type React from 'react';
import {useEffect,useRef,useState} from 'react';
import type {usePwa} from './usePwa';
import {applicationEnvironment} from './environment';
import {releaseNumber} from './release';
import {readRunningBuildVersion} from './build-version';
import {releaseLabel,environmentLabel,copyText} from './about-details';
import {useContextRefresh} from './context-refresh';
/** R072 About: release, build and device facts for support; no borrower data and nothing that writes. */
export function About({pwa,thai,email,logo,hasCommandAccess,pendingVisible,online,onReviewSaved}:{pwa:ReturnType<typeof usePwa>;thai:boolean;email:string|null;logo:string;hasCommandAccess:boolean;pendingVisible:number;online:boolean;onReviewSaved:()=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 const [build,setBuild]=useState<string|null|undefined>(undefined),[copied,setCopied]=useState<boolean|null>(null),fallback=useRef<HTMLTextAreaElement|null>(null),generation=useRef(0);
 const readBuild=()=>{const current=++generation.current;setBuild(undefined);void readRunningBuildVersion().then(value=>{if(current===generation.current)setBuild(value)})};
 // biome-ignore lint/correctness/useExhaustiveDependencies: read once on open; Refresh reads again.
 useEffect(()=>{readBuild();return()=>{generation.current++}},[]);
 useContextRefresh(true,t('Refresh About','รีเฟรชหน้าเกี่ยวกับ'),readBuild);
 const standalone=pwa.standalone||matchMedia('(display-mode: standalone)').matches,dev=applicationEnvironment!=='prod',updateAvailable=pwa.waiting||pwa.reloadAvailable;
 const text=copyText({release:releaseNumber,environment:applicationEnvironment,build:build??null,commit:__SOURCE_COMMIT__,standalone,online,pending:pendingVisible});
 useEffect(()=>{if(copied===false)fallback.current?.select()},[copied]);
 const row=(label:string,value:React.ReactNode)=><div><dt>{label}</dt><dd>{value}</dd></div>;
 return <section className="borrower-record about-record" aria-label={t('About','เกี่ยวกับ')}><h2>{t('About','เกี่ยวกับ')}</h2>
  <div className="about-identity"><img src={logo} alt=""/><strong>{t('MW Credit','MW สินเชื่อ')}</strong>{dev&&<span className="about-environment-tag">DEV</span>}</div>
  <section><h3>{t('Version','เวอร์ชัน')}</h3><dl>
   {row(t('Release','รีลีส'),releaseLabel(releaseNumber,applicationEnvironment,thai))}
   {row(t('Build','บิลด์'),build===undefined?t('Checking…','กำลังตรวจสอบ…'):build===null?t('Unavailable','ไม่พร้อมใช้งาน'):<code>{build}</code>)}
   {row(t('Source commit','คอมมิต'),<code>{__SOURCE_COMMIT__}</code>)}
   {row(t('Update','การอัปเดต'),<>{updateAvailable?t('A new version is ready.','มีเวอร์ชันใหม่พร้อมใช้'):t('Up to date','เป็นเวอร์ชันล่าสุด')}{updateAvailable&&<button type="button" className="secondary-button" disabled={pwa.startup!=='ready'||pwa.activating||!pwa.safe} onClick={pwa.update}>{pwa.reloadAvailable?t('Reload app','โหลดแอปใหม่'):t('Update and reload','อัปเดตและโหลดใหม่')}</button>}</>)}
  </dl></section>
  <section><h3>{t('Environment and account','สภาพแวดล้อมและบัญชี')}</h3><dl>
   {row(t('Environment','สภาพแวดล้อม'),environmentLabel(applicationEnvironment,thai))}
   {email&&row(t('Signed in as','ลงชื่อเข้าใช้เป็น'),email)}
   {row(t('Access','สิทธิ์'),hasCommandAccess?t('Can record payments','บันทึกรับชำระได้'):t('Read-only','อ่านอย่างเดียว'))}
  </dl></section>
  <section><h3>{t('This device','อุปกรณ์นี้')}</h3><dl>
   {row(t('App mode','รูปแบบแอป'),standalone?t('Installed app','แอปที่ติดตั้งแล้ว'):t('Browser tab','แท็บเบราว์เซอร์'))}
   {row(t('Connection','การเชื่อมต่อ'),online?t('Online','ออนไลน์'):t('Offline','ออฟไลน์'))}
   {row(t('Waiting to sync','รอซิงค์'),<>{pendingVisible>0?(thai?pendingVisible+' รายการ':pendingVisible+' saved '+(pendingVisible===1?'change':'changes')):t('None','ไม่มี')}{pendingVisible>0&&<button type="button" className="secondary-button" onClick={onReviewSaved}>{t('Review saved changes','ตรวจรายการที่บันทึก')}</button>}</>)}
   {row(t('Language','ภาษา'),thai?'ไทย':'English')}
  </dl></section>
  <div className="about-copy"><button type="button" className="secondary-button" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true)}catch{setCopied(false)}}}>{t('Copy details','คัดลอกรายละเอียด')}</button><span role="status">{copied===null?'':copied?t('Copied','คัดลอกแล้ว'):t('Could not copy. Select the text below.','คัดลอกไม่สำเร็จ กรุณาเลือกข้อความด้านล่างเพื่อคัดลอก')}</span>{copied===false&&<textarea ref={fallback} readOnly rows={10} value={text} aria-label={t('Details to copy','รายละเอียดสำหรับคัดลอก')}/>}</div>
 </section>;
}
