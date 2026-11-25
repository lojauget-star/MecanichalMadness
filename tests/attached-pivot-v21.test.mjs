import test from 'node:test';
import assert from 'node:assert/strict';
import {attachPivot,attachedPivotPosition,detachPivotsFrom} from '../src/attached-pivot.js';
import {solveConstraints} from '../src/solver.js';
const M=()=>({nodes:[],bars:[],gears:[],racks:[],mates:[],aligns:[],pinLinks:[],pointLinks:[],nodeLinks:[],scissors:[],next:1});
const n=(m,id,x,y,fixed=false,slider=null)=>{const p={id,x,y,fixed,slider,follower:null,motor:null};m.nodes.push(p);return p};
const bar=(m,a,b)=>{const p={id:'b'+m.next++,a:a.id,b:b.id,length:Math.hypot(a.x-b.x,a.y-b.y),dimensionMode:'locked',motor:null};m.bars.push(p);return p};
test('pivô incorporado à barra mantém posição proporcional sem cortá-la',()=>{
 const m=M(),a=n(m,'a',0,0,true),z=n(m,'z',200,0),b=bar(m,a,z),p=attachPivot(m,'bar',b.id,{x:70,y:0});
 assert.equal(m.bars.length,1);assert.ok(Math.abs(p.follower.ratio-.35)<1e-9);
 const res=solveConstraints(m,{goals:new Map([['z.y',90]]),goalWeight:.4,iterations:28,strict:true});
 assert.ok(res.ok,JSON.stringify(res));const at=attachedPivotPosition(m,p.follower);
 assert.ok(Math.hypot(at.x-p.x,at.y-p.y)<.15);
 assert.ok(Math.abs(Math.hypot(a.x-z.x,a.y-z.y)-200)<.15);
});
test('pivô incorporado à cremalheira conserva offset na guia',()=>{
 const m=M(),s=n(m,'s',0,50,false,{ox:0,oy:50,angle:0,range:250});
 m.racks.push({id:'r1',node:s.id,length:190,gearId:null,side:1,offset:0});
 const p=attachPivot(m,'rack','r1',{x:63,y:50});
 assert.equal(p.follower.offset,63);
 const res=solveConstraints(m,{goals:new Map([['s.x',45]]),goalWeight:.6,iterations:25,strict:true});
 assert.ok(res.ok,JSON.stringify(res));assert.ok(Math.abs((p.x-s.x)-63)<.15);
});
test('pivô excêntrico da roda acompanha rotação',()=>{
 const m=M(),c=n(m,'c',0,0,true);
 m.gears.push({id:'g1',node:'c',teeth:24,module:3,radius:36,angle:0});
 const p=attachPivot(m,'gear','g1',{x:0,y:22});
 const res=solveConstraints(m,{pins:new Map([['g1.angle',Math.PI/3]]),strict:true,iterations:24});
 assert.ok(res.ok,JSON.stringify(res));const at=attachedPivotPosition(m,p.follower);
 assert.ok(Math.hypot(at.x-p.x,at.y-p.y)<.15);
});
test('pivô participa de outra barra e não altera o comprimento de nenhuma',()=>{
 const m=M(),a=n(m,'a',0,0,true),b=n(m,'b',170,0),c=n(m,'c',200,60);
 const primary=bar(m,a,b),p=attachPivot(m,'bar',primary.id,{x:100,y:0});bar(m,p,c);
 const res=solveConstraints(m,{goals:new Map([['b.y',80]]),goalWeight:.22,iterations:25,strict:true});
 assert.ok(res.ok,JSON.stringify(res));
 assert.ok(m.bars.every(v=>{const a=m.nodes.find(n=>n.id===v.a),z=m.nodes.find(n=>n.id===v.b);return Math.abs(Math.hypot(a.x-z.x,a.y-z.y)-v.length)<.15}));
});
test('desprender não apaga pivô nem barras que o utilizam',()=>{
 const m=M(),a=n(m,'a',0,0),b=n(m,'b',100,0),source=bar(m,a,b),p=attachPivot(m,'bar',source.id,{x:40,y:0});
 assert.equal(detachPivotsFrom(m,'bar',source.id),1);assert.equal(p.follower,null);assert.ok(m.nodes.includes(p));
});
