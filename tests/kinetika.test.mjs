import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMechanism} from '../src/diagnostics.js';
import {ProjectHistory} from '../src/history.js';
const empty=()=>({nodes:[],bars:[],gears:[],mates:[],racks:[],scissors:[],aligns:[],pinLinks:[],pointLinks:[]});
test('pivô livre tem dois graus de liberdade',()=>{const m=empty();m.nodes=[{id:'n1',x:0,y:0}];assert.equal(analyzeMechanism(m).mobility,2)});
test('barra com apoio fixo tem um grau de liberdade',()=>{const m=empty();m.nodes=[{id:'n1',x:0,y:0,fixed:true},{id:'n2',x:100,y:0}];m.bars=[{id:'b1',a:'n1',b:'n2',length:100}];assert.equal(analyzeMechanism(m).mobility,1)});
test('detecta conflito em barra entre dois apoios',()=>{const m=empty();m.nodes=[{id:'n1',x:0,y:0,fixed:true},{id:'n2',x:20,y:0,fixed:true}];m.bars=[{id:'b',a:'n1',b:'n2',length:50}];assert.equal(analyzeMechanism(m).status,'incompatível')});
test('undo e redo preservam snapshots',()=>{const h=new ProjectHistory();h.seed({v:0});h.capture({v:1});assert.deepEqual(h.undo(),{v:0});assert.deepEqual(h.redo(),{v:1})});
