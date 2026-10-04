import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from '../dist/config.js';
import {config} from './helpers.mjs';

test('configuration binds canonical OAuth/resource URLs and reads only mounted secret files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'synthetic-bridge-')),c=config();
  const env={PUBLIC_BASE_URL:c.baseUrl,GCP_PROJECT:c.projectId,FIRESTORE_DATABASE:c.databaseId,OWNER_GOOGLE_SUB:c.ownerSub,OWNER_EMAIL:c.ownerEmail,GOOGLE_CLIENT_ID:c.googleClientId,SCHEDULER_EMAIL:c.schedulerEmail,CALLBACK_HOSTS:c.callbackHosts.join(','),GRAFANA_SOURCE_ID:c.sourceId};
  const secrets={STATE_KEY:c.stateKey.toString('base64'),COOKIE_KEYS:JSON.stringify(c.cookieKeys),OAUTH_JWKS:JSON.stringify(c.jwks),GRAFANA_SECRETS:JSON.stringify(c.grafanaSecrets),GOOGLE_CLIENT_SECRET:c.googleClientSecret};
  try {
    for(const [name,value] of Object.entries(secrets)){const path=join(dir,name);writeFileSync(path,value,{mode:0o600});env[name+'_FILE']=path;}
    const actual=loadConfig(env);assert.equal(actual.issuer,c.issuer);assert.equal(actual.resource,c.resource);assert.deepEqual(actual.stateKey,c.stateKey);assert.equal(actual.clientId,'https://chatgpt.com/oauth/client.json');assert.equal(actual.clientMetadataDocument,true);
    for(const value of [undefined,'','   '])assert.deepEqual(loadConfig({...env,CALLBACK_HOSTS:value}).callbackHosts,[]);
    assert.equal(actual.captureRejectedCallbackHost,false);
    assert.equal(loadConfig({...env,CAPTURE_REJECTED_CALLBACK_HOST:'true'}).captureRejectedCallbackHost,true);
    assert.equal(loadConfig({...env,CAPTURE_REJECTED_CALLBACK_HOST:'false'}).captureRejectedCallbackHost,false);
    assert.throws(()=>loadConfig({...env,CAPTURE_REJECTED_CALLBACK_HOST:'sentinel-secret'}),/invalid_callback_capture_flag/);
    for(const overrides of [{PUBLIC_BASE_URL:'http://bridge.example'},{PUBLIC_BASE_URL:c.baseUrl+'/other'},{OAUTH_ISSUER:'https://old.example/oauth'},{MCP_RESOURCE:'https://old.example/mcp'},{CHATGPT_REDIRECT_URI:'https://attacker.example/callback'},{CHATGPT_REDIRECT_URI:c.redirectUri+'?next=evil'},{CHATGPT_CLIENT_ID:'arbitrary'},{CALLBACK_HOSTS:'*.example'},{CALLBACK_HOSTS:'callbacks.example,'},{STATE_KEY_FILE:undefined,STATE_KEY:secrets.STATE_KEY}])assert.throws(()=>loadConfig({...env,...overrides}));
    writeFileSync(env.STATE_KEY_FILE,secrets.STATE_KEY+'!');assert.throws(()=>loadConfig(env),/invalid_state_key/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
