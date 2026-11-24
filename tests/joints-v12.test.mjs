import test from 'node:test';
import assert from 'node:assert/strict';
import {solveConstraints} from '../src/solver.js';
import {validateNodeJoint,translateScissorToVertex,isDraftBar,countScissorContacts} from '../src/links.js';
const pt=(id,x,y,extra={})=>({id,x,y,...extra});
const basic=()=>({nodes:[],bars:[],racks:[],gears:[],scissors:[],pinLinks:[],pointLinks:[],nodeLinks:[],aligns:[],mates:[]});
const close=(a,b,e=.06)=>assert.ok(Math.abs(a-b)<=e,`${a} versus ${b} (tol. ${e})`);
function addScissor(m,id,x,y,angle,height=80,diagonal=128,stages=1){
 const s={id,x,y,angle,stages,diagonal,height,topIds:[],bottomIds:[],centerIds:[]};
 for(let i=0;i<=stages;i++){const t=pt(`${id}_t${i}`,0,0),b=pt(`${id}_b${i}`,0,0);m.nodes.push(t,b);s.topIds.push(t.id);s.bottomIds.push(b.id)}
 for(let i=0;i<stages;i++){const c=pt(`${id}_c${i}`,0,0);m.nodes.push(c);s.centerIds.push(c.id)}
 m.scissors.push(s);place(m,s);return s;
}
function place(m,s){
 const angle=s.angle*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle),w=Math.sqrt(s.diagonal*s.diagonal-s.height*s.height);
 const set=(id,k,v)=>{const n=m.nodes.find(n=>n.id===id);n.x=s.x+k*w*ca-v*s.height*sa;n.y=s.y+k*w*sa+v*s.height*ca};
 s.topIds.forEach((id,k)=>set(id,k,0));s.bottomIds.forEach((id,k)=>set(id,k,1));s.centerIds.forEach((id,k)=>set(id,k+.5,.5));
}
test('todos os vértices externos e centrais são conectáveis e não mudam o sentido ao encaixar',()=>{
 const m=basic(),s=addScissor(m,'p',0,0,-155,90,150,3);const other=pt('external',80,40,{fixed:true});m.nodes.push(other);
 for(const id of [...s.topIds,...s.bottomIds,...s.centerIds])assert.equal(validateNodeJoint(m,id,'external'),null,id);
 assert.equal(validateNodeJoint(m,s.topIds[0],s.centerIds[0])!==null,true,'não deve soldar internamente o pantógrafo');
 const endpoint=s.bottomIds[3];const oldAngle=s.angle;
 assert.equal(translateScissorToVertex(s,endpoint,other,m.nodes),true);
 place(m,s);const at=m.nodes.find(n=>n.id===endpoint);close(at.x,other.x);close(at.y,other.y);assert.equal(s.angle,oldAngle);
 m.nodeLinks.push({id:'j',a:endpoint,b:'external'});
 assert.equal(countScissorContacts(m,s),1);
 const result=solveConstraints(m,{pins:new Map([[`${s.id}.angle`,oldAngle*Math.PI/180],[`${s.id}.height`,90]]),strict:true,iterations:25,acceptResidual:.05});
 assert.equal(result.ok,true,JSON.stringify(result));close(m.scissors[0].angle,oldAngle);close(at.x,other.x);close(at.y,other.y);
});
test('dois pantógrafos orientados para baixo compartilham vértice sem reorientação automática',()=>{
 const m=basic(),a=addScissor(m,'a',10,20,-135),b=addScissor(m,'b',200,40,130);
 const from=m.nodes.find(n=>n.id===b.topIds[0]);const target=m.nodes.find(n=>n.id===a.bottomIds[1]);
 translateScissorToVertex(b,b.topIds[0],target,m.nodes);place(m,b);
 m.nodeLinks.push({id:'j1',a:a.bottomIds[1],b:b.topIds[0]});
 const r=solveConstraints(m,{pins:new Map([['a.angle',-135*Math.PI/180],['b.angle',130*Math.PI/180],['a.height',80],['b.height',80]]),iterations:22,strict:true,acceptResidual:.07});
 assert.equal(r.ok,true,JSON.stringify(r));close(a.angle,-135);close(b.angle,130);close(from.x,target.x);close(from.y,target.y);
});
test('um vértice qualquer segue a cremalheira sem forçar rotação do pantógrafo',()=>{
 const m=basic(),s=addScissor(m,'p',0,0,180,80,145);
 const rack=pt('r',0,80,{slider:{ox:0,oy:80,angle:0,range:350}});m.nodes.push(rack);
 m.racks.push({id:'rack',node:'r',length:200,anchorX:0});
 m.pointLinks.push({id:'j',rackId:'rack',nodeId:s.bottomIds[0],slot:'center',offset:0});
 translateScissorToVertex(s,s.bottomIds[0],rack,m.nodes);place(m,s);
 const r=solveConstraints(m,{pins:new Map([['r.x',38],['p.angle',Math.PI],['p.height',80]]),iterations:25,strict:true,acceptResidual:.07});
 assert.equal(r.ok,true,JSON.stringify(r));close(s.angle,180);close(m.nodes.find(n=>n.id===s.bottomIds[0]).x,38);close(m.nodes.find(n=>n.id===s.bottomIds[0]).y,80);
});
test('uma ligação entre dois vértices e uma cremalheira pode alterar a abertura',()=>{
 const m=basic(),s=addScissor(m,'p',0,0,0,80,145);
 const fixed=pt('base',0,0,{fixed:true});const rack=pt('r',0,80,{slider:{ox:0,oy:0,angle:90,range:400}});
 m.nodes.push(fixed,rack);m.racks.push({id:'rack',node:'r',length:180,anchorX:0});
 m.nodeLinks.push({id:'base-j',a:s.topIds[0],b:'base'});
 m.pointLinks.push({id:'drive-j',nodeId:s.bottomIds[0],rackId:'rack',slot:'center'});
 const r=solveConstraints(m,{pins:new Map([['r.y',115],['p.angle',0]]),iterations:30,strict:true,acceptResidual:.07});
 assert.equal(r.ok,true,JSON.stringify(r));close(s.angle,0);close(s.height,115);close(s.x,0);close(s.y,0);
});
test('barras travadas mantêm comprimentos; dimensionamento explícito permite ajustar',()=>{
 const m=basic();m.nodes=[pt('a',0,0,{fixed:true}),pt('b',90,0,{fixed:true})];
 m.bars=[{id:'bar',a:'a',b:'b',length:90,dimensionMode:'locked'}];
 assert.equal(isDraftBar(m.bars[0]),false);
 m.nodes[1].x=130;
 const rigid=solveConstraints(m,{strict:true,iterations:12});assert.equal(rigid.ok,false);assert.ok(rigid.maxResidual>30);
 m.bars[0].dimensionMode='draft';assert.equal(isDraftBar(m.bars[0]),true);
 const drafted=solveConstraints(m,{strict:true,iterations:12});assert.equal(drafted.ok,true,JSON.stringify(drafted));
 m.bars[0].length=130;m.bars[0].dimensionMode='locked';
 assert.equal(solveConstraints(m,{strict:true,iterations:12}).ok,true);
});
