import {createHash} from 'node:crypto';
import {compileAgentFilter} from './query-filter.mjs';
import {resolveConversationActor} from './policy.mjs';
import {relationshipDescriptor} from './relationships.mjs';
import {resolveNativeDefaults} from './defaults.mjs';
import {readNativeCommandMetadata} from './command-metadata.mjs';
import {statementTimeoutSql, lockTimeoutSql} from '../lib/budget.mjs';
// Runs on the command service pool (query timeout 9 s): command statement budget (APP-PAY-03).

const quote = name => '"' + name.replaceAll('"', '""') + '"';
const fail = () => { throw Error('unsupported_native_capability'); };

/** Definitions are maintained source, never caller-supplied SQL or schema exports. */
export function createConversationReadProvider({pool, guardConnection, policy, catalogue, resources}) {
  const manifestSha256 = createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
  async function read(context, input, operation) {
    let client, quarantine = false;
    try {
      if (context.signal?.aborted) throw Error('request_aborted');
      client = await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query(statementTimeoutSql('command'));
      await client.query(lockTimeoutSql);
      await guardConnection(client);
      const actor = await resolveConversationActor(client, policy, context.workload, input.actorPartnerId);
      if (context.signal?.aborted) throw Error('request_aborted');
      const result = await operation(client, actor);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client?.query('ROLLBACK'); } catch { quarantine = true; }
      throw error;
    } finally {
      client?.release(quarantine);
    }
  }
  function resource(scope, name) {
    if (!Object.hasOwn(resources, scope) || !Object.hasOwn(resources[scope], name)) fail();
    return resources[scope][name];
  }
  return {
    manifestSha256,
    catalogue(context, input) {
      return read(context, input, async (client,actor) => {
        if (!['oltp', 'olap'].includes(input.scope)) fail();
        const definitions = catalogue.resources.filter(item => item.scope === input.scope
          && (input.resource === null || item.resource === input.resource));
        if (!definitions.length) fail();
        const clock=(await client.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate",to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`)).rows[0];
        // A fixed aggregate preserves MAX semantics beyond one query page. The
        // relation comes only from the maintained catalogue, never caller input.
        let latestStatement;
        const resolvers={'latest-statement-date':()=>{
          const binding=resource('oltp','Cash Account Daily Summary Recent');
          if(typeof binding.relation!=='string'||!binding.relation)fail();
          latestStatement??=client.query(`SELECT max("Statement Date")::text AS value FROM public.${quote(binding.relation)}`)
            .then(result=>result.rows[0]?.value);
          return latestStatement;
        }};
        const defaults=Object.fromEntries(await Promise.all(definitions.map(async resource=>[
          resource.resource,await resolveNativeDefaults(resource,{...clock,actor,resolvers}),
        ])));
        return {version: 1, manifestSha256, scope: input.scope, resources: definitions,defaults,context:{...clock,actorLoginEmail:actor.loginEmail}};
      });
    },
    query(context, input) {
      const definition = resource(input.scope, input.resource);
      if (!Array.isArray(input.columns) || !input.columns.length || input.columns.length > 256
        || new Set(input.columns).size !== input.columns.length
        || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1001) fail();
      const relationshipNames=input.columns.filter(name=>Object.hasOwn(definition.relationships??{},name));
      const selected = input.columns.filter(name=>!relationshipNames.includes(name)).map(name => {
        if (!Object.hasOwn(definition.fields, name)) fail();
        const field = definition.fields[name];
        if (!field.column || !['text', 'numeric', 'boolean', 'date', 'timestamp'].includes(field.type)) fail();
        // Decimal/money values retain exact SQL text; booleans retain their type.
        const cast = field.type === 'boolean' ? '' : field.type === 'numeric' ? '::numeric::text' : '::text';
        return `t.${quote(field.column)}${cast} AS ${quote(name)}`;
      });
      if(relationshipNames.length)selected.push(`to_jsonb(t)${input.resource==='Payments'?`||jsonb_build_object('_targetChargeLoan',(SELECT c."Ref Loans" FROM public."Charges" c WHERE c."Row ID"=t."Ref Target Charge"))`:''} AS "_relationshipSource"`);
      if(definition.versionFunction)selected.push(`public.${quote(definition.versionFunction)}(t.${quote(definition.key)}) AS "_nativeVersion"`);
      else if(definition.versionRelation)selected.push(`(SELECT encode(sha256(convert_to(to_jsonb(v)::text,'UTF8')),'hex') FROM public.${quote(definition.versionRelation)} v WHERE v."Row ID"=t.${quote(definition.key)}) AS "_nativeVersion"`);
      const predicate = compileAgentFilter(input.predicate, definition.fields);
      return read(context, input, async (client, actor) => {
        const params = [...predicate.params];
        let sourceSql=definition.sourceSql;
        if(sourceSql?.includes('$ACTOR')){
          params.push(actor.partnerId);
          sourceSql=sourceSql.replaceAll('$ACTOR',`$${params.length}::text`);
        }
        let actorScope = 'TRUE';
        if (definition.actorColumn) {
          params.push(actor.partnerId);
          actorScope = `t.${quote(definition.actorColumn)}=$${params.length}::text`;
        }
        params.push(input.limit);
        const from=sourceSql?`(${sourceSql})`:`public.${quote(definition.relation)}`;
        const sql = `SELECT ${selected.join(',')} FROM ${from} t`
          + ` WHERE (${actorScope}) AND (${predicate.sql}) ORDER BY t.${quote(definition.key)}::text COLLATE "C"`
          + ` LIMIT $${params.length}`;
        const {rows} = await client.query(sql, params);
        if(rows.length===1 && input.predicate?.op==='eq' && input.predicate.field===definition.key
          && typeof input.predicate.value==='string'){
          const metadata=await readNativeCommandMetadata(client,input.resource,input.predicate.value,actor);
          if(metadata)rows[0]._nativeCommand=metadata;
        }
        if (context.signal?.aborted) throw Error('request_aborted');
        if(relationshipNames.length)for(const row of rows){
          const source=row._relationshipSource;delete row._relationshipSource;
          for(const name of relationshipNames){
            const relation=definition.relationships[name];
            row[name]=relation.provider==='fixed-native'?relationshipDescriptor(input.scope,input.resource,name,source)
              :{scope:input.scope,resource:relation.resource,predicate:{op:'eq',field:relation.field,value:source[relation.parentKey]},limit:1001};
            if(!row[name])fail();
          }
        }
        return {version: 1, manifestSha256, scope: input.scope, resource: input.resource, rows};
      });
    },
  };
}
