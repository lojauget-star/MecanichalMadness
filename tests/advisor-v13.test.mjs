import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestLocalPlan, appendCrossRacks,normalizeAdvisorPlan,modelSummary} from '../src/design-assistant.js';
import handler from '../netlify/functions/mechanical-advisor.mjs';
const blank=()=>({nodes:[],bars:[],gears:[],racks:[],mates:[],pointLinks:[],pinLinks:[],nodeLinks:[],next:1});
test('expansão em cruz é reconhecida sem depender de IA online',()=>{
  const p=suggestLocalPlan('Quero expandir quatro braços em cruz usando uma engrenagem');
  assert.equal(p.template,'cross_racks');assert.ok(p.warnings.some(w=>w.includes('2D')));
});
test('proposta de pantógrafo e biela distingue opções fabricáveis',()=>{
  assert.equal(suggestLocalPlan('levantar uma plataforma com pantografo').template,'scissor');
  assert.equal(suggestLocalPlan('converter rotacao em pistao usando biela').template,'custom');
});
test('inserção em cruz preserva peças preexistentes, orienta 4 cremalheiras e partilha um pinhão',()=>{
  const m=blank();m.nodes.push({id:'n0',x:500,y:500,fixed:true});m.next=1;
  const result=appendCrossRacks(m,100,200);
  assert.equal(m.nodes[0].id,'n0');assert.equal(m.racks.length,4);
  assert.equal(m.gears.length,1);assert.equal(result.gearId,m.gears[0].id);
  assert.deepEqual(m.racks.map(r=>m.nodes.find(n=>n.id===r.node).slider.angle),[0,0,90,90]);
  assert.deepEqual(m.racks.map(r=>r.side),[1,-1,1,-1]);
  assert.ok(m.racks.every(r=>r.gearId===m.gears[0].id));
  const s=modelSummary(m);assert.equal(s.racks,4);assert.equal(s.gears,1);
});
test('planos arbitrários da IA não têm privilégios para executar scripts',()=>{
  const p=normalizeAdvisorPlan({template:'javascript:alert(1)',title:'X',steps:['abc'],warnings:[]});
  assert.equal(p.template,'none');
});
test('endpoint do Netlify retorna indisponível sem chaves e não chama API externa',async()=>{
  const oldKey=process.env.OPENAI_API_KEY,oldAccess=process.env.KINETIKA_ASSISTANT_ACCESS_CODE;
  delete process.env.OPENAI_API_KEY;delete process.env.KINETIKA_ASSISTANT_ACCESS_CODE;
  try{
    let res=await handler(new Request('https://test/.netlify/functions/mechanical-advisor'));
    assert.equal(res.status,200);assert.deepEqual(await res.json(),{available:false,provider:null,mode:'local'});
    res=await handler(new Request('https://test/.netlify/functions/mechanical-advisor',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'girar uma engrenagem'})}));
    assert.equal(res.status,503);
  }finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldAccess===undefined)delete process.env.KINETIKA_ASSISTANT_ACCESS_CODE;else process.env.KINETIKA_ASSISTANT_ACCESS_CODE=oldAccess}
});
test('endpoint com chave exige código de acesso',async()=>{
  const key=process.env.GEMINI_API_KEY,access=process.env.KINETIKA_ASSISTANT_ACCESS_CODE;
  process.env.GEMINI_API_KEY='test-secret';process.env.KINETIKA_ASSISTANT_ACCESS_CODE='only-admin';
  try{
    const r=await handler(new Request('https://test/.netlify/functions/mechanical-advisor',{method:'POST',headers:{'content-type':'application/json','x-kinetika-access':'incorrect'},body:JSON.stringify({question:'Expansão em cruz'})}));
    assert.equal(r.status,401);
  }finally{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(access===undefined)delete process.env.KINETIKA_ASSISTANT_ACCESS_CODE;else process.env.KINETIKA_ASSISTANT_ACCESS_CODE=access}
});
test('um pinhão desloca quatro cremalheiras em pares opostos no mesmo modelo',async()=>{
 const {solveConstraints}=await import('../src/solver.js');
 const m=blank(),made=appendCrossRacks(m);
 const r=solveConstraints(m,{goals:new Map([[`${made.gearId}.angle`,.35]]),goalWeight:12,iterations:28,acceptResidual:.2,goalTolerance:.3,strict:true});
 assert.ok(r.ok);assert.ok(r.maxResidual<.002);
 const q=m.racks.map(r=>{const n=m.nodes.find(n=>n.id===r.node),a=n.slider.angle*Math.PI/180;return (n.x-n.slider.ox)*Math.cos(a)+(n.y-n.slider.oy)*Math.sin(a)});
 assert.ok(q[0]<-10&&q[1]>10&&q[2]<-10&&q[3]>10);
 assert.ok(Math.abs(q[0]+q[1])<.001);
});
