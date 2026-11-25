import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceWallTable,auditWallTableAssembly,auditFunctionalPlan,functionalIntent} from '../src/functional-design.js';
import {validateCustomAssembly,appendCustomAssembly} from '../src/assembly-builder.js';
import {solveConstraints} from '../src/solver.js';
const M=()=>({nodes:[],bars:[],gears:[],racks:[],mates:[],aligns:[],pinLinks:[],pointLinks:[],nodeLinks:[],scissors:[],next:1});
const objective='Quero uma mesa retrátil que fique compactada contra a parede e abra como tampo horizontal.';
test('identifica requisito de mesa de parede sem afetar outros movimentos',()=>{
 assert.equal(functionalIntent(objective),'wall_table');
 assert.equal(functionalIntent('quatro cremalheiras em cruz'),null);
});
test('mesa lateral tem curso para aberto e recolhido e projeção compacta',()=>{
 const p=referenceWallTable(),spec=validateCustomAssembly(p.assembly),a=auditWallTableAssembly(spec);
 assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.tabletopLengthMm,560);
 assert.ok(a.foldedDepthMm<55);assert.ok(a.sliderTravelMm>180&&a.sliderTravelMm<260);
 assert.equal(auditFunctionalPlan(objective,p).ok,true);
});
test('barras genéricas em Y não satisfazem o requisito funcional',()=>{
 const p=referenceWallTable(),bad={...p.assembly,bars:[{a:'A',b:'T'},{a:'A',b:'S'}]};
 assert.equal(auditFunctionalPlan(objective,{template:'custom',assembly:bad}).ok,false);
 assert.equal(auditFunctionalPlan(objective,{template:'none',assembly:p.assembly}).ok,false);
 assert.equal(auditFunctionalPlan('braço robótico',{template:'none'}).ok,true);
});
test('solver preserva comprimento ao percorrer mesa 0° a 85°',()=>{
 const spec=referenceWallTable().assembly,m=M(),made=appendCustomAssembly(m,spec);
 const [A,T,S]=made.nodes.map(id=>m.nodes.find(n=>n.id===id)),L=m.bars[0].length,K=m.bars[1].length;
 for(let angle=0;angle<=85;angle+=5){
  const t=angle*Math.PI/180,pins=new Map([[T.id+'.x',A.x+L*Math.cos(t)],[T.id+'.y',A.y-L*Math.sin(t)]]);
  const r=solveConstraints(m,{pins,strict:true,iterations:30,acceptResidual:.12});
  assert.ok(r.ok,'angle '+angle+': '+JSON.stringify(r));
  assert.ok(Math.abs(Math.hypot(T.x-A.x,T.y-A.y)-L)<.12);
  assert.ok(Math.abs(Math.hypot(T.x-S.x,T.y-S.y)-K)<.12);
 }
 assert.ok(Math.abs(S.x-A.x)<.1);
});
