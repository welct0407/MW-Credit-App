export async function readPreferences(client,actor){
 const item=(await client.query(`SELECT p."Row ID" id,p."Language Preference" language,c."Ref Cash Account" AS "statementAccountId",c."Statement Date"::text AS "statementDate",public.pwa_preference_version_v2(p."Row ID") version FROM public."Partners" p LEFT JOIN public."Cash Statement Context" c ON c."Ref Partner"=p."Row ID" WHERE p."Row ID"=$1`,[actor.partnerId])).rows[0];
 if(!item)throw Error('Current partner unavailable');
 const accounts=(await client.query(`SELECT a."Row ID" id,a."Account Label" label,h."Holder Name" AS "holderLabel" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;
 const dates=(await client.query(`SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-i)::text AS day FROM generate_series(0,14) i ORDER BY i`)).rows.map(row=>row.day);
 return {item,accounts,dates};
}
