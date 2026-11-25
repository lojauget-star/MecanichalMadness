import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/mechanical-advisor.mjs';
import {referenceWallTable} from '../src/functional-design.js';
const endpoint='https://example.netlify.app/.netlify/functions/mechanical-advisor';
async function withEnv(fn){
 const keys=['GEMINI_API_KEY','OPENAI_API_KEY','KINETIKA_ASSISTANT_ACCESS_CODE','GEMINI_MODEL','KINETIKA_AI_PROVIDER'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 for(const key of keys)delete process.env[key];
 process.env.GEMINI_API_KEY='mock-gemini-key';process.env.KINETIKA_ASSISTANT_ACCESS_CODE='mock-access';
 try{await fn()}finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}globalThis.fetch=originalFetch;}
}
const req=question=>new Request(endpoint,{method:'POST',headers:{'content-type':'application/json','x-kinetika-access':'mock-access'},body:JSON.stringify({question,project:{nodes:2,bars:1}})});
const plan=referenceWallTable(); // Resposta simulada deve cumprir o requisito funcional solicitado.
test('descrição acima de 700 caracteres chega integralmente ao Gemini',()=>withEnv(async()=>{
 let payload=null;
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200})};
 const question='Mesa retrátil na parede. '+('Apoios, curso e limitações geométricas detalhadas. '.repeat(46))+'POSIÇÃO FINAL HORIZONTAL';
 assert.ok(question.length>2000&&question.length<4000);
 const response=await handler(req(question));const data=await response.json();
 assert.equal(response.status,200,JSON.stringify(data));
 assert.ok(payload.contents[0].parts[0].text.includes(question));
 assert.ok(payload.contents[0].parts[0].text.endsWith(question)===false); // inclui o resumo da montagem em seguida
 assert.ok(payload.contents[0].parts[0].text.includes('POSIÇÃO FINAL HORIZONTAL'));
}));
test('4.000 caracteres aceitos, inclusive acentos, sem cortes',()=>withEnv(async()=>{
 let input='';globalThis.fetch=async(_url,options)=>{input=JSON.parse(options.body).contents[0].parts[0].text;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200})};
 const question='á'.repeat(3984)+' FIM DO OBJETIVO';
 assert.equal(question.length,4000);
 const response=await handler(req(question));
 assert.equal(response.status,200);assert.ok(input.includes(question));
}));
test('excesso de 4.000 caracteres retorna erro, não chama Gemini',()=>withEnv(async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;throw Error('fetch should not run')};
 const response=await handler(req('a'.repeat(4001))),data=await response.json();
 assert.equal(response.status,413);assert.equal(data.diagnostic,'prompt_too_long');assert.equal(called,false);
}));
test('corpo extremamente grande é recusado antes do Gemini',()=>withEnv(async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;throw Error('fetch should not run')};
 const response=await handler(req('a'.repeat(33000)));
 assert.equal(response.status,413);assert.equal(called,false);
}));
