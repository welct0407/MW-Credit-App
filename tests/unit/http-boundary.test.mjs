import test from 'node:test';
import assert from 'node:assert/strict';
import {beginRequest,PREFLIGHT_MAX_AGE_SECONDS} from '../../services/lib/http-boundary.mjs';

// R078: a granted preflight is cached by the browser; a denied one never carries a cache lifetime.
const origin='https://lm.mw-credit.com',options={origins:[origin],methods:['GET','POST'],headers:['Authorization','Content-Type']};
const response=()=>{const headers={};return {headers,setHeader:(key,value)=>{headers[key.toLowerCase()]=value}}};
test('a granted preflight carries Access-Control-Max-Age; a denied one does not',()=>{
 assert.ok(PREFLIGHT_MAX_AGE_SECONDS>=600&&PREFLIGHT_MAX_AGE_SECONDS<=7200);
 const granted=response();
 assert.equal(beginRequest({headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'}},granted,options).preflight(),true);
 assert.equal(granted.headers['access-control-max-age'],String(PREFLIGHT_MAX_AGE_SECONDS));assert.equal(granted.headers['access-control-allow-origin'],origin);assert.equal(granted.headers.vary,'Origin');
 for(const headers of [{origin:'https://other.invalid','access-control-request-method':'POST'},{origin,'access-control-request-method':'DELETE'},{origin,'access-control-request-method':'POST','access-control-request-headers':'x-other'}]){
  const denied=response();assert.equal(beginRequest({headers},denied,options).preflight(),false);assert.equal(denied.headers['access-control-max-age'],undefined);
 }
});
