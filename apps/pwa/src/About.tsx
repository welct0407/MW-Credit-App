import type React from 'react';
import {useEffect,useRef,useState} from 'react';
import type {usePwa} from './usePwa';
import {applicationEnvironment} from './environment';
import {releaseNumber} from './release';
import {readRunningBuildVersion} from './build-version';
import {releaseLabel,environmentLabel,copyText} from './about-details';
import {useContextRefresh} from './context-refresh';
import {prepareTroubleshootingFile,troubleshootingAvailable,type TroubleshootingContext} from './troubleshooting-collect';
/** One status line; the newest outcome (file or copy) replaces the previous one. */
type Notice='copied'|'copy-failed'|'shared'|'downloaded'|'file-failed'|null;
/** Web Share with files where the device offers it (asked once with an empty file of the same type); otherwise a download. */
const canShareFiles=()=>{try{return typeof navigator.share==='function'&&!!navigator.canShare?.({files:[new File([''],'mw-credit-troubleshooting.txt',{type:'text/plain'})]})}catch{return false}};
/** R072 About: release, build and device facts for support, available signed in or out; nothing that writes. The troubleshooting file is encrypted for the owner only. */
export function About({pwa,thai,email,signedIn,logo,hasCommandAccess,pendingVisible,online,onReviewSaved,troubleshooting}:{pwa:ReturnType<typeof usePwa>;thai:boolean;email:string|null;signedIn:boolean;logo:string;hasCommandAccess:boolean;pendingVisible:number;online:boolean;onReviewSaved?:()=>void;troubleshooting:()=>TroubleshootingContext}){
 const t=(en:string,th:string)=>thai?th:en;
 const [build,setBuild]=useState<string|null|undefined>(undefined),[notice,setNotice]=useState<Notice>(null),fallback=useRef<HTMLTextAreaElement|null>(null),generation=useRef(0);
 const readBuild=()=>{const current=++generation.current;setBuild(undefined);void readRunningBuildVersion().then(value=>{if(current===generation.current)setBuild(value)})};
 // Prebuilt on open, refresh and after each use: iOS drops the tap's user activation if the click awaits storage or worker reads.
 const available=troubleshootingAvailable(),[share]=useState(canShareFiles),context=useRef(troubleshooting);context.current=troubleshooting;
 const [prepared,setPrepared]=useState<{file:File;failedSaves:number}|null>(null),[fileFailed,setFileFailed]=useState(false),fileGeneration=useRef(0);
 const prepare=()=>{if(!available)return;const current=++fileGeneration.current;setFileFailed(false);void prepareTroubleshootingFile(context.current()).then(value=>{if(current===fileGeneration.current){setPrepared(value);setNotice(prior=>prior==='file-failed'?null:prior)}},()=>{if(current===fileGeneration.current){setPrepared(null);setFileFailed(true);setNotice('file-failed')}})};
 // biome-ignore lint/correctness/useExhaustiveDependencies: read once on open; Refresh reads again.
 useEffect(()=>{readBuild();prepare();return()=>{generation.current++;fileGeneration.current++}},[]);
 useContextRefresh(true,t('Refresh About','รีเฟรชหน้าเกี่ยวกับ'),()=>{readBuild();prepare()});
 const standalone=pwa.standalone||matchMedia('(display-mode: standalone)').matches,dev=applicationEnvironment!=='prod',updateAvailable=pwa.waiting||pwa.reloadAvailable;
 const text=copyText({release:releaseNumber,environment:applicationEnvironment,build:build??null,commit:__SOURCE_COMMIT__,standalone,online,pending:signedIn?pendingVisible:0});
 useEffect(()=>{if(notice==='copy-failed')fallback.current?.select()},[notice]);
 const download=(file:File)=>{const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('downloaded');prepare()};
 const send=()=>{const file=prepared?.file;if(!file)return;
  if(!share||!navigator.canShare?.({files:[file]})){download(file);return}
  navigator.share({files:[file]}).then(()=>{setNotice('shared');prepare()},(error:unknown)=>{if((error as {name?:string}|null)?.name==='AbortError')setNotice(null);else download(file)});
 };
 const row=(label:string,value:React.ReactNode)=><div><dt>{label}</dt><dd>{value}</dd></div>;
 const failedSaves=prepared?.failedSaves??0,status=notice==='file-failed'?t('Could not create the file. Try again or use Copy details.','สร้างไฟล์ไม่สำเร็จ ลองอีกครั้งหรือใช้คัดลอกรายละเอียด'):notice==='copied'?t('Copied','คัดลอกแล้ว'):notice==='copy-failed'?t('Could not copy. Select the text below.','คัดลอกไม่สำเร็จ กรุณาเลือกข้อความด้านล่างเพื่อคัดลอก'):notice==='shared'?t('Shared.','แชร์แล้ว'):notice==='downloaded'?t('Downloaded. Send the file to the owner by LINE or email.','ดาวน์โหลดแล้ว ส่งไฟล์ให้เจ้าของทาง LINE หรืออีเมล'):'';
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
   {!signedIn?row(t('Account','บัญชี'),t('Not signed in','ยังไม่ได้ลงชื่อเข้าใช้')):email&&row(t('Signed in as','ลงชื่อเข้าใช้เป็น'),email)}
   {signedIn&&row(t('Access','สิทธิ์'),hasCommandAccess?t('Can record payments','บันทึกรับชำระได้'):t('Read-only','อ่านอย่างเดียว'))}
  </dl></section>
  <section><h3>{t('This device','อุปกรณ์นี้')}</h3><dl>
   {row(t('App mode','รูปแบบแอป'),standalone?t('Installed app','แอปที่ติดตั้งแล้ว'):t('Browser tab','แท็บเบราว์เซอร์'))}
   {row(t('Connection','การเชื่อมต่อ'),online?t('Online','ออนไลน์'):t('Offline','ออฟไลน์'))}
   {signedIn&&row(t('Waiting to sync','รอซิงค์'),<>{pendingVisible>0?(thai?pendingVisible+' รายการ':pendingVisible+' saved '+(pendingVisible===1?'change':'changes')):t('None','ไม่มี')}{pendingVisible>0&&onReviewSaved&&<button type="button" className="secondary-button" onClick={onReviewSaved}>{t('Review saved changes','ตรวจรายการที่บันทึก')}</button>}</>)}
   {row(t('Language','ภาษา'),thai?'ไทย':'English')}
  </dl></section>
  <section className="about-troubleshooting"><h3>{t('Troubleshooting','การแก้ปัญหา')}</h3>
   <p id="about-troubleshooting-help">{t('Creates an encrypted file for the app owner. Only the owner can open it. It may include details of saves that did not go through. Send it only to the owner.','สร้างไฟล์ที่เข้ารหัสสำหรับเจ้าของแอป เฉพาะเจ้าของเท่านั้นที่เปิดได้ อาจมีรายละเอียดของรายการที่บันทึกไม่สำเร็จ ส่งให้เจ้าของเท่านั้น')}</p>
   <div className="about-copy">
    <button type="button" disabled={!prepared} aria-busy={available&&!prepared&&!fileFailed} aria-describedby="about-troubleshooting-help" onClick={send}>{share?t('Send troubleshooting file','ส่งไฟล์ข้อมูลแก้ปัญหา'):t('Download troubleshooting file','ดาวน์โหลดไฟล์ข้อมูลแก้ปัญหา')}</button>
    {!available&&<span className="about-unavailable">{t('Unavailable on this device','ใช้ไม่ได้บนอุปกรณ์นี้')}</span>}
    <button type="button" className="secondary-button" onClick={async()=>{try{await navigator.clipboard.writeText(text);setNotice('copied')}catch{setNotice('copy-failed')}}}>{t('Copy details','คัดลอกรายละเอียด')}</button>
    <span role="status">{status}</span>{fileFailed&&<button type="button" className="secondary-button" onClick={()=>{setNotice(null);prepare()}}>{t('Retry','ลองอีกครั้ง')}</button>}
    {notice==='copy-failed'&&<textarea ref={fallback} readOnly rows={10} value={text} aria-label={t('Details to copy','รายละเอียดสำหรับคัดลอก')}/>}
   </div>
   {failedSaves>0&&<p className="about-troubleshooting-ready">{thai?'ไฟล์พร้อมแล้ว · มีรายการที่บันทึกไม่สำเร็จ '+failedSaves+' รายการ':'File ready · includes '+failedSaves+' failed '+(failedSaves===1?'save':'saves')}</p>}
  </section>
 </section>;
}
