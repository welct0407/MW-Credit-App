import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const encodeTraversalCursor=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
/** A traversal is actor/day scoped. It describes a range of individually
 * authoritative reads, not an exported database transaction snapshot. */
export function readTraversalCursor(cursor,{actor,domain,businessDate,asOf,phases}){
 const identity=hash([actor.issuer,actor.subject,actor.partnerId]);
 if(cursor==null)return {v:2,domain,actor:identity,day:businessDate,startedAt:asOf,generation:hash([identity,domain,businessDate,asOf]),phase:0,state:null,done:0};
 try{
  if(typeof cursor!=='string'||cursor.length>16384||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error();
  const value=JSON.parse(Buffer.from(cursor,'base64url').toString());
  if(encodeTraversalCursor(value)!==cursor||Object.keys(value).join(',')!=='v,domain,actor,day,startedAt,generation,phase,state,done'||value.v!==2||value.domain!==domain||value.actor!==identity||!Number.isInteger(value.phase)||value.phase<0||value.phase>=phases||!Number.isSafeInteger(value.done)||value.done<0||typeof value.startedAt!=='string'||!Number.isFinite(Date.parse(value.startedAt))||Date.parse(value.startedAt)>Date.parse(asOf)+60000||value.generation!==hash([identity,domain,value.day,value.startedAt]))throw Error();
  if(value.day!==businessDate||Date.parse(asOf)-Date.parse(value.startedAt)>86400000)throw Error('dataset_changed');
  return value;
 }catch(error){throw Error(error.message==='dataset_changed'?'dataset_changed':'invalid_request')}
}
