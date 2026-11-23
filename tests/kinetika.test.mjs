import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMechanism} from '../src/diagnostics.js';
import {ProjectHistory} from '../src/history.js';
const empty=()=>({nodes:[],bars:[],gears:[],mates:[],racks:[],scissors:[],aligns:[],pinLinks:[],pointLinks:[]});
test('pivô livre tem dois graus de liberdade',()=>{const m=empty();m.nodes=[{id:'n1',x:0,y:0}];assert.equal(analyzeMechanism(m).mobility,2)});
test('barra com apoio fixo tem um grau de liberdade',()=>{const m=empty();m.nodes=[{id:'n1',x:0,y:0,fixed:true},{id:'n2',x:100,y:0}];m.bars=[{id:'b1',a:'n1',b:'n2',length:100}];assert.equal(analyzeMechanism(m).mobility,1)});
test('detecta conflito em barra entre dois apoios',()=>{const m=empty();m.nodes=[{id:'n1',x:0,y:0,fixed:true},{id:'n2',x:20,y:0,fixed:true}];m.bars=[{id:'b',a:'n1',b:'n2',length:50}];assert.equal(analyzeMechanism(m).status,'incompatível')});
test('undo e redo preservam snapshots',()=>{const h=new ProjectHistory();h.seed({v:0});h.capture({v:1});assert.deepEqual(h.undo(),{v:0});assert.deepEqual(h.redo(),{v:1})});

import {solveConstraints} from '../src/diagnostics.js';

test('V8: resolve cadeia fechada com apoio fixo e ponta arrastada',()=>{
 const m=empty();m.nodes=[N('a',0,0,true),N('b',80,60),N('c',175,110),N('d',200,0,true)];
 m.bars=[B('ab','a','b',100),B('bc','b','c',Math.hypot(175-80,110-60)),B('cd','c','d',Math.hypot(175-200,110)),B('ad','a','d',200)];
 m.nodes[2].x+=12;m.nodes[2].y-=7;
 const r=solveConstraints(m,{pins:new Map([['b.x',80],['b.y',60]]),iterations:20});
 assert.equal(r.ok,true,JSON.stringify(r));assert.ok(Math.abs(m.nodes[2].x-175)<.1);
});
test('V8: bloqueia apoio incompatível sem deformar barras',()=>{
 const m=empty();m.nodes=[N('a',0,0,true),N('b',20,0,true)];m.bars=[B('ab','a','b',80)];
 const r=solveConstraints(m,{strict:true});assert.equal(r.ok,false);assert.equal(m.nodes[1].x,20);
});
