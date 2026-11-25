import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{selectedProvider} from '../netlify/functions/mechanical-advisor.mjs';
const endpoint='https://test.example/.netlify/functions/mechanical-advisor';
const request=(code='secret')=>new Request(endpoint,{method:'POST',headers:{'content-type':'application/json','x-kinetika-access':code},body:JSON.stringify({question:'Quero abrir quatro braços em forma de cruz',project:{nodes:12,bars:4,gears:1,racks:4}})});
const mockPlan={title:'Expansão em cruz',explanation:'Pinhão central com guias.',steps:['Gire o pinhão','Verifique curso'],warnings:['Evite colisões'],template:'cross_racks'};
async function withEnvironment(env,run){
 const keys=['GEMINI_API_KEY','OPENAI_API_KEY','KINETIKA_ASSISTANT_ACCESS_CODE','GEMINI_MODEL','KINETIKA_AI_PROVIDER'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
 for(const key of keys)delete process.env[key];
 Object.assign(process.env,env);
 try{return await run()}finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}globalThis.fetch=oldFetch}
}
test('sem chave ou código funciona apenas a biblioteca local',()=>withEnvironment({},async()=>{
 const get=await handler(new Request(endpoint));assert.deepEqual(await get.json(),{available:false,provider:null,mode:'local'});
 const post=await handler(request());assert.equal(post.status,503);
}));
test('chaves Gemini e OpenAI: Gemini é selecionado primeiro, sem custos OpenAI imprevistos',()=>{
 assert.equal(selectedProvider({GEMINI_API_KEY:'g',OPENAI_API_KEY:'o'}),'gemini');
 assert.equal(selectedProvider({OPENAI_API_KEY:'o'}),null);
 assert.equal(selectedProvider({GEMINI_API_KEY:'g',OPENAI_API_KEY:'o',KINETIKA_AI_PROVIDER:'openai'}),'openai');
 assert.equal(selectedProvider({GEMINI_API_KEY:'g',OPENAI_API_KEY:'o',KINETIKA_AI_PROVIDER:'gemini'}),'gemini');
 assert.equal(selectedProvider({OPENAI_API_KEY:'o',KINETIKA_AI_PROVIDER:'gemini'}),null);
});
test('Gemini usa endpoint oficial com chave somente no servidor e devolve plano validado',()=>withEnvironment({GEMINI_API_KEY:'my-private-key',KINETIKA_ASSISTANT_ACCESS_CODE:'secret'},async()=>{
 const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(mockPlan)}]}}]}),{status:200,headers:{'content-type':'application/json'}})};
 const ready=await handler(new Request(endpoint));assert.deepEqual(await ready.json(),{available:true,provider:'gemini',mode:'online'});
 const response=await handler(request());assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.mode,'ai');assert.equal(data.provider,'gemini');assert.equal(data.plan.template,'cross_racks');
 assert.equal(requests.length,1);assert.match(requests[0].url,/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent/);
 assert.equal(requests[0].options.headers['x-goog-api-key'],'my-private-key');
 const payload=JSON.parse(requests[0].options.body);assert.equal(payload.generationConfig.responseMimeType,'application/json');
 assert.equal(payload.generationConfig.responseSchema.properties.template.type,'string');
 assert.ok(!JSON.stringify(data).includes('my-private-key'));
}));
test('código incorreto impede a chamada externa',()=>withEnvironment({GEMINI_API_KEY:'g',KINETIKA_ASSISTANT_ACCESS_CODE:'secret'},async()=>{
 globalThis.fetch=()=>{throw Error('Não deveria chamar')};
 const response=await handler(request('wrong'));assert.equal(response.status,401);
}));
test('cota do Gemini esgotada não aciona automaticamente OpenAI',()=>withEnvironment({GEMINI_API_KEY:'g',OPENAI_API_KEY:'pay-key',KINETIKA_ASSISTANT_ACCESS_CODE:'secret'},async()=>{
 const urls=[];globalThis.fetch=async(url)=>{urls.push(url);return new Response(JSON.stringify({error:{message:'quota'}}),{status:429})};
 const result=await handler(request());assert.equal(result.status,429);assert.equal((await result.json()).provider,'gemini');
 assert.equal(urls.length,1);assert.match(urls[0],/googleapis/);
}));
test('modelo Gemini inválido bloqueia URL e consulta externa',()=>withEnvironment({GEMINI_API_KEY:'g',KINETIKA_ASSISTANT_ACCESS_CODE:'secret',GEMINI_MODEL:'https://malicious.example'},async()=>{
 globalThis.fetch=()=>{throw Error('Não deveria chamar')};
 const result=await handler(request());assert.equal(result.status,502);
}));
test('modelo OpenAI só é escolhido sob configuração explícita',()=>withEnvironment({GEMINI_API_KEY:'g',OPENAI_API_KEY:'o',KINETIKA_ASSISTANT_ACCESS_CODE:'secret',KINETIKA_AI_PROVIDER:'openai'},async()=>{
 let url;globalThis.fetch=async(u)=>{url=u;return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(mockPlan)}]}]}),{status:200})};
 const response=await handler(request());assert.equal(response.status,200);assert.equal((await response.json()).provider,'openai');assert.match(url,/api\.openai\.com/);
}));
