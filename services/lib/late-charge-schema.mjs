// R118 (V132): whether the database has the late-charge columns. The services also run against older schemas (the
// payment, phase 5 and phase 8 rehearsals migrate to fixed historical versions, and an image can briefly run ahead of its
// migration), so a read names the late columns only when they exist and reads 0 otherwise. One catalog read, no table
// privilege needed (pg_attribute is readable by every role), so the reader role can ask too.
export const LATE_CHARGE_SCHEMA_SQL=`SELECT count(*)=5 AS present FROM pg_catalog.pg_attribute
 WHERE attnum>0 AND NOT attisdropped AND ((attrelid=to_regclass('public."Charges"') AND attname IN ('Late Charge Due','Late Charge Paid','Late Charge Remaining'))
  OR (attrelid=to_regclass('public."Payment Allocations"') AND attname='Allocated Late Charge') OR (attrelid=to_regclass('public."Repayments"') AND attname='Late Charge Paid'))`;
/** true when V132's columns exist; a client that cannot answer (a scripted test client) reads as an older schema. */
export async function lateChargeSchema(client){
 try{return (await client.query(LATE_CHARGE_SCHEMA_SQL))?.rows?.[0]?.present===true;}catch{return false;}
}
/** The SQL expression when the late columns exist, else the literal 0 (same numeric meaning as before V132). */
export const lateSql=(present,expression,fallback='0::numeric')=>present?expression:fallback;
