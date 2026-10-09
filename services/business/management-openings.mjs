import {validBorrowerId} from './borrowers.mjs';
export async function readManagementOpenings(client,{id,limit=25,cursor=null}={}){
 if(!validBorrowerId(id)||cursor!==null||limit!==25)throw Error('invalid_request');
 const row=(await client.query(`WITH basis AS (SELECT public.pwa_cash_opening_basis_v2($1) value) SELECT value,encode(sha256(convert_to(value::text,'UTF8')),'hex') hash FROM basis`,[id])).rows[0];
 return {item:row?.value?{...row.value,id,version:row.value.sourceVersion,reviewedBasisHash:row.hash}:null};
}
