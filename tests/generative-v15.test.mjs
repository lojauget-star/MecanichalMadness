import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomAssembly,appendCustomAssembly,emptyAssembly} from '../src/assembly-builder.js';
import {suggestLocalPlan,normalizeAdvisorPlan} from '../src/design-assistant.js';
import {solveConstraints} from '../src/solver.js';
import handler from '../netlify/functions/mechanical-advisor.mjs';
const MODEL=()=>({nodes:[],bars:[],gears:[],racks:[],mates:[],aligns:[],pinLinks:[],pointLinks:[],nodeLinks:[],scissors:[],next:1});
const biela={nodes:[{id:'base',x:0,y:0,fixed:true,sliderAngle:0,sliderRange:0},{id:'pin',x:50,y:40,fixed:false,sliderAngle:0,sliderRange:0},{id:'cursor',x:160,y:0,fixed:false,sliderAngle:0,sliderRange:300}],bars:[{a:'base',b:'pin'},{a:'pin',b:'cursor'}],gears:[],racks:[],mates:[]};
const fourbar={nodes:[{id:'a',x:0,y:0,fixed:true,sliderAngle:0,sliderRange:0},{id:'b',x:60,y:80,fixed:false,sliderAngle:0,sliderRange:0},{id:'c',x:160,y:70,fixed:false,sliderAngle:0,sliderRange:0},{id:'d',x:220,y:0,fixed:true,sliderAngle:0,sliderRange:0}],bars:[{a:'a',b:'b'},{a:'b',b:'c'},{a:'c',b:'d'}],gears:[],racks:[],mates:[]};
test('genérico expandir não aciona exemplo de cruz',()=>{
 for(const t of ['quero expandir uma parede dobrável','preciso retrair uma mesa portátil','abrir uma estrutura articulada'])assert.notEqual(suggestLocalPlan(t).template,'cross_racks');
 assert.equal(suggestLocalPlan('quatro braços formando uma cruz').template,'cross_racks');
});
test('biblioteca local de biela cria uma topologia própria, diferente de engrenagens',()=>{
 const p=normalizeAdvisorPlan(suggestLocalPlan('quero transformar rotação em movimento de pistão com biela'));
 assert.equal(p.template,'custom');assert.equal(p.assembly.bars.length,2);assert.equal(p.assembly.racks.length,0);
 const m=MODEL();appendCustomAssembly(m,p.assembly);assert.equal(m.bars.length,2);assert.ok(m.nodes.some(n=>n.slider?.range>0));
});
test('biela e quadrilátero têm topologias distintas, dimensões preservadas e solucionador compatível',()=>{
 for(const [spec,bars] of [[biela,2],[fourbar,3]]){
  const a=validateCustomAssembly(spec);assert.equal(a.bars.length,bars);
  const m=MODEL();m.nodes.push({id:'n0',x:-200,y:-100,fixed:true,slider:null});const before=JSON.stringify(m.nodes[0]);
  const made=appendCustomAssembly(m,a,350,50);assert.equal(m.bars.length,bars);assert.equal(made.bars.length,bars);assert.equal(JSON.stringify(m.nodes[0]),before);
  for(const b of m.bars){const p=m.nodes.find(n=>n.id===b.a),q=m.nodes.find(n=>n.id===b.b);assert.ok(Math.abs(b.length-Math.hypot(p.x-q.x,p.y-q.y))<1e-8);assert.equal(b.dimensionMode,'locked')}
  const result=solveConstraints(m,{iterations:12});assert.ok(result.ok,JSON.stringify(result));
 }
});
test('IA não pode inserir comandos, referências quebradas, cópias duplicadas ou coordenadas absurdas',()=>{
 const bads=[{...biela,bars:[{a:'base',b:'__missing__'}]}, {...biela,nodes:biela.nodes.map(n=>({...n,id:'duplicate'}))}, {...biela,nodes:biela.nodes.map(n=>({...n,x:900000}))}, {...biela,bars:[{a:'base',b:'pin'},{a:'pin',b:'base'}]}, {...biela,bars:[{a:'base',b:'pin',code:'alert(1)'}],nodes:biela.nodes.map(n=>({...n,eval:'boom'}))}];
 for(let i=0;i<bads.length-1;i++)assert.throws(()=>validateCustomAssembly(bads[i]));
 const normal=validateCustomAssembly(bads.at(-1));assert.equal(normal.nodes[0].eval,undefined);assert.equal(normal.bars[0].code,undefined);
 assert.throws(()=>validateCustomAssembly({...biela,nodes:Array.from({length:35},(_,i)=>({...biela.nodes[0],id:`n${i}`}))}));
 assert.deepEqual(emptyAssembly(),{nodes:[],bars:[],gears:[],racks:[],mates:[]});
});
test('engrenagem e cremalheira declaradas são ligadas a um pinhão dentro do mesmo grafo',()=>{
 const spec={nodes:[{id:'shaft',x:0,y:0,fixed:true,sliderAngle:0,sliderRange:0},{id:'slide',x:0,y:55,fixed:false,sliderAngle:0,sliderRange:200}],bars:[],gears:[{id:'drive',node:'shaft',type:'gear',teeth:24,module:3}],racks:[{id:'rack',node:'slide',gear:'drive',side:1,length:180}],mates:[]};
 const m=MODEL();const created=appendCustomAssembly(m,spec,0,0);assert.equal(created.racks.length,1);assert.equal(m.racks[0].gearId,m.gears[0].id);assert.equal(m.nodes[1].slider.oy-m.nodes[0].y,45);
 const result=solveConstraints(m,{goals:new Map([[`${m.gears[0].id}.angle`,0.2]]),goalWeight:15,iterations:24,acceptResidual:.25,strict:true});assert.ok(result.ok,JSON.stringify(result));
});
const envKeys=['GEMINI_API_KEY','OPENAI_API_KEY','KINETIKA_ASSISTANT_ACCESS_CODE','KINETIKA_AI_PROVIDER','GEMINI_MODEL'];
async function mockEnv(vars,fn){const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]])),fetchBefore=globalThis.fetch;for(const k of envKeys)delete process.env[k];Object.assign(process.env,vars);try{await fn()}finally{for(const k of envKeys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}globalThis.fetch=fetchBefore}}
test('Gemini retorna montagem arbitrária (não template em cruz), sem alterar projeto',()=>mockEnv({GEMINI_API_KEY:'secret',KINETIKA_ASSISTANT_ACCESS_CODE:'access'},async()=>{
 const plan={title:'Articulação de quatro barras',explanation:'Quatro pivôs ligados por barras.',steps:['Fixar A e D','Mover a barra AB'],warnings:['Verifique singularidades'],template:'custom',assembly:fourbar};let posted;
 globalThis.fetch=async(url,req)=>{posted=JSON.parse(req.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200})};
 const req=new Request('https://example.netlify.app/.netlify/functions/mechanical-advisor',{method:'POST',headers:{'x-kinetika-access':'access','content-type':'application/json'},body:JSON.stringify({question:'Quero mecanismo dobrável de quatro barras'})});
 const res=await handler(req),body=await res.json();assert.equal(res.status,200,JSON.stringify(body));assert.equal(body.provider,'gemini');assert.equal(body.plan.template,'custom');assert.equal(body.plan.assembly.bars.length,3);assert.ok(posted.generationConfig.responseSchema.properties.assembly);
}));
test('chave OpenAI isolada nunca gera faturamento automaticamente',()=>mockEnv({OPENAI_API_KEY:'paid',KINETIKA_ASSISTANT_ACCESS_CODE:'access'},async()=>{
 globalThis.fetch=()=>{throw Error('OpenAI não deveria ser chamada')};const r=await handler(new Request('https://example.netlify.app/.netlify/functions/mechanical-advisor'));
 assert.equal((await r.json()).available,false);
}));
