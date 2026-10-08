import { loadDevReadConfig } from '../api/dev-read-config.mjs';
import { COMMAND_DB_USER } from './dev-target.mjs';
import { DEV_RECEIPT_MAPPING } from '../receipts/dev-receipt-adapter.mjs';
const id = value => typeof value==='string' && Buffer.byteLength(value)>0 && Buffer.byteLength(value)<=256 && value===value.trim() && !/[\u0000\r\n]/.test(value);
export function loadDevCommandConfig(env) {
  if (env.DB_USER!==COMMAND_DB_USER || env.OWNER_IDENTITY_MODE!=='uid-pinned' || env.COMMAND_MODE!=='synthetic-only'
    || ['DATABASE_URL','PGHOST','PGHOSTADDR','PGDATABASE','PGPORT','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','STORAGE_EMULATOR_HOST'].some(key=>env[key]!==undefined)) throw Error('Invalid DEV command configuration');
  const shared=loadDevReadConfig({...env,DB_USER:'mw-credit-app-read-dev@clever-oasis-508610-n7.iam'});
  let fixture;
  try { fixture=JSON.parse(env.COMMAND_FIXTURE_JSON); } catch { throw Error('Explicit synthetic fixture required'); }
  if (!fixture || Object.keys(fixture).sort().join(',')!=='borrowerId,cashAccountIds,chargeIds' || !id(fixture.borrowerId)
    || !Array.isArray(fixture.chargeIds) || !fixture.chargeIds.length || fixture.chargeIds.length>100
    || fixture.chargeIds.some(value=>!id(value)||/[\s,]/u.test(value)) || new Set(fixture.chargeIds).size!==fixture.chargeIds.length
    || !Array.isArray(fixture.cashAccountIds) || !fixture.cashAccountIds.length || fixture.cashAccountIds.length>100
    || fixture.cashAccountIds.some(value=>!id(value)) || new Set(fixture.cashAccountIds).size!==fixture.cashAccountIds.length) throw Error('Invalid synthetic fixture');
  if (env.RECEIPT_BUCKET!==DEV_RECEIPT_MAPPING.bucket || env.RECEIPT_SQL_PREFIX!==DEV_RECEIPT_MAPPING.sqlPrefix
    || env.RECEIPT_OBJECT_PREFIX!==DEV_RECEIPT_MAPPING.objectPrefix || !env.RECEIPT_COMPATIBILITY_EVIDENCE?.trim()) throw Error('Verified receipt mapping required');
  return Object.freeze({...shared,dbUser:COMMAND_DB_USER,mode:'synthetic-only',registeredCreators:Object.freeze(['postgres']),
    fixture:Object.freeze({borrowerId:fixture.borrowerId,chargeIds:Object.freeze([...fixture.chargeIds]),cashAccountIds:Object.freeze([...fixture.cashAccountIds])}),
    receiptCompatibility:Object.freeze({...DEV_RECEIPT_MAPPING,status:'verified-appsheet-render',evidenceReference:env.RECEIPT_COMPATIBILITY_EVIDENCE})});
}
