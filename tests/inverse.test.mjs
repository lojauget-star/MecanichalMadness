import test from 'node:test';
import assert from 'node:assert/strict';
import {solveConstraints} from '../src/solver.js';
const base=()=>({nodes:[],bars:[],gears:[],racks:[],scissors:[],mates:[],aligns:[],pointLinks:[],pinLinks:[]});
const n=(id,x,y,extra={})=>({id,x,y,...extra});
const solve=(m,goals,opts={})=>{
 const backup=JSON.stringify(m);
 let r=solveConstraints(m,{goals,goalWeight:.038,iterations:28,strict:true,acceptResidual:.22,damping:1e-8,...opts});
 if(!r.ok){Object.assign(m,JSON.parse(backup));r=solveConstraints(m,{goals,goalWeight:.008,iterations:28,strict:true,acceptResidual:.22,damping:1e-9,...opts})}
 return r;
};
const near=(x,y,d=.35)=>assert.ok(Math.abs(x-y)<d,`${x} != ${y}`);
test('alvo inverso respeita barra com apoio fixo',()=>{
 const m=base();m.nodes=[n('a',0,0,{fixed:true}),n('b',100,0)];m.bars=[{id:'b',a:'a',b:'b',length:100}];
 const r=solve(m,{'b.x':60,'b.y':80});
 assert.ok(r.ok,JSON.stringify(r));near(Math.hypot(m.nodes[1].x,m.nodes[1].y),100,.2);
});
test('alvo inalcançável preserva barra sem alongamento',()=>{
 const m=base();m.nodes=[n('a',0,0,{fixed:true}),n('b',100,0)];m.bars=[{id:'b',a:'a',b:'b',length:100}];
 const r=solve(m,{'b.x':250,'b.y':80});
 assert.ok(r.ok,JSON.stringify(r));assert.ok(r.limitReached);near(Math.hypot(m.nodes[1].x,m.nodes[1].y),100,.22);
});
test('cremalheira move pinhão e cremalheira perpendicular',()=>{
 const m=base();m.nodes=[n('c',0,0,{fixed:true}),n('r1',0,29,{slider:{ox:0,oy:29,angle:0,range:300}}),n('r2',29,0,{slider:{ox:29,oy:0,angle:90,range:300}})];
 m.gears=[{id:'g',node:'c',radius:20,angle:0}];
 m.racks=[{id:'x',node:'r1',length:240,gearId:'g',offset:0,side:1},{id:'y',node:'r2',length:240,gearId:'g',offset:0,side:-1}];
 const r=solve(m,{'r1.x':24,'r1.y':29});
 assert.ok(r.ok,JSON.stringify(r));near(m.gears[0].angle,-1.2,.05);near(m.nodes[2].y,-24,1);
});
test('pantógrafo abre por ponto de controle',()=>{
 const m=base(),h=80,w=100,d=Math.hypot(w,h);
 m.nodes=[n('t0',0,0),n('b0',0,h),n('t1',w,0),n('b1',w,h),n('c',50,40)];
 m.scissors=[{id:'s',stages:1,diagonal:d,height:h,x:0,y:0,angle:0,topIds:['t0','t1'],bottomIds:['b0','b1'],centerIds:['c'],driveId:'b0'}];
 const r=solve(m,{'b0.y':100,'b0.x':0},{pins:new Map([['s.x',0],['s.y',0],['s.angle',0]])});
 assert.ok(r.ok,JSON.stringify(r));near(m.scissors[0].height,100,1.1);
});
