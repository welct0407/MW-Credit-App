import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';
import type { Config } from './config.js';
import { callbackUrl, canonical, equal, hash, SafeError, type CallbackTransport } from './security.js';
import type { Document, Store } from './store.js';

export const EVENT_NAME = 'grafana.alert.transition';
export const Filters = z.object({
  alert_names:z.array(z.string().min(1).max(200)).max(30).optional(),
  components:z.array(z.string().min(1).max(100)).max(30).optional(),
  statuses:z.array(z.enum(['firing','resolved'])).min(1).max(2).optional(),
}).strict();
export type FiltersType = z.infer<typeof Filters>;
export const Payload = z.object({
  source:z.string(), fingerprint:z.string(), alert_name:z.string(), component:z.string().nullable(),
  status:z.enum(['firing','resolved']), starts_at:z.string(), ends_at:z.string().nullable(),
  summary:z.string(), dashboard_url:z.string().nullable(),
}).strict();
const Alert = z.object({
  status:z.enum(['firing','resolved']), fingerprint:z.string().min(1).max(200),
  labels:z.record(z.string(),z.string().max(2000)), annotations:z.record(z.string(),z.string().max(4000)).default({}),
  startsAt:z.iso.datetime({offset:true}), endsAt:z.iso.datetime({offset:true}).optional(),
  dashboardURL:z.string().max(2000).optional(),
}).passthrough();
const Grafana = z.object({alerts:z.array(Alert).min(1).max(50),truncatedAlerts:z.number().int().nonnegative().default(0)}).passthrough();
export interface EventRecord extends Document { id:string; timestamp:string; data:z.infer<typeof Payload>; body:string; createdAt:number; deleteAfter:Date }
export interface Subscription extends Document {
  id:string; owner:string; name:string; filters:FiltersType; url:string; secret:string;
  oldSecret?:string; rotateUntil?:number; expiresAt:number; active:boolean; verifiedAt:number; revision:number;
  grantHash?:string;
}
export interface Delivery extends Document {
  id:string; eventId:string; subscriptionId:string; state:'pending'|'delivered'|'failed'|'cancelled';
  nextAt:number; leaseUntil:number; leaseToken:string; attempt:number; createdAt:number; reason?:string;
}
export function seal(value:string,key:Buffer) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');
}
export function open(value:string,key:Buffer) {
  const bytes=Buffer.from(value,'base64'), decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
export function normalizedFilters(value:unknown) {
  const filters=Filters.parse(value);
  for(const key of ['alert_names','components','statuses'] as const) if(filters[key]) (filters as any)[key]=[...new Set(filters[key])].sort();
  return filters;
}
export function matches(filters:FiltersType,data:z.infer<typeof Payload>) {
  return (!filters.alert_names || filters.alert_names.includes(data.alert_name)) &&
    (!filters.components || (data.component !== null && filters.components.includes(data.component))) &&
    (!filters.statuses || filters.statuses.includes(data.status));
}
export function normalizeGrafana(value:unknown,source:string,now:number):EventRecord[] {
  const group=Grafana.parse(value);
  if(group.truncatedAlerts) throw new SafeError('truncated_grafana_group');
  return group.alerts.map(alert => {
    const name=alert.labels.alertname;
    if(!name) throw new SafeError('missing_alertname');
    const starts=new Date(alert.startsAt).toISOString();
    const ends=alert.status==='resolved' && alert.endsAt ? new Date(alert.endsAt).toISOString() : null;
    if(alert.status==='resolved' && (!ends || Date.parse(ends)<Date.parse(starts))) throw new SafeError('invalid_resolution_time');
    const timestamp=ends ?? starts;
    if(Date.parse(timestamp)>now+120_000) throw new SafeError('future_alert_time');
    let dashboard:string|null=null;
    if(alert.dashboardURL) { try { const u=new URL(alert.dashboardURL); if(u.origin==='https://monitor.mw-credit.com' && !u.username && !u.password) dashboard=u.toString(); } catch {} }
    const data=Payload.parse({source,fingerprint:alert.fingerprint,alert_name:name,component:alert.labels.component ?? null,status:alert.status,starts_at:starts,ends_at:ends,summary:(alert.annotations.summary ?? name).slice(0,1000),dashboard_url:dashboard});
    const id='evt_'+hash(canonical([source,alert.fingerprint,starts,alert.status,ends]));
    const body=JSON.stringify({eventId:id,name:EVENT_NAME,timestamp,data,cursor:null});
    if(Buffer.byteLength(body)>262144) throw new SafeError('event_too_large');
    return {id,timestamp,data,body,createdAt:now,deleteAfter:new Date(now+30*86400_000)};
  });
}

export class Bridge {
  constructor(readonly store:Store, readonly config:Config, readonly send:CallbackTransport, readonly now=()=>Date.now(),readonly jitter=()=>Math.random()) {}
  async ownerActive() { return this.config.ownerEnabled && (await this.store.get('control/owner'))?.enabled !== false; }
  identity(name:string,filters:FiltersType,url:string) { return 'sub_'+hash(canonical([this.config.ownerSub,name,filters,url])); }
  headers(id:string,subscription:Subscription,body:string,time=this.now()) {
    const date=new Date(time), secret=open(subscription.secret,this.config.stateKey);
    let signature=new Webhook(secret).sign(id,date,body);
    if(subscription.oldSecret && (subscription.rotateUntil ?? 0)>time) signature+=' '+new Webhook(open(subscription.oldSecret,this.config.stateKey)).sign(id,date,body);
    return {'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':String(Math.floor(time/1000)),'webhook-signature':signature,'X-MCP-Subscription-Id':subscription.id};
  }
  async subscribe(params: {name:string; arguments:unknown; delivery:{mode:string;url:string;secret:string};ttlMs?:number|null;cursor?:string|null}, grantId?:string) {
    if(!(await this.ownerActive())) throw new SafeError('owner_revoked',403);
    if(params.name!==EVENT_NAME || params.delivery.mode!=='webhook' || params.cursor) throw new SafeError('unsupported_event_or_replay');
    const filters=normalizedFilters(params.arguments), url=callbackUrl(params.delivery.url,this.config.callbackHosts).toString();
    const secret=params.delivery.secret;
    const keyLength=Buffer.from(secret.slice(6),'base64').length;
    if(!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret) || keyLength<24 || keyLength>64 || Buffer.from(secret.slice(6),'base64').toString('base64')!==secret.slice(6)) throw new SafeError('invalid_signing_secret');
    // Finite subscriptions only; honor short requested lifetimes without a refresh loophole.
    const ttl=params.ttlMs ?? 86400_000;
    if(!Number.isFinite(ttl) || ttl<=0) throw new SafeError('invalid_subscription_ttl');
    const id=this.identity(params.name,filters,url), time=this.now();
    const {before,cancellation}=await this.store.atomic(async tx=>({
      before:await tx.get<Subscription>('subscriptions/'+id),
      cancellation:(await tx.get('subscriptionControls/'+id))?.generation ?? 0,
    }));
    const candidate:Subscription={id,owner:this.config.ownerSub,name:params.name,filters,url,secret:seal(secret,this.config.stateKey),expiresAt:time+Math.min(ttl,86400_000),active:true,verifiedAt:time,revision:(before?.revision ?? 0)+1,deleteAfter:new Date(time+8*86400_000)};
    if(grantId)candidate.grantHash=hash(grantId);
    if(before && before.active && before.expiresAt>time && equal(open(before.secret,this.config.stateKey),secret) && before.verifiedAt>time-300_000) candidate.verifiedAt=before.verifiedAt;
    else {
      const challenge=randomBytes(32).toString('base64url'), body=JSON.stringify({type:'verification',challenge});
      let response;
      try { response=await this.send(url,body,this.headers('verify_'+randomUUID(),candidate,body)); }
      catch { throw new SafeError('callback_verification_failed'); }
      let echoed:unknown; try { echoed=JSON.parse(response.body).challenge; } catch {}
      if(response.status<200 || response.status>=300 || typeof echoed!=='string' || !equal(echoed,challenge)) throw new SafeError('callback_challenge_failed');
    }
    if(before && !equal(open(before.secret,this.config.stateKey),secret)) {candidate.oldSecret=before.secret;candidate.rotateUntil=time+300_000;}
    await this.store.atomic(async tx=>{
      if(!this.config.ownerEnabled || (await tx.get('control/owner'))?.enabled===false) throw new SafeError('owner_revoked',403);
      if(candidate.expiresAt<=this.now())throw new SafeError('subscription_ttl_elapsed');
      if(candidate.grantHash && await tx.get('revokedGrants/'+candidate.grantHash))throw new SafeError('grant_revoked',403);
      const current=await tx.get<Subscription>('subscriptions/'+id);
      const generation=(await tx.get('subscriptionControls/'+id))?.generation ?? 0;
      if(generation!==cancellation || (current?.revision ?? 0)!==(before?.revision ?? 0)) throw new SafeError('subscription_changed_retry',409);
      const index=await tx.get<{ids:string[]}>('indexes/subscriptions') ?? {ids:[]};
      const retained:string[]=[];
      for(const sid of index.ids) { const sub=await tx.get<Subscription>('subscriptions/'+sid); if(sub?.active && sub.expiresAt>this.now() && (!sub.grantHash || !await tx.get('revokedGrants/'+sub.grantHash))) retained.push(sid); }
      if(!retained.includes(id)) retained.push(id);
      if(retained.length>8) throw new SafeError('subscription_limit');
      tx.set('subscriptions/'+id,candidate);tx.set('indexes/subscriptions',{ids:retained});
    });
    return {id,refreshBefore:new Date(candidate.expiresAt).toISOString(),cursor:null,truncated:false};
  }
  async unsubscribe(params:{name:string;arguments:unknown;delivery:{mode:string;url:string}}) {
    if(params.name!==EVENT_NAME || params.delivery.mode!=='webhook') throw new SafeError('unsupported_event');
    const id=this.identity(params.name,normalizedFilters(params.arguments),callbackUrl(params.delivery.url,this.config.callbackHosts).toString());
    await this.store.atomic(async tx=>{
      const sub=await tx.get<Subscription>('subscriptions/'+id);
      const generation=(await tx.get('subscriptionControls/'+id))?.generation ?? 0;
      // Keep the generation even when no subscription exists (or TTL later deletes it).
      // A later intentional subscribe snapshots the new generation and may activate.
      tx.set('subscriptionControls/'+id,{generation:generation+1});
      if(sub)tx.set('subscriptions/'+id,{...sub,active:false,revision:sub.revision+1});
    });
    return {};
  }
  async ingest(value:unknown) {
    const time=this.now(),events=normalizeGrafana(value,this.config.sourceId,time);
    return this.store.atomic(async tx=>{
      const enabled=this.config.ownerEnabled && (await tx.get('control/owner'))?.enabled!==false;
      const index=await tx.get<{ids:string[]}>('indexes/subscriptions') ?? {ids:[]};
      const subscriptions:Subscription[]=[];
      for(const id of index.ids) {const sub=await tx.get<Subscription>('subscriptions/'+id);if(enabled && sub?.active && sub.expiresAt>time && (!sub.grantHash || !await tx.get('revokedGrants/'+sub.grantHash)))subscriptions.push(sub);}
      let created=0;
      for(const event of events) {
        if(await tx.get('events/'+event.id)) continue;
        tx.set('events/'+event.id,event);created++;
        for(const sub of subscriptions) if(matches(sub.filters,event.data)) {
          const id=hash(event.id+':'+sub.id);
          const delivery:Delivery={id,eventId:event.id,subscriptionId:sub.id,state:'pending',nextAt:time,leaseUntil:0,leaseToken:'',attempt:0,createdAt:time,deleteAfter:new Date(time+31*86400_000)};
          tx.set('deliveries/'+id,delivery);
        }
      }
      return {accepted:events.length,created};
    });
  }
  async dispatch(limit=20) {
    const time=this.now();
    const rows=await this.store.query<Delivery>('deliveries',[['state','==','pending'],['nextAt','<=',time]],limit,'nextAt');
    let attempted=0;
    // Batch is bounded; each network request has a separate ten-second absolute timeout.
    for(const row of rows) {
      const claim=await this.store.atomic(async tx=>{
        const delivery=await tx.get<Delivery>('deliveries/'+row.id);
        if(!delivery || delivery.state!=='pending' || delivery.nextAt>this.now() || delivery.leaseUntil>this.now())return;
        const sub=await tx.get<Subscription>('subscriptions/'+delivery.subscriptionId);
        const active=this.config.ownerEnabled && (await tx.get('control/owner'))?.enabled!==false;
        if(!active || !sub?.active || sub.expiresAt<=this.now() || (sub.grantHash && await tx.get('revokedGrants/'+sub.grantHash))) {tx.set('deliveries/'+row.id,{...delivery,state:'cancelled',reason:'subscription_inactive'});return;}
        if(delivery.attempt>=12 || delivery.createdAt<this.now()-86400_000) {tx.set('deliveries/'+row.id,{...delivery,state:'failed',reason:'retry_exhausted'});return;}
        const event=await tx.get<EventRecord>('events/'+delivery.eventId);
        if(!event) {tx.set('deliveries/'+row.id,{...delivery,state:'failed',reason:'event_missing'});return;}
        const token=randomUUID();
        tx.set('deliveries/'+row.id,{...delivery,attempt:delivery.attempt+1,leaseUntil:this.now()+30_000,leaseToken:token});
        return {delivery:{...delivery,attempt:delivery.attempt+1},sub,event,token};
      });
      if(!claim)continue;
      attempted++;
      let status=0,reason='callback_transient';
      // A refresh/unsubscribe between claim and send invalidates this claim. In-flight HTTPS
      // cannot be recalled; the documented revocation boundary is the last pre-send check.
      const latest=await this.store.get<Subscription>('subscriptions/'+claim.sub.id);
      if(!(await this.ownerActive()) || !latest?.active || latest.expiresAt<=this.now() || latest.revision!==claim.sub.revision || (latest.grantHash && await this.store.get('revokedGrants/'+latest.grantHash)))reason='subscription_changed';
      else try {status=(await this.send(claim.sub.url,claim.event.body,this.headers(claim.event.id,claim.sub,claim.event.body))).status;} catch {}
      await this.store.atomic(async tx=>{
        const current=await tx.get<Delivery>('deliveries/'+row.id);
        if(!current || current.leaseToken!==claim.token)return;
        const changed=reason==='subscription_changed';
        const state=status>=200 && status<300 ? 'delivered' : changed ? 'pending' : current.attempt>=12 || status===410 || status===413 || (status>=400 && status<500 && status!==408 && status!==429) ? 'failed' : 'pending';
        const delay=Math.min(3600_000,60_000*2**(current.attempt-1))*(0.75+0.5*this.jitter());
        tx.set('deliveries/'+row.id,{...current,state,nextAt:this.now()+(changed?0:delay),leaseUntil:0,leaseToken:'',reason:status?'http_'+status:reason});
        if(status===410) {const sub=await tx.get<Subscription>('subscriptions/'+current.subscriptionId);if(sub?.revision===claim.sub.revision)tx.set('subscriptions/'+sub.id,{...sub,active:false,revision:sub.revision+1});}
      });
    }
    return {attempted};
  }
}
