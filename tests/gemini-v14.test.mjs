import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/mechanical-advisor.mjs';
const url='https://kinetika.test/.netlify/functions/mechanical-advisor';
const question=()=>new Request(url,{method:'POST',headers:{'content-type':'application/json','x-kinetika-access':'private'},body:JSON.stringify({question:'Quero expandir quatro braços na forma de cruz'})});
const plan={title:'Cruz',explanation:'Pinhão e quatro cremalheiras',steps:['Montar o pinhão'],warnings:['Verifique planos distintos'],template:'cross_racks'};
async function scoped(vars,fn){
 const keys=['GEMINI_API_KEY','OPENAI_API_KEY','KINETIKA_ASSISTANT_ACCESS_CODE','KINETIKA_AI_PROVIDER','GEMINI_MODEL'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 for(const k of keys)delete process.env[k];
 Object.assign(process.env,vars);
 try{await fn()}finally{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}globalThis.fetch=originalFetch}
}
test('sem projeto com chave e código: modo local sem custo',()=>scoped({},async()=>{const r=await handler(new Request(url));assert.deepEqual(await r.json(),{available:false,provider:null,mode:'local'})}));
test('Gemini é preferido mesmo com OpenAI presente',()=>scoped({GEMINI_API_KEY:'google-secret',OPENAI_API_KEY:'paid-key',KINETIKA_ASSISTANT_ACCESS_CODE:'private'},async()=>{
 const calls=[];globalThis.fetch=async(u,opt)=>{calls.push({u,opt});return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200})};
 let r=await handler(new Request(url));assert.deepEqual(await r.json(),{available:true,provider:'gemini',mode:'online'});
 r=await handler(question());assert.equal(r.status,200);const d=await r.json();assert.equal(d.provider,'gemini');assert.equal(d.plan.template,'cross_racks');
 assert.equal(calls.length,1);assert.match(calls[0].u,/generativelanguage.googleapis.com/);assert.equal(calls[0].opt.headers['x-goog-api-key'],'google-secret');
 assert.ok(!JSON.stringify(d).includes('google-secret'));
 const config=JSON.parse(calls[0].opt.body).generationConfig;assert.equal(config.responseMimeType,'application/json');
}));
test('limite 429 do Gemini não transfere cobrança à OpenAI',()=>scoped({GEMINI_API_KEY:'g',OPENAI_API_KEY:'o',KINETIKA_ASSISTANT_ACCESS_CODE:'private'},async()=>{
 const urls=[];globalThis.fetch=async u=>{urls.push(u);return new Response('',{status:429})};
 const r=await handler(question());assert.equal(r.status,429);assert.equal(urls.length,1);assert.match(urls[0],/googleapis/);
}));
test('senha incorreta bloqueia qualquer chamada externa',()=>scoped({GEMINI_API_KEY:'g',KINETIKA_ASSISTANT_ACCESS_CODE:'private'},async()=>{
 globalThis.fetch=()=>{throw Error('não deve chamar')};
 const req=new Request(url,{method:'POST',headers:{'content-type':'application/json','x-kinetika-access':'wrong'},body:JSON.stringify({question:'Expandir quatro braços'})});
 assert.equal((await handler(req)).status,401);
}));
