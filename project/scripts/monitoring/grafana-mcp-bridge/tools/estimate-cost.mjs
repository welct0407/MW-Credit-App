import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function estimate(w,allowancesAvailable) {
  for(const [key,value] of Object.entries(w))if(typeof value==='number' && (!Number.isFinite(value) || value<0))throw new Error('Invalid workload input: '+key);
  for(const value of Object.values(w.rates))if(!Number.isFinite(value) || value<0)throw new Error('Invalid rate input');
  if(w.subscriptions>8 || w.memoryGiB<=0 || w.days<=0 || w.days>31)throw new Error('Workload exceeds modeled configuration');
  const ticks=w.days*1440,deliveries=w.transitions*w.subscriptions,attempts=Math.ceil(deliveries*(1+w.retryFraction));
  const requests=ticks+w.transitions+w.extraHttpRequests;
  const round=value=>Math.ceil(value*10)/10;
  // One vCPU, sequential callbacks. Empty ticks and extra HTTP requests are rounded to 100 ms.
  const cpuSeconds=ticks*round(w.dispatchSeconds)+w.transitions*round(w.ingressSeconds)+attempts*round(w.callbackSeconds)+w.extraHttpRequests*round(w.extraHttpSeconds)+w.coldStarts*round(w.coldStartSeconds);
  const memorySeconds=cpuSeconds*w.memoryGiB;
  // One alert per ingress; owner/index + subscription/grant pairs + event lookup.
  // Normal send: query row + five claim reads + three pre-send reads + final lease read.
  // Extra reads cover OAuth/admin activity and transaction retry allowance; 410s may add reads.
  const reads=ticks+w.transitions*(2*w.subscriptions+3)+attempts*10+w.extraFirestoreReads;
  const writes=w.transitions+deliveries+attempts*2+w.extraFirestoreWrites;
  const secretReads=w.coldStarts*w.secretReadsPerColdStart;
  const egressGiB=attempts*w.payloadKiB/1024/1024;
  const free=allowancesAvailable;
  const net=(quantity,allowance)=>Math.max(0,quantity-(free?allowance:0));
  // Default-database quotas reset daily; this sample workload is spread uniformly.
  // Named databases always pay usage and TTL deletes are billed even with free quota.
  const eligible=!w.namedDatabase;
  const itemized={
    cloud_run_cpu:net(cpuSeconds,180000)*w.rates.cpuSecond,
    cloud_run_memory:net(memorySeconds,360000)*w.rates.memoryGiBSecond,
    cloud_run_requests:net(requests,2000000)/1000000*w.rates.millionRequests,
    scheduler:net(1,3)*w.rates.schedulerJobMonth,
    firestore_reads:net(reads,eligible?50000*w.days:0)/100000*w.rates.hundredThousandReads,
    firestore_writes:net(writes,eligible?20000*w.days:0)/100000*w.rates.hundredThousandWrites,
    firestore_ttl_deletes:w.ttlDeletes/100000*w.rates.hundredThousandDeletes,
    firestore_storage:net(w.storedFirestoreGiB,eligible?1:0)*w.rates.firestoreGiBMonth,
    secret_versions:net(w.activeSecretVersions,6)*w.rates.secretVersionMonth,
    secret_access:net(secretReads,10000)/10000*w.rates.tenThousandSecretReads,
    cloud_build:net(w.buildMinutes,2500)*w.rates.buildMinute,
    artifact_registry:net(w.retainedImageGiB,0.5)*w.rates.registryGiBMonth,
    cloud_logging:net(w.logGiB,50)*w.rates.loggingGiB,
    internet_egress:egressGiB*w.rates.internetGiB,
  };
  return {scenario:free?'specified allowances unconsumed':'specified allowances exhausted',region:w.region,rateRegion:w.rateRegion,
    quantities:{ticks,deliveries,attempts,requests,cpuSeconds,memoryGiBSeconds:memorySeconds,firestoreReads:reads,firestoreWrites:writes,secretReads,egressGiB},
    itemizedUsd:Object.fromEntries(Object.entries(itemized).map(([k,v])=>[k,Number(v.toFixed(6))])),totalUsd:Number(Object.values(itemized).reduce((a,b)=>a+b,0).toFixed(6)),
    caveats:[w.rateNote,'Allowances are scenarios, not a live balance. Cloud Run discount uses Tier 1 prices; verify chosen regional rates. Default Firestore quota assumes uniform daily workload and eligibility. Build allowance is promotional and machine/pool-specific. Cold starts and mounted-secret reads are estimates. No load balancer, domain, paid dashboard plan, backups/PITR, or ChatGPT/Dots usage charges included. US$1–5 is contingency budgeting, not an expected bill, minimum or ceiling.']};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const path=process.argv[2] ?? new URL('./cost-assumptions.json',import.meta.url);
  const workload=JSON.parse(readFileSync(path,'utf8'));
  process.stdout.write(JSON.stringify({assumptions:workload,scenarios:[estimate(workload,true),estimate(workload,false)]},null,2)+'\n');
}
