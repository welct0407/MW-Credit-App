import http from "node:http";
import { randomUUID } from "node:crypto";
import { Connector, AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import pg from "pg";
import { Storage } from "@google-cloud/storage";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { assertEnvironment } from "./guards.mjs";
const config={environment:process.env.APP_ENV,database:process.env.DB_NAME,prefix:process.env.STORAGE_PREFIX,instance:process.env.INSTANCE_CONNECTION_NAME,bucket:process.env.RECEIPT_BUCKET};
assertEnvironment(config);
const connector=new Connector(); let pool; let cached; let checkedAt=0;
async function ready(){
  assertEnvironment(config);
  if(cached && Date.now()-checkedAt<30000)return cached;
  if(!pool){const options=await connector.getOptions({instanceConnectionName:config.instance,ipType:IpAddressTypes.PUBLIC,authType:AuthTypes.IAM});pool=new pg.Pool({...options,user:process.env.DB_USER,database:config.database,max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});}
  const db=await pool.query("SELECT current_database() AS database, current_user AS principal, 1 AS connected");
  if(db.rows[0].database!==config.database||db.rows[0].principal!==process.env.DB_USER)throw new Error("Database identity mismatch");
  const sm=new SecretManagerServiceClient(); const [secret]=await sm.accessSecretVersion({name:process.env.READINESS_SECRET});
  const key=JSON.parse(secret.payload.data.toString()); if(!key.privateKey||!key.publicKey)throw new Error("Secret is not initialized");
  const storage=new Storage(); const file=storage.bucket(config.bucket).file(config.prefix+"health/"+randomUUID()+".txt");
  try {await file.save("synthetic readiness probe",{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:"text/plain"}});const [data]=await file.download();if(data.toString()!=="synthetic readiness probe")throw new Error("Storage readback failed");} finally {await file.delete({ignoreNotFound:true});}
  cached={status:"ready",environment:config.environment,database:"connected",storage:"verified",secrets:"verified"};checkedAt=Date.now();return cached;
}
const server=http.createServer(async(req,res)=>{res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");if(req.url==="/healthz"){res.end(JSON.stringify({status:"ok",environment:process.env.APP_ENV||"local"}));return;}if(req.url==="/readyz"){try{res.end(JSON.stringify(await ready()));}catch(error){console.error(JSON.stringify({event:"readiness_failed",type:error.name,code:error.code||"readiness_error"}));res.statusCode=503;res.end(JSON.stringify({status:"not_ready"}));}return;}res.statusCode=404;res.end(JSON.stringify({error:"not_found"}));});
server.listen(Number(process.env.PORT||8080),"0.0.0.0");
process.on("SIGTERM",()=>server.close(async()=>{if(pool)await pool.end();connector.close();process.exit(0);}));
