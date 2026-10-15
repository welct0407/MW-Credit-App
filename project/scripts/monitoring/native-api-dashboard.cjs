/* Apply only to a fresh authenticated export after Terraform adoption. */
const fs=require('node:fs');
function patch(input){
 const d=structuredClone(input),v2=!!d.spec?.elements;
 if((v2?d.metadata?.name:d.uid)!=='mw-resource-performance')throw Error('Unexpected dashboard identity');
 for(const [id,scope,title]of [[56,'oltp','Native operational API'],[57,'olap','Native analytical API']]){
  const panel=v2?d.spec.elements['panel-'+id]?.spec:d.panels.find(p=>p.id===id);
  if(!panel)throw Error('Missing existing native probe panel');
  const queries=v2?panel.data?.spec?.queries?.map(q=>({body:q.spec?.query?.spec,uid:q.spec?.query?.datasource?.name})):panel.targets?.map(q=>({body:q,uid:q.datasource?.uid}));
  if(!queries?.length||!queries.every(q=>q.uid==='mw-gcp-monitoring'))throw Error('Unreviewed probe datasource');
  for(const {body} of queries){const url=new URL(body.url);const filter=url.searchParams.get('filter');if(url.origin!=='https://monitoring.googleapis.com'||!filter?.includes('custom.googleapis.com/mw_resource_monitoring/health')||!filter.includes('metric.labels.component = "'+scope+'"'))throw Error('Unreviewed probe component');}
  panel.title=title;
  panel.description='Native machine API catalogue and bounded Partners key-only read, '+scope.toUpperCase()+' logical scope. Exact PROD environment, origin, audience and pinned manifest required. No AppSheet fallback or business writes. Explicitly disabled: Paused; missing configuration or stale/missing report: Unknown; authentication, binding or malformed proof failure: Down. Existing '+scope+' metric and alert identity retained.';
 }
 return d;
}
module.exports={patch};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Input and output paths required');fs.writeFileSync(output,JSON.stringify(patch(JSON.parse(fs.readFileSync(input,'utf8'))),null,2)+'\n');}
