import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/mechanical-advisor.mjs';
const url='https://example.netlify.app/.netlify/functions/mechanical-advisor';
const keys=['GEMINI_API_KEY','OPENAI_API_KEY','KINETIKA_AI_PROVIDER','KINETIKA_ASSISTANT_ACCESS_CODE'];
async function inEnv(vars,fn){
 const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{for(const k of keys)delete process.env[k];Object.assign(process.env,vars);await fn();}
 finally{for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}}
}
test('chave Gemini configurada sem código gera diagnóstico específico',()=>inEnv({GEMINI_API_KEY:'private-test-key'},async()=>{
 const res=await handler(new Request(url));const body=await res.json();
 assert.equal(body.available,false);assert.equal(body.provider,'gemini');assert.equal(body.diagnostic,'missing_access_code');
 assert.ok(!JSON.stringify(body).includes('private-test-key'));
}));
test('sem chave Gemini no escopo Functions aponta chave ausente',()=>inEnv({KINETIKA_ASSISTANT_ACCESS_CODE:'demo'},async()=>{
 const res=await handler(new Request(url));const body=await res.json();
 assert.equal(body.diagnostic,'missing_provider_key');assert.equal(body.available,false);
}));
test('chave e código tornam serviço disponível, sem consultar API no GET',()=>inEnv({GEMINI_API_KEY:'test',KINETIKA_ASSISTANT_ACCESS_CODE:'demo'},async()=>{
 const res=await handler(new Request(url));const body=await res.json();
 assert.equal(body.available,true);assert.equal(body.diagnostic,'ready');assert.equal(body.provider,'gemini');
}));
test('POST retorna motivo específico se o código não estiver definido',()=>inEnv({GEMINI_API_KEY:'test'},async()=>{
 const res=await handler(new Request(url,{method:'POST'}));
 assert.equal(res.status,503);const body=await res.json();assert.equal(body.diagnostic,'missing_access_code');
}));
