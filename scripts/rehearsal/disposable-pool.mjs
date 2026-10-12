import pg from 'pg';
import { assertDisposable } from './payment-command.mjs';
export async function disposablePool(expectedVersion=77) {
 const port=Number(process.env.PAYMENT_REHEARSAL_PORT), directory=process.env.PAYMENT_REHEARSAL_DIRECTORY;
 if(process.env.PAYMENT_REHEARSAL_DISPOSABLE!=='1'||!Number.isInteger(port)||port<1024||port>65535||!directory||!/[\\/]mw-payment-rehearsal-[a-f0-9]{32}[\\/]data$/i.test(directory))throw Error('Runner-owned fixture required');
 const pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',database:'payment_rehearsal',password:'',max:6,connectionTimeoutMillis:3000});
 try{await assertDisposable(pool,directory,expectedVersion);return pool}catch(error){await pool.end();throw error}
}
