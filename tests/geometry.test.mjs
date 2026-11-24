import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeGeometry,segmentSeparation} from '../src/geometry.js';
const point=(id,x,y,attrs={})=>({id,x,y,...attrs});
const empty=()=>({nodes:[],bars:[],gears:[],racks:[],mates:[],pointLinks:[],scissors:[]});
test('segmentos que se cruzam têm distância zero',()=>{
 const d=segmentSeparation({x:-2,y:0},{x:2,y:0},{x:0,y:-3},{x:0,y:3});assert.equal(d.distance,0);assert.equal(d.intersects,true);
});
test('barras que cruzam sem junta geram interferência',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',100,100),point('c',0,100),point('d',100,0)];M.bars=[{id:'b1',a:'a',b:'b'},{id:'b2',a:'c',b:'d'}];const d=analyzeGeometry(M);assert.equal(d.collisions.length,1);assert.equal(d.collisions[0].kind,'collision')});
test('barras articuladas no mesmo pivô não disparam colisão espúria',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',100,0),point('c',100,100)];M.bars=[{id:'b1',a:'a',b:'b'},{id:'b2',a:'b',b:'c'}];assert.equal(analyzeGeometry(M).collisions.length,0)});
test('engrenagem central montada em pivô de barra não é classificada como colisão',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',100,0)];M.bars=[{id:'b',a:'a',b:'b'}];M.gears=[{id:'g',node:'a',radius:20,type:'gear',module:3}];assert.equal(analyzeGeometry(M).collisions.length,0)});
test('engrenagens não vinculadas sobrepostas são detectadas',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',30,0)];M.gears=[{id:'g1',node:'a',radius:25},{id:'g2',node:'b',radius:25}];assert.equal(analyzeGeometry(M).collisions.length,1)});
test('par de engrenagens em engrenamento correto não é sinalizado',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',50,0)];M.gears=[{id:'g1',node:'a',radius:25,module:3},{id:'g2',node:'b',radius:25,module:3}];M.mates=[{id:'m1',a:'g1',b:'g2',type:'gear'}];assert.equal(analyzeGeometry(M).collisions.length,0)});
test('sobreposição extrema de par engrenado continua sinalizada',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',12,0)];M.gears=[{id:'g1',node:'a',radius:25,module:3},{id:'g2',node:'b',radius:25,module:3}];M.mates=[{id:'m1',a:'g1',b:'g2',type:'gear'}];assert.equal(analyzeGeometry(M).collisions.length,1)});
test('pinhão e cremalheira engatados ignoram contato funcional',()=>{const M=empty();M.nodes=[point('ax',0,0),point('r',0,30,{slider:{angle:0,ox:0,oy:30,range:180}})];M.gears=[{id:'g',node:'ax',radius:20}];M.racks=[{id:'r1',node:'r',length:160,gearId:'g'}];assert.equal(analyzeGeometry(M).collisions.length,0)});
test('ligação de barra com âncora de cremalheira não é alerta espúrio',()=>{const M=empty();M.nodes=[point('a',0,0),point('b',20,50),point('r',0,0,{slider:{angle:0,ox:0,oy:0,range:150}})];M.bars=[{id:'b1',a:'a',b:'b'}];M.racks=[{id:'r1',node:'r',length:150}];M.pointLinks=[{id:'lk',rackId:'r1',nodeId:'a'}];assert.equal(analyzeGeometry(M).collisions.length,0)});
test('colinearidade no pivô intermediário gera alerta de singularidade',()=>{const M=empty();M.nodes=[point('a',-100,0),point('b',0,0),point('c',100,0)];M.bars=[{id:'b1',a:'a',b:'b'},{id:'b2',a:'b',b:'c'}];assert.equal(analyzeGeometry(M).singularities.length,1)});
test('ângulo de 90 graus não é singularidade',()=>{const M=empty();M.nodes=[point('a',-100,0),point('b',0,0),point('c',0,100)];M.bars=[{id:'b1',a:'a',b:'b'},{id:'b2',a:'b',b:'c'}];assert.equal(analyzeGeometry(M).singularities.length,0)});
test('pantógrafo próximo do limite é apontado',()=>{const M=empty();M.scissors=[{id:'s1',x:0,y:0,height:98,diagonal:100,topIds:[],bottomIds:[],centerIds:[]}];assert.equal(analyzeGeometry(M).singularities.length,1)});
test('montagem grande reduz inspeção respeitando o limite de componentes',()=>{const M=empty();for(let i=0;i<35;i++){M.nodes.push(point('a'+i,i*20,0),point('b'+i,i*20,40));M.bars.push({id:'b'+i,a:'a'+i,b:'b'+i})}const r=analyzeGeometry(M,{maxParts:18});assert.equal(r.truncated,true);assert.equal(r.partsInspected,18)});

test('retorna folga mínima e par geométrico mesmo sem colisão',()=>{const m=empty();m.nodes.push(point('a',0,0),point('b',100,0),point('c',0,25),point('d',100,25));m.bars.push({id:'b1',a:'a',b:'b',length:100},{id:'b2',a:'c',b:'d',length:100});const r=analyzeGeometry(m);assert.ok(Math.abs(r.minGap-15)<.001);assert.equal(r.minPair.label,'Barra b1 × Barra b2')});
test('sem pares comparáveis indica folga desconhecida e não infinita',()=>{const m=empty();const r=analyzeGeometry(m);assert.equal(r.minGap,null);assert.equal(r.minPair,null)});
