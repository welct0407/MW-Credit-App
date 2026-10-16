import {parseBusinessPolicy} from '../production/business-policy.mjs';
import {OWNER_EMAIL} from '../lib/identity.mjs';
/** Reviewed private policy; DEV additionally pins the one owner-controlled device. */
export function parseNotificationPolicy(raw,environment,{requireEndpoint=true}={}){
 let p;try{p=JSON.parse(raw);}catch{throw Error('invalid_notification_policy');}
 const keys=['schemaVersion','environment','evidenceSha256','members',...(environment==='dev'?['owner']:[])].sort().join(',');
 if(!p||Object.keys(p).sort().join(',')!==keys||p.environment!==environment)throw Error('invalid_notification_policy');
 const members=parseBusinessPolicy(JSON.stringify({schemaVersion:p.schemaVersion,environment:'prod',evidenceSha256:p.evidenceSha256,members:p.members}),'prod').members;
 if(environment==='dev'){
  const o=p.owner;
  if(!o||Object.keys(o).sort().join(',')!=='endpointSha256,loginEmail,partnerId,subject'||typeof o.subject!=='string'||!o.subject.trim()||o.subject.length>128||o.loginEmail!==OWNER_EMAIL||!(/^[a-f0-9]{64}$/.test(o.endpointSha256??'')||!requireEndpoint&&o.endpointSha256===null)||members.length!==1||members[0].partnerId!==o.partnerId||members[0].loginEmail!==o.loginEmail||!members[0].capabilities.includes('read'))throw Error('invalid_notification_policy');
  Object.freeze(o);
 }
 return Object.freeze({...p,members});
}
