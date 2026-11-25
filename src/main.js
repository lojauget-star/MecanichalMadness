
'use strict';
import {analyzeMechanism} from './diagnostics.js';
import {ProjectHistory} from './history.js';
import {solveConstraints} from './solver.js';
import {analyzeGeometry} from './geometry.js';
import {isDraftBar,isConnectedScissor,countScissorContacts,validateNodeJoint,translateScissorToVertex} from './links.js';
import {planMotionSweep,capturePose,summarizeMotionSweep,sampleSeverity} from './sweep.js';
import {suggestLocalPlan,modelSummary,appendCrossRacks,normalizeAdvisorPlan} from './design-assistant.js';
import {appendCustomAssembly} from './assembly-builder.js';
// KINÉTIKA V13 | Juntas em todos os vértices, orientação preservada e cotas de barras traváveis.
const $=id=>document.getElementById(id);
const stage=$('stage');
const TAU=Math.PI*2, rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI, RACK_CLEARANCE=9;
const fmt=(n,d=1)=>Number.isFinite(n)?Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const normDeg=d=>((d+180)%360+360)%360-180;
let inverseDragInfo=null,inverseGhost=null,stablePose=null;
let invalidPoseWarningAt=0,joiningPorts=false;
let geometryReport=null, geometryLastCheck=0, geometryOverlayVisible=true;
function inspectGeometry(force=false){const now=performance.now();if(force||!geometryReport||now-geometryLastCheck>80){geometryReport=analyzeGeometry(M);geometryLastCheck=now}return geometryReport}
let lastSolveInfo={status:'initial',maxResidual:0,iterations:0};
let M,sel=null,multi=[],tool='select',pending=null,pendingPort=null,hoverPort=null,drag=null,manualDrive=null,snapCandidate=null,pointer={x:0,y:0},playing=false,t=0,speed=1,maxResidual=0,toastTimer=0;
let cam={x:0,y:0,scale:1.5},view={x:-300,y:-220,w:600,h:440};
const serial=()=>({nodes:[],bars:[],gears:[],mates:[],racks:[],aligns:[],pinLinks:[],pointLinks:[],nodeLinks:[],next:1,name:'Projeto sem título',scissor:null,scissors:[]});
const idFor=pre=>pre+(M.next++);
const node=id=>M.nodes.find(n=>n.id===id);
const bar=id=>M.bars.find(b=>b.id===id);
const gear=id=>M.gears.find(g=>g.id===id);
const rack=id=>M.racks.find(r=>r.id===id);
const scissor=id=>M.scissors?.find(x=>x.id===id);
const rackLink=id=>M.pinLinks?.find(l=>l.rackId===id)||null;
const scissorLink=id=>M.pinLinks?.find(l=>l.scissorId===id)||null;
function scissorForNode(id){return M.scissors?.find(g=>[...g.topIds,...g.bottomIds,...g.centerIds].includes(id))||null}
function scissorForBar(id){const b=bar(id);return b&&(scissorForNode(b.a)||scissorForNode(b.b))}
function groupForTarget(o){if(!o)return null;if(o.type==='scissor')return scissor(o.id);if(o.type==='node')return scissorForNode(o.id);if(o.type==='bar')return scissorForBar(o.id);return null}
function localAxes(a){const c=Math.cos(rad(a)),s=Math.sin(rad(a));return {u:{x:c,y:s},v:{x:-s,y:c}}}
function scissorWidth(g){return Math.sqrt(Math.max(0,g.diagonal*g.diagonal-g.height*g.height))}
function placeScissor(g){
 const {u,v}=localAxes(g.angle),w=scissorWidth(g),h=g.height;
 for(let i=0;i<=g.stages;i++){
  const x=g.x+i*w*u.x,y=g.y+i*w*u.y,A=node(g.topIds[i]),B=node(g.bottomIds[i]);
  if(A){A.x=x;A.y=y}if(B){B.x=x+h*v.x;B.y=y+h*v.y}
 }
 for(let i=0;i<g.stages;i++){
  const C=node(g.centerIds[i]);if(C){C.x=g.x+(i+.5)*w*u.x+h*.5*v.x;C.y=g.y+(i+.5)*w*u.y+h*.5*v.y}
 }
}
function scissorCenter(g){const {u,v}=localAxes(g.angle),w=scissorWidth(g);return {x:g.x+g.stages*w*.5*u.x+g.height*.5*v.x,y:g.y+g.stages*w*.5*u.y+g.height*.5*v.y}}
function scissorRotateHandle(g){const mid=scissorCenter(g),{v}=localAxes(g.angle);return {x:mid.x-v.x*(Math.max(55,g.height*.5+38)),y:mid.y-v.y*(Math.max(55,g.height*.5+38))}}
function scissorMoveHandle(g){return scissorCenter(g)}
function entityNodeIds(o){if(!o)return [];
 if(o.type==='node'||o.type==='guide')return [o.id];
 if(o.type==='gear')return [gear(o.id)?.node].filter(Boolean);
 if(o.type==='rack')return [rack(o.id)?.node].filter(Boolean);
 if(o.type==='bar'){const b=bar(o.id);return b?[b.a,b.b]:[]}
 const g=groupForTarget(o);return g?[...g.topIds,...g.bottomIds,...g.centerIds]:[];
}
function entityPosition(o){if(!o)return null;const g=groupForTarget(o);if(g&&o.type==='scissor')return scissorCenter(g);
 if(o.type==='bar'){const b=bar(o.id);if(!b)return null;const a=node(b.a),z=node(b.b);return {x:(a.x+z.x)/2,y:(a.y+z.y)/2}}
 if(o.type==='guide'){const s=node(o.id)?.slider;return s?{x:s.ox,y:s.oy}:null;}
 const n=node(entityNodeIds(o)[0]);return n?{x:n.x,y:n.y}:null;
}
function connectedNodeIds(o){const seen=new Set(entityNodeIds(o)),todo=[...seen];
 for(let i=0;i<todo.length;i++){
  const id=todo[i],adj=[];
  for(const b of M.bars){if(b.a===id)adj.push(b.b);if(b.b===id)adj.push(b.a)}
  for(const gm of M.mates){const ga=gear(gm.a),gb=gear(gm.b);if(ga&&gb){if(ga.node===id)adj.push(gb.node);if(gb.node===id)adj.push(ga.node)}}
  for(const r of M.racks){const g=gear(r.gearId);if(g){if(g.node===id)adj.push(r.node);if(r.node===id)adj.push(g.node)}}
  for(const n of M.nodes){if(n.follower?.gear&&gear(n.follower.gear)?.node===id)adj.push(n.id);if(n.id===id&&n.follower?.gear)adj.push(gear(n.follower.gear).node)}
  for(const l of M.pinLinks||[]){const r=rack(l.rackId),g=scissor(l.scissorId);if(!r||!g)continue;if(r.node===id)adj.push(g.driveId);if(g.driveId===id)adj.push(r.node)}
  for(const l of M.pointLinks||[]){const r=rack(l.rackId);if(!r)continue;if(r.node===id)adj.push(l.nodeId);if(l.nodeId===id)adj.push(r.node)}
  for(const l of M.nodeLinks||[]){if(l.a===id)adj.push(l.b);if(l.b===id)adj.push(l.a)}
  const sc=scissorForNode(id);if(sc)adj.push(...sc.topIds,...sc.bottomIds,...sc.centerIds);
  for(const a of adj)if(a&&!seen.has(a)){seen.add(a);todo.push(a)}
 }
 return seen;
}
function translateAssembly(o,dx,dy){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
 const ids=connectedNodeIds(o);for(const n of M.nodes)if(ids.has(n.id)){
  n.x+=dx;n.y+=dy;
  if(n.slider){n.slider.ox+=dx;n.slider.oy+=dy}
 }
 for(const g of M.scissors||[])if(ids.has(g.topIds[0])){g.x+=dx;g.y+=dy;placeScissor(g)}
}
function sameAssembly(a,b){const aa=connectedNodeIds(a),bb=entityNodeIds(b);return bb.some(id=>aa.has(id))}
function alignObjects(first,second,axis){
 if(!first||!second||first.type===second.type&&first.id===second.id){toast('Escolha dois objetos diferentes.',true);return false}
 const a=entityPosition(first),b=entityPosition(second);if(!a||!b){toast('Objeto não encontrado.',true);return false}
 const d=a[axis]-b[axis];
 if(sameAssembly(first,second)&&Math.abs(d)>.01){toast('Estão na mesma cadeia rígida: o alinhamento exigiria deformar conexões. Desconecte ou escolha outros objetos.',true);return false}
 if(axis==='x')translateAssembly(second,d,0);else translateAssembly(second,0,d);
 solve(130);render();toast(`Alinhamento ${axis.toUpperCase()} aplicado: centros na mesma ${axis==='x'?'vertical':'horizontal'}.`);return true;
}
function useTwoSelection(axis){if(multi.length!==2)return false;const ok=alignObjects(multi[0],multi[1],axis);if(ok){sel=multi[1];multi=[];renderProperties();render()}return ok}

const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function addNode(x,y,opt={}){const n={id:idFor('n'),x,y,fixed:false,slider:null,follower:null,motor:null,...opt};M.nodes.push(n);return n}
function addBar(a,b,opt={dimensionMode:'locked'}){if(a.id===b.id){toast('Escolha dois pivôs diferentes.',true);return null} if(M.bars.some(v=>(v.a===a.id&&v.b===b.id)||(v.a===b.id&&v.b===a.id))){toast('Esses pivôs já estão ligados.',true);return null}const item={id:idFor('b'),a:a.id,b:b.id,length:dist(a,b),motor:null,...opt};M.bars.push(item);return item}
function addGear(x,y,type='gear',teeth=24,module=3.5){let n=addNode(x,y,{fixed:true});const g={id:idFor('g'),node:n.id,type,teeth,module,radius:teeth*module/2,angle:0,baseAngle:0,motor:null};M.gears.push(g);return g}
function addRack(x,y){let n=addNode(x,y,{slider:{ox:x,oy:y,angle:0,range:520}});const r={id:idFor('r'),node:n.id,length:190,gearId:null,offset:0,side:1,anchorX:0};M.racks.push(r);return r}
// Cremalheira: q é deslocamento ESCALAR ao longo da guia (não coordenada X).
// θ é rotação no plano, u=(cosθ,sinθ), n=(-sinθ,cosθ).
// Para rolamento sem deslizamento em contato lateral s: q + s*r*φ = const.
// Limite de contato: o ponto de tangência precisa permanecer nos dentes da barra.
function rackMotionHalf(r){const ss=node(r.node).slider;return r.gearId?Math.min(ss.range/2,Math.max(0,r.length/2-16)):ss.range/2}
function rackAnchorAt(r,offset){const n=node(r.node),{u}=rackAxes(r);return {x:n.x+u.x*offset,y:n.y+u.y*offset}}
function rackAnchor(r){return rackAnchorAt(r,r.anchorX||0)}
function scissorHeightLimits(g){return {lo:Math.max(20,g.diagonal*.20),hi:g.diagonal*.985}}
function rackLinkQBounds(r){const l=rackLink(r.id);if(!l)return {lo:-Infinity,hi:Infinity};const g=scissor(l.scissorId);if(!g)return {lo:-Infinity,hi:Infinity};const b=scissorHeightLimits(g);return {lo:l.q0+b.lo-l.h0,hi:l.q0+b.hi-l.h0}}
function rackAllowedQ(r){const half=rackMotionHalf(r),b=rackLinkQBounds(r);return {lo:Math.max(-half,b.lo),hi:Math.min(half,b.hi)}}
// União real: a origem superior do pantógrafo fica fixa, e o ponto inferior
// se movimenta na mesma reta que a guia da cremalheira. Não é simples alinhamento.
function attachRackScissor(r,g,slot='custom',offset=0){
 if(!r||!g||rackLink(r.id)||scissorLink(g.id))return false;
 const s=node(r.node)?.slider;if(!s)return false;
 // O ponto móvel do pantógrafo exige que a guia da cremalheira seja paralela ao eixo local V.
 g.angle=normDeg(s.angle-90);const {v}=localAxes(g.angle),a=rackAnchorAt(r,offsetForRackPort(r,slot,offset));
 g.x=a.x-g.height*v.x;g.y=a.y-g.height*v.y;
 const l={id:idFor('j'),rackId:r.id,scissorId:g.id,slot,offset,q0:rackQ(r),h0:g.height};
 M.pinLinks.push(l);placeScissor(g);return true;
}
function detachPinLink(id){const l=(M.pinLinks||[]).find(a=>a.id===id);if(!l)return;M.pinLinks=M.pinLinks.filter(a=>a.id!==id);toast('Articulação desfeita. Os componentes voltaram a ser independentes.');}
function rebaseRackAnchor(r){const l=rackLink(r.id);if(!l)return;const g=scissor(l.scissorId);if(!g)return;const a=rackAnchorAt(r,offsetForRackPort(r,l.slot||'custom',l.offset||0)),v=localAxes(g.angle).v;l.q0=rackQ(r);l.h0=g.height;g.x=a.x-g.height*v.x;g.y=a.y-g.height*v.y;placeScissor(g)}
function setRackAnchor(r,x){r.anchorX=clamp(x,-r.length/2+6,r.length/2-6);rebaseRackAnchor(r)}
function applyPinLinks(){for(const l of M.pinLinks||[]){const r=rack(l.rackId),g=scissor(l.scissorId);if(!r||!g)continue;const {lo,hi}=scissorHeightLimits(g);g.height=clamp(l.h0+rackQ(r)-l.q0,lo,hi)}}
// A porta representa um ponto mecânico REAL no corpo (não apenas um ícone visual).
// Junta revoluta entre nós: compartilha um único nó no solucionador.
// Pivô livre + porta na cremalheira: seguidor preso à guia, calculado a cada frame.
// Cremalheira + drive do pantógrafo: ligação de 1 DOF já implementada em pinLinks.
const rackSlots=['start','center','end','custom'];
function offsetForRackPort(r,slot='custom',stored=0){
  if(slot==='start')return -r.length/2+8;
  if(slot==='end')return r.length/2-8;
  if(slot==='center')return 0;
  return slot==='custom'?(r.anchorX||0):Number(stored)||0;
}
function portPoint(port){if(!port)return null;
  if(port.kind==='node'){const n=node(port.nodeId);return n?{x:n.x,y:n.y}:null}
  if(port.kind==='rack'){const r=rack(port.rackId);return r?rackAnchorAt(r,offsetForRackPort(r,port.slot,port.offset)):null}
  return null;
}
function portId(p){return p.kind==='node'?'n:'+p.nodeId:'r:'+p.rackId+':'+p.slot}
function portName(p){
 if(p.kind==='rack')return 'Cremalheira '+p.rackId.toUpperCase()+' · '+({start:'início',center:'centro',end:'fim',custom:'âncora ajustável'}[p.slot]||'ponto');
 const n=node(p.nodeId),g=M.gears.find(g=>g.node===p.nodeId),s=scissorForNode(p.nodeId);
 if(g)return 'Eixo '+g.id.toUpperCase();if(s)return (s.driveId===p.nodeId?'Acionamento ':'Pivô ')+s.id.toUpperCase();
 return (n?.fixed?'Apoio ':'Pivô ')+p.nodeId.toUpperCase();
}
function getJointPorts(){const ports=[];
 for(const n of M.nodes)if(!M.racks.some(r=>r.node===n.id))ports.push({kind:'node',nodeId:n.id});
 for(const r of M.racks){for(const slot of rackSlots){const off=offsetForRackPort(r,slot);
  if(ports.some(p=>p.kind==='rack'&&p.rackId===r.id&&Math.abs(offsetForRackPort(r,p.slot,p.offset)-off)<2))continue;
  ports.push({kind:'rack',rackId:r.id,slot,offset:off});
 }}return ports;
}
function closestPort(p,radius=18/cam.scale,excluded=null){let found=null,nearest=radius;
 for(const port of getJointPorts()){
   if(excluded&&portId(port)===portId(excluded))continue;
   const q=portPoint(port);if(!q)continue;const d=dist(p,q);
   if(d<nearest){found=port;nearest=d}
 }
 return found;
}
function pointLinkOfNode(id){return (M.pointLinks||[]).find(l=>l.nodeId===id)||null}
function eligibleFreePivot(id){const n=node(id);return !!(n&&!n.fixed&&!n.slider&&!n.follower&&!scissorForNode(id)&&!M.gears.some(g=>g.node===id)&&!M.racks.some(r=>r.node===id)&&!pointLinkOfNode(id))}
function compatiblePorts(a,b){if(!a||!b)return 'Selecione duas portas.';
 if(portId(a)===portId(b))return 'Escolha pontos diferentes.';
 if(a.kind==='node'&&b.kind==='node')return validateNodeJoint(M,a.nodeId,b.nodeId);
 if(a.kind==='rack'&&b.kind==='rack')return 'Duas cremalheiras exigem uma transmissão ou barra de ligação.';
 const rp=a.kind==='rack'?a:b,np=a.kind==='node'?a:b;
 if(rp.kind==='rack'&&np.kind==='node'){
   const n=node(np.nodeId);if(!n)return 'Ponto inexistente.';
   if(n.fixed||n.slider||M.racks.some(r=>r.node===np.nodeId)||M.gears.some(g=>g.node===np.nodeId))
     return 'Eixos fixos e pontos guiados não podem seguir uma cremalheira sem articulação adicional.';
   if((M.pointLinks||[]).some(l=>l.nodeId===n.id))return 'Este vértice já está unido a uma cremalheira.';
   return null;
 }
 return 'Portas incompatíveis.';
}
function scissorHasContacts(group){return !!group&&isConnectedScissor(M,group)}
function movePortAssemblyForSnap(a,b){
 const p=portPoint(a),q=portPoint(b);if(!p||!q)return false;
 // Preferir mover o pantógrafo sem mudar sua orientação, apenas se ainda não estiver ancorado.
 const pGroup=a.kind==='node'?scissorForNode(a.nodeId):null;
 const qGroup=b.kind==='node'?scissorForNode(b.nodeId):null;
 if(qGroup&&!scissorHasContacts(qGroup)){
  translateScissorToVertex(qGroup,b.nodeId,p,M.nodes);placeScissor(qGroup);return true;
 }
 if(pGroup&&!scissorHasContacts(pGroup)){
  translateScissorToVertex(pGroup,a.nodeId,q,M.nodes);placeScissor(pGroup);return true;
 }
 if(a.kind==='node'&&eligibleFreePivot(a.nodeId)){
  const n=node(a.nodeId);n.x=q.x;n.y=q.y;return true;
 }
 if(b.kind==='node'&&eligibleFreePivot(b.nodeId)){
  const n=node(b.nodeId);n.x=p.x;n.y=p.y;return true;
 }
 return true; // caso conectado: resolver simultaneamente as restrições, sem teletransporte
}
function connectJointPorts(a,b){
 const reason=compatiblePorts(a,b);if(reason){toast(reason,true);return false}
 const before=JSON.stringify(M),oldStable=stablePose;
 movePortAssemblyForSnap(a,b);
 const link={id:idFor('j')};
 if(a.kind==='node'&&b.kind==='node'){
   link.a=a.nodeId;link.b=b.nodeId;(M.nodeLinks||(M.nodeLinks=[])).push(link);
 }else{
   const rp=a.kind==='rack'?a:b,np=a.kind==='node'?a:b;
   Object.assign(link,{rackId:rp.rackId,nodeId:np.nodeId,slot:rp.slot,offset:rp.offset});
   M.pointLinks.push(link);
 }
 joiningPorts=true;let result;try{result=solve(260)}finally{joiningPorts=false}
 if(!Number.isFinite(result)||result>.6){
    M=JSON.parse(before);stablePose=oldStable;solve(100);
    toast('Ligação não criada: a montagem ficaria incompatível ('+fmt(result,2)+' mm). Destrave um apoio ou revise as cotas.',true);
    return false;
 }
 toast('◉ Vértices conectados. A orientação e as medidas rígidas foram preservadas.');return true;
}
function jointsForNode(id){
 return [...(M.pointLinks||[]).filter(l=>l.nodeId===id).map(l=>({...l,kind:'rack-node'})),
 ...(M.nodeLinks||[]).filter(l=>l.a===id||l.b===id).map(l=>({...l,kind:'node-node'})),
 ...(M.pinLinks||[]).filter(l=>scissor(l.scissorId)?.driveId===id).map(l=>({...l,kind:'legacy-pin'}))];
}
function jointsForScissor(g){
 const ids=new Set([...g.topIds,...g.bottomIds,...g.centerIds]);
 return [...(M.pointLinks||[]).filter(l=>ids.has(l.nodeId)).map(l=>({...l,kind:'rack-node'})),
 ...(M.nodeLinks||[]).filter(l=>ids.has(l.a)||ids.has(l.b)).map(l=>({...l,kind:'node-node'})),
 ...(M.pinLinks||[]).filter(l=>l.scissorId===g.id).map(l=>({...l,kind:'legacy-pin'}))];
}
function jointDescription(l){
 if(l.kind==='legacy-pin')return `Cremalheira ${l.rackId.toUpperCase()} ↔ pantógrafo ${l.scissorId.toUpperCase()}`;
 if(l.kind==='rack-node')return `${l.nodeId.toUpperCase()} ↔ ${l.rackId.toUpperCase()} (${l.slot==='custom'?'âncora':l.slot})`;
 return `${l.a.toUpperCase()} ↔ ${l.b.toUpperCase()}`;
}
function renderJointControls(links){return links.length?`<div class="prop-group"><div class="prop-title">Conexões individuais · ${links.length}</div><div class="tips">Desconecte sem apagar o pantógrafo ou as demais ferramentas.</div>${links.map(l=>`<div class="joint-entry"><span>◉ ${str(jointDescription(l))}</span><button class="btn mini" data-act="detachJoint" data-link-id="${str(l.id)}" title="Soltar apenas esta junta">Desunir</button></div>`).join('')}</div>`:''}
function detachJoint(id){
 const old=jointCount();M.pointLinks=(M.pointLinks||[]).filter(l=>l.id!==id);
 M.nodeLinks=(M.nodeLinks||[]).filter(l=>l.id!==id);
 M.pinLinks=(M.pinLinks||[]).filter(l=>l.id!==id);
 if(jointCount()===old)return false;
 stablePose=null;solve(140);render();renderProperties();toast('Junta desacoplada. As peças foram preservadas.');return true;
}
function removePointLink(id){return detachJoint(id)}
function jointsForPort(p){
 if(!p)return [];
 if(p.kind==='node')return jointsForNode(p.nodeId);
 return [...(M.pointLinks||[]).filter(l=>l.rackId===p.rackId&&l.slot===p.slot).map(l=>({...l,kind:'rack-node'})),
 ...(M.pinLinks||[]).filter(l=>l.rackId===p.rackId&&(l.slot||'custom')===p.slot).map(l=>({...l,kind:'legacy-pin'}))];
}
function disconnectNear(p){
 const ports=getJointPorts();let best=null,d=24/cam.scale;
 for(const port of ports){const at=portPoint(port);if(!at)continue;const links=jointsForPort(port);if(!links.length)continue;const dd=dist(at,p);if(dd<d){d=dd;best={port,links}}}
 if(!best){toast('Toque em um vértice com junta. Ou selecione o pantógrafo e desuna pelo inspetor.',true);return false;}
 return detachJoint(best.links[best.links.length-1].id);
}
function jointCount(){return (M.pinLinks?.length||0)+(M.pointLinks?.length||0)+(M.nodeLinks?.length||0)}
function bestSnapCandidate(maxRadius=20/cam.scale){let best=null,bestD=maxRadius;
 for(const r of M.racks)for(const g of M.scissors||[]){
  if(rackLink(r.id)||scissorLink(g.id))continue;
  const ap=rackAnchor(r),dp=node(g.driveId);if(!dp)continue;
  const d=dist(ap,dp);if(d<bestD){bestD=d;best={kind:'pin',rackId:r.id,scissorId:g.id,point:ap,distance:d}}
 }
 return best;
}
function eligibleSnapPivot(id){return !!node(id)}
function bestPivotSnap(sourceId,radius=20/cam.scale){if(!node(sourceId))return null;const from=node(sourceId);let best=null,dmin=radius;
 for(const port of getJointPorts()){
   const first={kind:'node',nodeId:sourceId};if(compatiblePorts(first,port))continue;
   const dest=portPoint(port);if(!dest)continue;
   const d=dist(from,dest);if(d<dmin){dmin=d;best={kind:'port',source:first,target:port,point:dest,distance:d}}
 }return best;
}
function mergeCoincidentPivots(sourceId,targetId){if(!eligibleFreePivot(sourceId)||!eligibleSnapPivot(targetId))return false;
 const a=node(sourceId),b=node(targetId);if(!a||!b)return false;
 const backup=JSON.stringify(M);a.x=b.x;a.y=b.y;
 for(const bar of M.bars){if(bar.a===sourceId)bar.a=targetId;if(bar.b===sourceId)bar.b=targetId}
 M.bars=M.bars.filter(bar=>bar.a!==bar.b);
 for(const align of M.aligns){if(align.a===sourceId)align.a=targetId;if(align.b===sourceId)align.b=targetId}
 for(const l of M.pointLinks||[])if(l.nodeId===sourceId)l.nodeId=targetId;
 M.aligns=M.aligns.filter(c=>c.a!==c.b);M.nodes=M.nodes.filter(n=>n.id!==sourceId);
 const err=solve(260);if(err>2||!Number.isFinite(err)){
   M=JSON.parse(backup);solve(120);toast('Pivôs próximos, mas unir deformaria as barras existentes. Ajuste a geometria.',true);return false;
 }
 toast('◉ Pivôs unidos: agora compartilham uma única articulação.');return true;
}
function rackAxes(r){const a=rad(node(r.node).slider.angle);return {u:{x:Math.cos(a),y:Math.sin(a)},v:{x:-Math.sin(a),y:Math.cos(a)}}}
function rackQ(r){const n=node(r.node),s=n.slider,u=rackAxes(r).u;return dot({x:n.x-s.ox,y:n.y-s.oy},u)}
function placeRack(r){const n=node(r.node),s=n.slider,{u,v}=rackAxes(r),g=r.gearId?gear(r.gearId):null;
  if(g){const c=node(g.node);s.ox=c.x+(r.side||1)*(g.radius+RACK_CLEARANCE)*v.x;s.oy=c.y+(r.side||1)*(g.radius+RACK_CLEARANCE)*v.y}
  const q=g?r.offset-(r.side||1)*g.radius*g.angle:rackQ(r),lim=rackMotionHalf(r),qc=clamp(q,-lim,lim);
  n.x=s.ox+qc*u.x;n.y=s.oy+qc*u.y;return qc;
}
function connectRack(r,g,side=null){
  if(g.type!=='gear'){toast('A cremalheira precisa de uma engrenagem dentada.',true);return false}
  const n=node(r.node),c=node(g.node),{u,v}=rackAxes(r),delta={x:n.x-c.x,y:n.y-c.y};
  const q=clamp(dot(delta,u),-n.slider.range/2,n.slider.range/2);
  r.side=side===null?(dot(delta,v)<-8?-1:1):side;
  r.gearId=g.id;r.offset=clamp(q,-rackMotionHalf(r),rackMotionHalf(r))+r.side*g.radius*g.angle;
  placeRack(r);return true;
}
function rotateRack(r,angle){
  const n=node(r.node),s=n.slider,oldQ=rackQ(r),oldPos={x:n.x,y:n.y};
  s.angle=normDeg(angle);
  if(r.gearId){const g=gear(r.gearId);if(g){r.offset=oldQ+r.side*g.radius*g.angle;placeRack(r)}}
  else {const {u}=rackAxes(r);s.ox=oldPos.x-oldQ*u.x;s.oy=oldPos.y-oldQ*u.y;placeRack(r)}
  const link=rackLink(r.id);if(link){const g=scissor(link.scissorId);if(g){rebaseRackAnchor(r)}}
}
function flipRackSide(r,side){if(!r.gearId){r.side=side;return}const q=rackQ(r),g=gear(r.gearId);r.side=side;r.offset=q+side*g.radius*g.angle;placeRack(r)}
function disconnectRack(r){const n=node(r.node);r.gearId=null;r.offset=0;n.slider.ox=n.x;n.slider.oy=n.y;r.side=1}
function gearRelations(root){
  const relation=new Map([[root.id,{a:1,b:0}]]),todo=[root];
  for(let i=0;i<todo.length;i++){const g=todo[i],v=relation.get(g.id);
    for(const m of M.mates){let to=null,k=1,ph=0;
      if(m.a===g.id){to=gear(m.b);const b=to;if(!b)continue;k=(m.type==='gear'?-1:1)*g.radius/b.radius;ph=m.phase}
      else if(m.b===g.id){to=gear(m.a);if(!to)continue;k=1/((m.type==='gear'?-1:1)*to.radius/g.radius);ph=-m.phase*k}
      if(to&&!relation.has(to.id)){relation.set(to.id,{a:k*v.a,b:k*v.b+ph});todo.push(to)}
    }
  }
  return relation;
}
function boundGearAngle(root,requested,relation){let lo=-Infinity,hi=Infinity;
  for(const r of M.racks){const v=relation.get(r.gearId);if(!v)continue;const g=gear(r.gearId);
    const c=-(r.side||1)*g.radius*v.a, b=r.offset-(r.side||1)*g.radius*v.b,range=rackAllowedQ(r);
    if(Math.abs(c)<1e-12){if(b<range.lo-1e-4||b>range.hi+1e-4)return {value:requested,invalid:true};continue}
    const x=(range.lo-b)/c,y=(range.hi-b)/c;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));
  }
  return lo>hi?{value:requested,invalid:true}:{value:clamp(requested,lo,hi),limited:requested<lo-1e-7||requested>hi+1e-7};
}
function addMate(a,b,type='gear'){
  if(!a||!b||a.id===b.id){toast('Selecione duas rodas diferentes.',true);return false}
  if(M.mates.some(x=>(x.a===a.id&&x.b===b.id)||(x.a===b.id&&x.b===a.id))){toast('Essas rodas já estão acopladas.',true);return false}
  if(type==='gear'&&(a.type!=='gear'||b.type!=='gear')){toast('Engrenar exige duas engrenagens.',true);return false}
  const na=node(a.node),nb=node(b.node);
  if(type==='gear'){
    if(Math.abs(a.module-b.module)>.0001){
      const occupied=M.bars.some(v=>v.a===nb.id||v.b===nb.id)||M.mates.some(v=>v.a===b.id||v.b===b.id)||M.racks.some(v=>v.gearId===b.id);
      if(occupied){toast('Engrenagens já conectadas devem ter o mesmo módulo.',true);return false}
      b.module=a.module;b.radius=b.module*b.teeth/2;
    }
    const target=a.radius+b.radius, d=dist(na,nb);
    if(Math.abs(d-target)>1){
      const occupied=M.bars.some(v=>v.a===nb.id||v.b===nb.id)||M.mates.some(v=>v.a===b.id||v.b===b.id)||M.racks.some(v=>v.gearId===b.id);
      if(occupied){toast('Ajuste os centros: distância necessária '+fmt(target)+' mm.',true);return false}
      const ux=d>1e-5?(nb.x-na.x)/d:1,uy=d>1e-5?(nb.y-na.y)/d:0;
      nb.x=na.x+ux*target;nb.y=na.y+uy*target;toast('Centros ajustados para '+fmt(target)+' mm.');
    }
  }
  let ratio=a.radius/b.radius;
  const s=type==='gear'?-1:1;
  M.mates.push({id:idFor('m'),a:a.id,b:b.id,type,phase:b.angle-s*ratio*a.angle});
  return true;
}
function addFollower(g){const c=node(g.node);const a=g.angle;const off=g.radius*.66;const n=addNode(c.x+Math.cos(a)*off,c.y+Math.sin(a)*off,{follower:{gear:g.id,rx:off,ry:0}});return n}
function motorTarget(){return M.bars.find(b=>b.motor)||M.gears.find(g=>g.motor)||M.nodes.find(n=>n.motor)}
function removeMotors(){M.bars.forEach(b=>b.motor=null);M.gears.forEach(g=>g.motor=null);M.nodes.forEach(n=>n.motor=null)}
function makeMotor(kind,obj,mode='motor'){
  if(kind==='bar'){
    const a=node(obj.a),b=node(obj.b);
    if(!(a.fixed||b.fixed)){toast('Motor em barra exige uma extremidade fixa ao solo.',true);return false}
    if(a.fixed&&b.fixed){toast('A barra tem ambos os pivôs fixos.',true);return false}
    if(a.follower||b.follower){toast('Motor de barra não pode atuar diretamente sobre pino excêntrico.',true);return false}
    const an=Math.atan2(b.y-a.y,b.x-a.x);removeMotors();obj.motor=mode==='spring'?{type:'spring',base:an,target:an-rad(100),tau:.85}:{type:'motor',rpm:8,base:an};
  }else if(kind==='gear'){
    removeMotors();obj.motor=mode==='spring'?{type:'spring',start:obj.angle,target:obj.angle+rad(110),tau:.85}:{type:'motor',rpm:8};M.gears.forEach(g=>g.baseAngle=g.angle);
  }else if(kind==='node'){
    if(!obj.slider){toast('O motor linear exige um pivô sobre guia.',true);return false}
    removeMotors();obj.motor=mode==='spring'?{type:'spring',startOffset:0,targetOffset:Math.min(110,obj.slider.range*.35),tau:.9}:{type:'motor',rpm:6,amplitude:Math.min(55,obj.slider.range*.36),phase:0};
    obj.slider.ox=obj.x;obj.slider.oy=obj.y;
  }else return false;
  t=0;playing=false;updatePlay();solve();toast(mode==='spring'?'Abertura idealizada por mola configurada.':'Motor instalado. Ajuste a velocidade nas propriedades.');return true;
}
function setTool(next){pendingPort=null;hoverPort=null;inverseDragInfo=null;inverseGhost=null;if(['alignX','alignY'].includes(next)&&multi.length===2){useTwoSelection(next==='alignX'?'x':'y');next='select'}tool=next;pending=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===next));$('modeBadge').innerHTML='FERRAMENTA <span>'+({select:'TESTAR',move:'MOVER CONJUNTO',rotate:'ROTACIONAR',joint:'UNIR PONTOS',node:'PIVÔ LIVRE',fixed:'APOIO FIXO',bar:'BARRA',slider:'GUIA LINEAR',gear:'ENGRENAGEM',pulley:'POLIA',rack:'CREMALHEIRA',mesh:'ENGRENAR',belt:'CORREIA',rackmesh:'PINHÃO + CREMALHEIRA',eccentric:'PINO EXCÊNTRICO',motor:'MOTOR',spring:'MOLA IDEALIZADA',alignX:'ALINHAR X',alignY:'ALINHAR Y',unlink:'DESUNIR JUNTA',delete:'EXCLUIR'}[next]||next.toUpperCase())+'</span>';
  const texts={unlink:'<strong>Desunir (U):</strong> toque em um ponto com conexão para soltar somente uma junta. Para escolher entre várias conexões, selecione o pantógrafo no inspetor.',joint:'<strong>Juntas cinemáticas:</strong> toque em dois pontos de conexão. Cremalheiras oferecem início, centro, fim e âncora móvel; eixos e pivôs aparecem como círculos. Juntas incompatíveis são recusadas.',move:'<strong>Posicionar:</strong> arraste uma peça para mover o conjunto conectado sem alterar os comprimentos, o engrenamento ou o ângulo das engrenagens.',select:'<strong>V9 · Arraste inverso:</strong> puxe um pivô, a extremidade de uma barra, cremalheira, pinhão ou ponto de acionamento do pantógrafo. O sistema busca a posição válida mais próxima sem deformar as barras. Para reposicionar conjuntos, use G.',rotate:'<strong>Rotacionar:</strong> arraste uma cremalheira em torno do seu centro, uma barra em torno do pivô ou gire uma roda. Use Shift para ângulos de 15°.',node:'<strong>Pivô livre:</strong> clique na área para posicionar um novo ponto móvel.',fixed:'<strong>Apoio fixo:</strong> clique em um pivô para fixá-lo, ou no fundo para criar um.',bar:'<strong>Barra:</strong> clique em dois pivôs. Se clicar no fundo, um pivô novo será criado.',slider:'<strong>Guia linear:</strong> clique em um pivô (ou fundo). Ajuste o ângulo no inspetor.',gear:'<strong>Engrenagem:</strong> clique para criar uma roda com eixo fixo. Edite dentes e módulo.',pulley:'<strong>Polia:</strong> clique para posicionar uma polia. Ligue duas com «Correia».',rack:'<strong>Cremalheira:</strong> clique para inserir. Rotacione pelo círculo ⤾ ou com a ferramenta R.',mesh:'<strong>Engrenar:</strong> clique em duas engrenagens. A segunda é reposicionada se estiver isolada.',belt:'<strong>Correia:</strong> clique em duas polias/rodas. O giro será no mesmo sentido.',rackmesh:'<strong>Pinhão + cremalheira:</strong> clique na engrenagem e na cremalheira. Repita para conectar mais trilhos na mesma engrenagem.',eccentric:'<strong>Pino excêntrico:</strong> clique numa roda para criar ponto solidário à sua rotação.',motor:'<strong>Motor:</strong> clique numa roda, barra com apoio fixo ou pivô sobre guia.',spring:'<strong>Mola idealizada:</strong> clique em barra com apoio fixo, engrenagem ou cursor. A animação avança até uma posição-alvo; não calcula forças.',alignX:'<strong>Alinhar X:</strong> clique em dois pivôs para manter a mesma coordenada X.',alignY:'<strong>Alinhar Y:</strong> clique em dois pivôs para manter a mesma coordenada Y.',delete:'<strong>Excluir:</strong> clique em um componente para removê-lo.'};$('toolHint').innerHTML=texts[next];stage.classList.toggle('mode-select',next==='select');render();}
function sizeView(){const w=Math.max(stage.clientWidth,100),h=Math.max(stage.clientHeight,100);view={w:w/cam.scale,h:h/cam.scale,x:cam.x-w/(2*cam.scale),y:cam.y-h/(2*cam.scale)};stage.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);return view}
function ptOf(e){const r=stage.getBoundingClientRect();return {x:view.x+((e.clientX-r.left)/r.width)*view.w,y:view.y+((e.clientY-r.top)/r.height)*view.h}}
function hitNode(p){let best=null,bestD=18/cam.scale;for(const n of M.nodes){let d=dist(p,n);if(d<bestD){best=n;bestD=d}}return best}
function hitGear(p){let best=null,bestD=Infinity;for(const g of M.gears){const n=node(g.node),d=dist(n,p);if(d<g.radius+10/cam.scale&&d<bestD){best=g;bestD=d}}return best}
function hitRack(p){return M.racks.find(r=>{const n=node(r.node),{u,v}=rackAxes(r),d={x:p.x-n.x,y:p.y-n.y};return Math.abs(dot(d,u))<r.length/2+9/cam.scale&&Math.abs(dot(d,v))<18/cam.scale})||null}
function rackRotateHandle(r){const n=node(r.node),{v}=rackAxes(r);return {x:n.x-48*v.x,y:n.y-48*v.y}}
function hitRackRotate(p){for(const r of M.racks){if(sel?.type!=='rack'||sel.id!==r.id)continue;const h=rackRotateHandle(r);if(dist(h,p)<15/cam.scale)return r}return null}
function hitBar(p){let best=null,bestD=14/cam.scale;for(const b of M.bars){const a=node(b.a),z=node(b.b),vx=z.x-a.x,vy=z.y-a.y,len2=vx*vx+vy*vy;if(len2<1e-8)continue;let u=clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/len2,0,1);let d=Math.hypot(p.x-(a.x+u*vx),p.y-(a.y+u*vy));if(d<bestD){best=b;bestD=d}}return best}
function hit(p){
  for(const gg of M.scissors||[]){if(dist(scissorRotateHandle(gg),p)<16/cam.scale||dist(scissorMoveHandle(gg),p)<16/cam.scale)return {type:'scissor',id:gg.id}}
  const r=hitRack(p);if(r)return {type:'rack',id:r.id};
  const g=hitGear(p);if(g)return {type:'gear',id:g.id};
  const n=hitNode(p);if(n)return {type:'node',id:n.id};
  const b=hitBar(p);if(b)return {type:'bar',id:b.id};return null;
}
function lockPos(n,locks){locks.set(n.id,{x:n.x,y:n.y})}
function updateGears(){
  const seen=new Set();
  for(const start of M.gears){if(seen.has(start.id))continue;
    const group=gearRelations(start),ids=[...group.keys()];ids.forEach(id=>seen.add(id));
    const requestedId=manualDrive?.kind==='gear'?manualDrive.id:manualDrive?.kind==='rack'?rack(manualDrive.id)?.gearId:null;
    const root=(requestedId&&ids.includes(requestedId)?gear(requestedId):null)||ids.map(id=>gear(id)).find(g=>g.motor)||start;
    const rel=gearRelations(root);
    let desired;
    if(manualDrive?.kind==='gear'&&root.id===manualDrive.id)desired=manualDrive.angle;
    else if(manualDrive?.kind==='rack'&&rack(manualDrive.id)?.gearId===root.id){const rr=rack(manualDrive.id);desired=(rr.offset-manualDrive.q)/((rr.side||1)*root.radius)}
    else desired=root.motor?.type==='spring'?(root.motor.target+(root.motor.start-root.motor.target)*Math.exp(-t/Math.max(root.motor.tau,.05))):root.baseAngle+(root.motor?rad(root.motor.rpm*6)*t:0);
    const bounded=boundGearAngle(root,desired,rel);
    if(bounded.limited&&playing){playing=false;updatePlay();toast('Fim do curso de uma cremalheira da transmissão.');}
    root.angle=bounded.value;
    for(const [id,v] of rel){const g=gear(id);g.angle=v.a*root.angle+v.b;}
  }
}
function clampManualRack(q,r){const lim=rackAllowedQ(r);return clamp(q,lim.lo,lim.hi)}
function getPose(){return {
 nodes:M.nodes.map(n=>({id:n.id,x:n.x,y:n.y})),
 gears:M.gears.map(g=>({id:g.id,angle:g.angle,baseAngle:g.baseAngle})),
 scissors:(M.scissors||[]).map(g=>({id:g.id,x:g.x,y:g.y,height:g.height,angle:g.angle}))
}}
function restorePose(p){if(!p)return;
 for(const v of p.nodes){const n=node(v.id);if(n){n.x=v.x;n.y=v.y}}
 for(const v of p.gears){const g=gear(v.id);if(g){g.angle=v.angle;g.baseAngle=v.baseAngle}}
 for(const v of p.scissors){const g=scissor(v.id);if(g){g.x=v.x;g.y=v.y;g.height=v.height;g.angle=v.angle;placeScissor(g)}}
}
function scissorJointCount(g){return countScissorContacts(M,g)}
function scissorPrimaryContact(g){const ids=new Set([...g.topIds,...g.bottomIds,...g.centerIds]);
 const l=(M.pointLinks||[]).find(l=>ids.has(l.nodeId));if(l)return l.nodeId;
 const j=(M.nodeLinks||[]).find(j=>ids.has(j.a)||ids.has(j.b));return j?(ids.has(j.a)?j.a:j.b):null;
}
function solve(iter=200){
  const entryPose=getPose();
  updateGears();const locks=new Map();
  for(const n of M.nodes)if(n.fixed)lockPos(n,locks);
  for(const n of M.nodes)if(n.follower){const g=gear(n.follower.gear);if(!g)continue;const c=node(g.node),ca=Math.cos(g.angle),sa=Math.sin(g.angle);let x=c.x+n.follower.rx*ca-n.follower.ry*sa,y=c.y+n.follower.rx*sa+n.follower.ry*ca;n.x=x;n.y=y;locks.set(n.id,{x,y})}
  for(const b of M.bars)if(b.motor){const a=node(b.a),c=node(b.b),an=b.motor.type==='spring'?(b.motor.target+(b.motor.base-b.motor.target)*Math.exp(-t/Math.max(b.motor.tau,.05))):(b.motor.base+rad(b.motor.rpm*6)*t);if(a.fixed&&!c.fixed){const x=a.x+b.length*Math.cos(an),y=a.y+b.length*Math.sin(an);c.x=x;c.y=y;locks.set(c.id,{x,y})}else if(c.fixed&&!a.fixed){const x=c.x-b.length*Math.cos(an),y=c.y-b.length*Math.sin(an);a.x=x;a.y=y;locks.set(a.id,{x,y})}}
  for(const n of M.nodes)if(n.motor&&n.slider){const s=n.slider,an=rad(s.angle),q=n.motor.type==='spring'?(n.motor.targetOffset+(n.motor.startOffset-n.motor.targetOffset)*Math.exp(-t/Math.max(n.motor.tau,.05))):n.motor.amplitude*Math.sin(rad(n.motor.rpm*6)*t+n.motor.phase);const x=s.ox+q*Math.cos(an),y=s.oy+q*Math.sin(an);n.x=x;n.y=y;locks.set(n.id,{x,y})}
  for(const r of M.racks){const n=node(r.node);if(r.gearId&&gear(r.gearId)){placeRack(r);locks.set(n.id,{x:n.x,y:n.y})}
    else if(manualDrive?.kind==='rack'&&manualDrive.id===r.id){const q=clampManualRack(manualDrive.q,r),{u}=rackAxes(r),s=n.slider;n.x=s.ox+q*u.x;n.y=s.oy+q*u.y;locks.set(n.id,{x:n.x,y:n.y})}}
  applyPinLinks();
  if(manualDrive?.kind==='bar'){const b=bar(manualDrive.id);if(b){const a=node(b.a),z=node(b.b),anchor=manualDrive.anchor==='b'?z:a,moved=manualDrive.anchor==='b'?a:z,dir=manualDrive.anchor==='b'?-1:1;
    moved.x=anchor.x+dir*b.length*Math.cos(manualDrive.angle);moved.y=anchor.y+dir*b.length*Math.sin(manualDrive.angle);locks.set(moved.id,{x:moved.x,y:moved.y});if(!anchor.fixed)locks.set(anchor.id,{x:anchor.x,y:anchor.y})}}

  if(manualDrive?.kind==='node'){const n=node(manualDrive.id);if(n){n.x=manualDrive.x;n.y=manualDrive.y;locks.set(n.id,{x:n.x,y:n.y})}}
  // Pantógrafos paramétricos independentes: posição, ângulo e abertura livres.
  // A cinemática interna é exata; o resolvedor mantém as barras sem deformações.
  for(const group of M.scissors||[]){
    placeScissor(group);
    if(!scissorJointCount(group))for(const id of [...group.topIds,...group.bottomIds,...group.centerIds]){
      const n=node(id);if(n)locks.set(id,{x:n.x,y:n.y});
    }
  }
  // Um pivô unido à cremalheira é INTEIRAMENTE determinado por sua porta local.
  // O mesmo nó pode ser extremidade de várias barras rígidas.
  for(const l of M.pointLinks||[]){const n=node(l.nodeId),r=rack(l.rackId);if(!n||!r)continue;
    const p=rackAnchorAt(r,offsetForRackPort(r,l.slot||'custom',l.offset||0));
    if(!scissorForNode(n.id)){n.x=p.x;n.y=p.y;locks.set(n.id,{x:p.x,y:p.y});}
  }
  // V8: todas as restrições geométricas participam do mesmo sistema de equações.
  // Drives/apoios são condições de contorno rígidas. O restante é resolvido por
  // mínimos quadrados amortecidos; o projetor V7 permanece como fallback seguro.
  const pinned=new Map();
  for(const [id,p] of locks){pinned.set(`${id}.x`,p.x);pinned.set(`${id}.y`,p.y)}
  for(const g of M.gears)pinned.set(`${g.id}.angle`,g.angle); // transmissões motorizadas seguem a fase da V7
  for(const g of M.scissors||[]){const contacts=scissorJointCount(g);if(!contacts||scissorLink(g.id)){pinned.set(`${g.id}.x`,g.x);pinned.set(`${g.id}.y`,g.y)}if(contacts<2||scissorLink(g.id))pinned.set(`${g.id}.height`,g.height);pinned.set(`${g.id}.angle`,rad(g.angle))}
  const solved=solveConstraints(M,{pins:pinned,iterations:clamp(Math.ceil(iter/24)+2,3,12),tolerance:.02,acceptResidual:.50,maxVariables:160,strict:true});
  lastSolveInfo=solved;
  const lenErr=b=>{const a=node(b.a),c=node(b.b);return Math.abs(dist(a,c)-b.length)};
  if(!solved.ok){
    // Modelos antigos, cadeias incompatíveis ou muito grandes continuam editáveis.
    for(let k=0;k<Math.min(iter,160);k++){
      for(const b of M.bars){if(isDraftBar(b))continue;let a=node(b.a),c=node(b.b),dx=c.x-a.x,dy=c.y-a.y,d=Math.hypot(dx,dy);if(d<1e-9){dx=1;dy=0;d=1}const er=(d-b.length)/d,wa=locks.has(a.id)?0:1,wc=locks.has(c.id)?0:1,sum=wa+wc;if(sum>0){a.x+=dx*er*wa/sum;a.y+=dy*er*wa/sum;c.x-=dx*er*wc/sum;c.y-=dy*er*wc/sum}}
      for(const c of M.aligns){const a=node(c.a),b=node(c.b);if(!a||!b)continue;const ax=c.axis==='x'?'x':'y',v=(a[ax]-b[ax]),wa=locks.has(a.id)?0:1,wb=locks.has(b.id)?0:1,sum=wa+wb;if(sum>0){a[ax]-=v*wa/sum;b[ax]+=v*wb/sum}}
      for(const n of M.nodes)if(n.slider&&!locks.has(n.id)){const s=n.slider,angle=rad(s.angle),u=Math.cos(angle),v=Math.sin(angle),d=(n.x-s.ox)*u+(n.y-s.oy)*v,q=clamp(d,-s.range/2,s.range/2);n.x=s.ox+q*u;n.y=s.oy+q*v}
      for(const [id,p] of locks){const n=node(id);if(n){n.x=p.x;n.y=p.y}}
    }
  }
  maxResidual=0;for(const b of M.bars)if(!isDraftBar(b))maxResidual=Math.max(maxResidual,lenErr(b));for(const a of M.aligns){let na=node(a.a),nb=node(a.b);if(na&&nb)maxResidual=Math.max(maxResidual,Math.abs(na[a.axis]-nb[a.axis]))}
  for(const r of M.racks)if(r.gearId){const g=gear(r.gearId),rn=node(r.node);if(g&&rn){const {u,v}=rackAxes(r),c=node(g.node),d={x:rn.x-c.x,y:rn.y-c.y};maxResidual=Math.max(maxResidual,Math.abs(r.offset-(r.side||1)*g.radius*g.angle-dot({x:rn.x-rn.slider.ox,y:rn.y-rn.slider.oy},u)));maxResidual=Math.max(maxResidual,Math.abs(dot(d,v)-(r.side||1)*(g.radius+RACK_CLEARANCE)))}}
  for(const l of M.pinLinks||[]){const rr=rack(l.rackId),gg=scissor(l.scissorId);if(rr&&gg){const a=rackAnchorAt(rr,offsetForRackPort(rr,l.slot||'custom',l.offset||0)),d=node(gg.driveId);if(d)maxResidual=Math.max(maxResidual,dist(a,d));}}
  for(const l of M.pointLinks||[]){const rr=rack(l.rackId),nn=node(l.nodeId);if(rr&&nn)maxResidual=Math.max(maxResidual,dist(rackAnchorAt(rr,offsetForRackPort(rr,l.slot||'custom',l.offset||0)),nn));}
  for(const l of M.nodeLinks||[]){const a=node(l.a),b=node(l.b);if(a&&b)maxResidual=Math.max(maxResidual,dist(a,b));}
  for(const m of M.mates)if(m.type==='gear'){const a=gear(m.a),b=gear(m.b);if(a&&b)maxResidual=Math.max(maxResidual,Math.abs(dist(node(a.node),node(b.node))-a.radius-b.radius),Math.abs(a.module-b.module))}
  // Comprimento da barra em rascunho é atualizado conscientemente somente nesse modo.
  for(const b of M.bars)if(isDraftBar(b)){const a=node(b.a),z=node(b.b);if(a&&z)b.length=dist(a,z)}
  if(maxResidual>.45&&!joiningPorts&&(playing||manualDrive||drag)&&stablePose){
    restorePose(stablePose);maxResidual=0;
    if(playing){playing=false;updatePlay()}
    if(performance.now()-invalidPoseWarningAt>1600){invalidPoseWarningAt=performance.now();toast('Movimento interrompido: uma barra travada atingiu o limite sem deformar.',true)}
  }else if(maxResidual<.3){stablePose=getPose()}
  return maxResidual;
}
function str(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function pointsGear(g){const n=g.teeth,N=n*4,r=g.radius,arr=[];for(let i=0;i<N;i++){let phi=TAU*i/N+g.angle;let r2=r+([0,1,1,0][i%4]?2.8:-3.3);arr.push(`${(r2*Math.cos(phi)).toFixed(2)},${(r2*Math.sin(phi)).toFixed(2)}`)}return arr.join(' ')}
function sceneSVG(){
  const bgs=[];const v=sizeView();let s=`<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#28404a" stroke-width=".7" opacity=".38"/></pattern><pattern id="major" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#3b5862" stroke-width="1.1" opacity=".36"/></pattern></defs>`;
  s+=`<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="#121f27"/><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="url(#grid)"/><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="url(#major)"/>`;
  s+=`<line x1="${v.x}" x2="${v.x+v.w}" y1="0" y2="0" stroke="#4e6870" stroke-opacity=".25"/><line y1="${v.y}" y2="${v.y+v.h}" x1="0" x2="0" stroke="#4e6870" stroke-opacity=".25"/>`;
  for(const c of M.aligns){const a=node(c.a),b=node(c.b);if(!a||!b)continue;s+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7aa4ac" stroke-width="1.5" stroke-dasharray="3 6" opacity=".6"/>`}
  for(const n of M.nodes)if(n.slider){const q=n.slider,dx=Math.cos(rad(q.angle))*q.range/2,dy=Math.sin(rad(q.angle))*q.range/2;
    s+=`<line data-kind="guide" data-id="${n.id}" x1="${q.ox-dx}" y1="${q.oy-dy}" x2="${q.ox+dx}" y2="${q.oy+dy}" stroke="#506f79" stroke-width="12" stroke-linecap="round" opacity=".25"/><line x1="${q.ox-dx}" y1="${q.oy-dy}" x2="${q.ox+dx}" y2="${q.oy+dy}" stroke="#8cb9c0" stroke-width="1.8" stroke-dasharray="7 5" opacity=".8"/>`;
    s+=`<line data-kind="guide" data-id="${n.id}" x1="${q.ox-dx}" y1="${q.oy-dy}" x2="${q.ox+dx}" y2="${q.oy+dy}" stroke="transparent" stroke-width="${Math.max(18,22/cam.scale)}" pointer-events="stroke"/>`;
    for(const mult of [-1,1])s+=`<line x1="${q.ox+dx*mult-5*Math.sin(rad(q.angle))}" y1="${q.oy+dy*mult+5*Math.cos(rad(q.angle))}" x2="${q.ox+dx*mult+5*Math.sin(rad(q.angle))}" y2="${q.oy+dy*mult-5*Math.cos(rad(q.angle))}" stroke="#97b7c0" stroke-width="2"/>`;
  }
  for(const m of M.mates){const a=gear(m.a),b=gear(m.b);if(!a||!b)continue;const na=node(a.node),nb=node(b.node);if(m.type==='belt'){
      let dx=nb.x-na.x,dy=nb.y-na.y,d=Math.hypot(dx,dy),an=Math.atan2(dy,dx),al=Math.asin(clamp((a.radius-b.radius)/Math.max(d,1),-.9,.9));
      for(const sign of [-1,1]){let phi=an+sign*(Math.PI/2+al),xa=na.x+a.radius*Math.cos(phi),ya=na.y+a.radius*Math.sin(phi),xb=nb.x+b.radius*Math.cos(phi),yb=nb.y+b.radius*Math.sin(phi);s+=`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#f2c37f" stroke-width="3.2" stroke-opacity=".68"/>`}
    }else{s+=`<line x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="#6cae9a" stroke-width="1.3" stroke-dasharray="3 5" opacity=".3"/>`}}
  for(const [index,r] of M.racks.entries()){const n=node(r.node),highlight=sel?.type==='rack'&&sel.id===r.id,side=r.side||1;let teeth='';
    const pitch=Math.PI*(r.gearId&&gear(r.gearId)?gear(r.gearId).module:3.5),h=Math.min(8,5.5*(pitch/11)),toothWidth=pitch*.55;
    for(let x=-r.length/2+6;x<r.length/2-pitch;x+=pitch)teeth+=`<path d="M${x} ${-9*side}v${-h*side}h${toothWidth}v${h*side}" fill="none" stroke="#e8c483" stroke-width="2.2"/>`;
    s+=`<g data-kind="rack" data-id="${r.id}" transform="translate(${n.x},${n.y}) rotate(${node(r.node).slider.angle})"><rect x="${-r.length/2}" y="-8" width="${r.length}" height="22" rx="3" fill="#6f8b92" fill-opacity=".7" stroke="${highlight?'#aaffdc':'#b2c7c9'}" stroke-width="${highlight?3:1.5}"/>${teeth}<line x1="${-r.length/2+4}" y1="6" x2="${r.length/2-4}" y2="6" stroke="#365660" stroke-width="2"/><rect x="${-r.length/2}" y="-19" width="${r.length}" height="35" fill="transparent"/></g>`;
    s+=`<text transform="translate(${n.x},${n.y}) rotate(${node(r.node).slider.angle})" x="0" y="${side*36}" text-anchor="middle" fill="#94bfc3" font-size="10" pointer-events="none">R${index+1} · ${fmt(node(r.node).slider.angle,0)}°</text>`;
    if(highlight){const hp=rackRotateHandle(r);s+=`<line x1="${n.x}" y1="${n.y}" x2="${hp.x}" y2="${hp.y}" stroke="#f4be78" stroke-width="1.4" stroke-dasharray="4 5" pointer-events="none"/><circle data-kind="rack-rotate" data-id="${r.id}" cx="${hp.x}" cy="${hp.y}" r="${12/cam.scale+3}" stroke="#f4be78" fill="#644c2c" stroke-width="2"/><text x="${hp.x}" y="${hp.y+4}" text-anchor="middle" font-size="14" fill="#fff3da" pointer-events="none">⤾</text>`}
  }
  for(const b of M.bars){let a=node(b.a),c=node(b.b),hi=sel?.type==='bar'&&sel.id===b.id;let col=isDraftBar(b)?'#e5bc79':b.motor?(b.motor.type==='spring'?'#b8a0f9':'#f4be78'):'#76c7bf';
    s+=`<g data-kind="bar" data-id="${b.id}"><line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${hi?'#b3ffe0':'#2c4955'}" stroke-width="${hi?18:16}" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${col}" stroke-width="10" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#c5fff2" stroke-opacity=".26" stroke-width="2" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="transparent" stroke-width="25"/></g>`;
    let mx=(a.x+c.x)/2,my=(a.y+c.y)/2;s+=`<text x="${mx}" y="${my-11}" text-anchor="middle" font-size="10" fill="#98d8cb" pointer-events="none">${isDraftBar(b)?'✎ ': '🔒 '}${fmt(b.length,0)}${b.motor?(b.motor.type==='spring'?' ⌁':' ↻'):''}</text>`;
  }
  for(const g of M.gears){const n=node(g.node),hi=sel?.type==='gear'&&sel.id===g.id;let col=g.motor?(g.motor.type==='spring'?'#b8a0f9':'#f6c17f'):g.type==='pulley'?'#8fb8e4':'#76d6b9';
    s+=`<g data-kind="gear" data-id="${g.id}" transform="translate(${n.x} ${n.y})">`;
    if(g.type==='gear'){s+=`<polygon points="${pointsGear(g)}" fill="${hi?'#315b51':'#25443f'}" stroke="${hi?'#d0ffe9':col}" stroke-width="${hi?3:1.7}"/>`}
    else{s+=`<circle r="${g.radius}" fill="${hi?'#31495f':'#253c52'}" stroke="${col}" stroke-width="${hi?4:3}"/><circle r="${g.radius-5}" fill="none" stroke="#4c7b9b" stroke-width="1.5"/>`}
    const sp=4;for(let i=0;i<sp;i++){let a=g.angle+TAU*i/sp;s+=`<line x1="${Math.cos(a)*9}" y1="${Math.sin(a)*9}" x2="${Math.cos(a)*(g.radius-9)}" y2="${Math.sin(a)*(g.radius-9)}" stroke="${col}" stroke-width="5" opacity=".6" stroke-linecap="round"/>`}
    s+=`<circle r="10" fill="#142a32" stroke="${col}" stroke-width="2.2"/><circle r="3" fill="${col}"/><circle r="${g.radius+2}" fill="transparent" stroke="transparent" stroke-width="10"/><text y="${-g.radius-12}" text-anchor="middle" fill="#b8d8d5" font-size="11" pointer-events="none">${g.type==='gear'?'Z'+g.teeth:'Polia'}${g.motor?(g.motor.type==='spring'?' · mola':' · motor'):''}</text></g>`}
  for(const n of M.nodes){let hi=sel?.type==='node'&&sel.id===n.id;
    if(n.fixed){s+=`<path d="M${n.x-12} ${n.y+16}L${n.x+12} ${n.y+16}L${n.x} ${n.y+5}Z" fill="#687f90" stroke="#a2b8c0" stroke-width="1.5"/><line x1="${n.x-16}" y1="${n.y+19}" x2="${n.x+16}" y2="${n.y+19}" stroke="#88a5ad" stroke-width="2"/>`}
    if(n.slider){s+=`<rect x="${n.x-12}" y="${n.y-10}" width="24" height="20" rx="4" fill="#223f4c" stroke="${hi?'#b3ffe0':'#9fc6cd'}" stroke-width="2" transform="rotate(${n.slider.angle} ${n.x} ${n.y})"/>`}
    let col=n.follower?'#f6c17f':n.fixed?'#becbd0':'#74dfbd';s+=`<circle data-kind="node" data-id="${n.id}" cx="${n.x}" cy="${n.y}" r="${hi?8.5:6.5}" fill="#152831" stroke="${hi?'#ffffff':col}" stroke-width="${hi?3.7:2.7}"/><circle data-kind="node" data-id="${n.id}" cx="${n.x}" cy="${n.y}" r="${11/cam.scale+4}" fill="transparent"/>`;
  }
  if(tool==='joint'||tool==='unlink')for(const gg of M.scissors||[]){
    for(const id of [...gg.topIds,...gg.bottomIds,...gg.centerIds]){const p=node(id);if(!p)continue;
      s+=`<circle data-port-kind="node" data-port-id="${id}" cx="${p.x}" cy="${p.y}" r="${Math.max(10,14/cam.scale)}" fill="#255d55" fill-opacity=".65" stroke="#a5ffe0" stroke-width="2.5"/>`;
    }
  }
  for(const gg of M.scissors||[]){
    const mid=scissorMoveHandle(gg),rot=scissorRotateHandle(gg),drive=node(gg.driveId),hi=sel?.type==='scissor'&&sel.id===gg.id;
    const {u,v}=localAxes(gg.angle),W=scissorWidth(gg)*gg.stages,H=gg.height;
    const P=(x,y)=>({x:gg.x+x*u.x+y*v.x,y:gg.y+x*u.y+y*v.y});
    const corners=[P(0,0),P(W,0),P(W,H),P(0,H)];
    s+=`<polygon points="${corners.map(q=>q.x+','+q.y).join(' ')}" fill="${hi?'#83e6c0':'#65e0ba'}" fill-opacity=".035" stroke="#70bcaa" stroke-opacity=".35" stroke-dasharray="6 6" pointer-events="none"/>`;
    s+=`<g data-kind="scissor" data-id="${gg.id}"><circle cx="${mid.x}" cy="${mid.y}" r="${15/cam.scale+3}" fill="#264844" stroke="#8eebd1" stroke-width="2"/><text x="${mid.x}" y="${mid.y+5}" text-anchor="middle" font-size="16" fill="#d1ffee" pointer-events="none">✥</text><line x1="${mid.x}" y1="${mid.y}" x2="${rot.x}" y2="${rot.y}" stroke="#efa95a" stroke-width="1.7" stroke-dasharray="4 4" pointer-events="none"/><circle data-kind="scissor-rotate" data-id="${gg.id}" cx="${rot.x}" cy="${rot.y}" r="${13/cam.scale+2}" fill="#523a27" stroke="#f7bf76" stroke-width="2.4"/><text x="${rot.x}" y="${rot.y+4}" font-size="15" text-anchor="middle" fill="#fff2d5" pointer-events="none">⤾</text></g>`;
    if(drive){s+=`<circle data-kind="scissor-drive" data-id="${gg.id}" cx="${drive.x}" cy="${drive.y}" r="${14/cam.scale+2}" fill="#6b4f29" stroke="#ffd38e" stroke-width="2.5"/><text x="${drive.x}" y="${drive.y+4}" text-anchor="middle" font-size="12" fill="#fff1d2" pointer-events="none">↕</text>`}
    s+=`<text x="${mid.x+20}" y="${mid.y-15}" font-size="10" fill="#a9dacb" pointer-events="none">${gg.stages} X · ${fmt(gg.angle,0)}°</text>`;
  }
  // Âncoras móveis: sempre visíveis sobre o corpo dentado; ficam soldadas à cremalheira.
  for(const r of M.racks){const a=rackAnchor(r),n=node(r.node),hi=sel?.type==='rack'&&sel.id===r.id,connected=!!rackLink(r.id);
    if(Math.abs(r.anchorX||0)>1)s+=`<line x1="${n.x}" y1="${n.y}" x2="${a.x}" y2="${a.y}" stroke="#dcb885" stroke-width="1.4" stroke-dasharray="3 3" pointer-events="none"/>`;
    s+=`<circle data-kind="rack-anchor" data-id="${r.id}" cx="${a.x}" cy="${a.y}" r="${Math.max(8,11/cam.scale)}" stroke="${connected?'#91f0c5':'#f4c986'}" stroke-width="${hi?3.4:2.5}" fill="#203b41"/>`;
    s+=`<circle cx="${a.x}" cy="${a.y}" r="3.3" fill="${connected?'#91f0c5':'#f4c986'}" pointer-events="none"/>`;
  }
  for(const l of M.pinLinks||[]){const r=rack(l.rackId),g=scissor(l.scissorId);if(!r||!g)continue;const a=rackAnchorAt(r,offsetForRackPort(r,l.slot||'custom',l.offset||0)),d=node(g.driveId),b=node(g.topIds[0]);if(!d||!b)continue;
    s+=`<circle cx="${a.x}" cy="${a.y}" r="${15/cam.scale+3}" fill="none" stroke="#93f6cf" stroke-width="2" stroke-dasharray="5 4" pointer-events="none"/>`;
    s+=`<circle cx="${b.x}" cy="${b.y}" r="6" fill="#173d46" stroke="#95bdc9" stroke-width="2" pointer-events="none"/>`;
    s+=`<circle data-kind="scissor-drive" data-id="${g.id}" cx="${d.x}" cy="${d.y}" r="${Math.max(11,14/cam.scale)}" fill="#24524c" stroke="#a4ffd6" stroke-width="3"/><text x="${d.x}" y="${d.y+5}" font-size="14" text-anchor="middle" fill="white" pointer-events="none">↕</text>`;
  }
  // Portas visíveis: extremidades das cremalheiras + centros das rodas e pivôs.
  // Pontos físicos acessíveis por clique (inclusive no celular), dimensionados no plano de tela.
  for(const r of M.racks){for(const slot of rackSlots){
    const offset=offsetForRackPort(r,slot),a=rackAnchorAt(r,offset);
    if(slot!=='custom'&&Math.abs(offset-(r.anchorX||0))<2)continue;
    const isUsed=(M.pointLinks||[]).some(l=>l.rackId===r.id&&l.slot===slot)||(M.pinLinks||[]).some(l=>l.rackId===r.id&&(l.slot||'custom')===slot);
    const show=tool==='joint'||tool==='unlink'||sel?.type==='rack'&&sel.id===r.id||isUsed;
    if(show)s+=`<circle data-port-kind="rack" data-port-id="${r.id}" data-port-slot="${slot}" cx="${a.x}" cy="${a.y}" r="${Math.max(5,7/cam.scale)}" fill="${isUsed?'#4dd8b7':'#25383f'}" stroke="${isUsed?'#ddfff4':'#edc68b'}" stroke-width="2.2"/>`;
  }}
  for(const l of M.nodeLinks||[]){const a=node(l.a),b=node(l.b);if(!a||!b)continue;s+=`<circle cx="${(a.x+b.x)/2}" cy="${(a.y+b.y)/2}" r="${13/cam.scale}" fill="none" stroke="#77f0ce" stroke-width="2.5" stroke-dasharray="4 3" pointer-events="none"/>`;}
  for(const l of M.pointLinks||[]){const r=rack(l.rackId),n=node(l.nodeId);if(!r||!n)continue;
    const p=rackAnchorAt(r,offsetForRackPort(r,l.slot,l.offset));
    s+=`<circle cx="${p.x}" cy="${p.y}" r="${14/cam.scale}" fill="none" stroke="#70e5ce" stroke-width="2.5" stroke-dasharray="4 3" pointer-events="none"/>`;
  }
  if(tool==='joint'||tool==='unlink')for(const port of getJointPorts()){
    if(port.kind!=='node')continue;const p=portPoint(port);if(!p)continue;
    const isHover=hoverPort&&portId(hoverPort)===portId(port);
    s+=`<circle data-port-kind="node" data-port-id="${port.nodeId}" cx="${p.x}" cy="${p.y}" r="${Math.max(5,(isHover?12:8)/cam.scale)}" fill="#12252d" fill-opacity=".92" stroke="${isHover?'#adffdd':'#78c8c8'}" stroke-width="2"/>`;
  }
  if(pendingPort){const q=portPoint(pendingPort);if(q){s+=`<circle cx="${q.x}" cy="${q.y}" r="${19/cam.scale}" fill="#a1ffdf" fill-opacity=".1" stroke="#b2ffe1" stroke-width="2.5" pointer-events="none"/><line x1="${q.x}" y1="${q.y}" x2="${pointer.x}" y2="${pointer.y}" stroke="#99dfd3" stroke-width="1.7" stroke-dasharray="6 5" pointer-events="none"/>`}}
  if(hoverPort&&tool==='joint'){
    const p=portPoint(hoverPort);if(p){const err=pendingPort?compatiblePorts(pendingPort,hoverPort):null;
      s+=`<circle cx="${p.x}" cy="${p.y}" r="${16/cam.scale}" fill="${err?'#f7ba8d':'#8ff6d3'}" fill-opacity=".12" stroke="${err?'#f4a49b':'#afffe0'}" stroke-width="2.5" pointer-events="none"/>`;
    }
  }
  if(snapCandidate){const a=snapCandidate.point;s+=`<circle cx="${a.x}" cy="${a.y}" r="${20/cam.scale}" fill="#9cf5b6" fill-opacity=".16" stroke="#b5ffde" stroke-width="2.5" stroke-dasharray="4 3" pointer-events="none"/><text x="${a.x+18/cam.scale}" y="${a.y-18/cam.scale}" fill="#ddffef" font-size="${12/cam.scale}" pointer-events="none">SOLTAR PARA CONECTAR</text>`;}
  // Zonas de interferência e posições críticas. São marcadores de geometria 2D, não contato dinâmico.
  if(geometryOverlayVisible&&geometryReport){
    for(const hit of geometryReport.collisions.slice(0,25)){
      const p=hit.at,rr=15/cam.scale;
      s+=`<circle cx="${p.x}" cy="${p.y}" r="${rr*1.55}" fill="#fb6c69" fill-opacity=".14" stroke="#ff807b" stroke-width="${2/cam.scale}" stroke-dasharray="${4/cam.scale} ${3/cam.scale}" pointer-events="none"/><path d="M${p.x-rr/2},${p.y-rr/2}l${rr},${rr}m0,-${rr}l-${rr},${rr}" stroke="#ff9989" stroke-width="${2/cam.scale}" pointer-events="none"/>`;
    }
    for(const hit of geometryReport.singularities.slice(0,18)){
      const p=hit.at,rr=17/cam.scale;
      s+=`<circle cx="${p.x}" cy="${p.y}" r="${rr}" fill="#ffb85b" fill-opacity=".12" stroke="#ffcd7a" stroke-width="${1.8/cam.scale}" stroke-dasharray="${3/cam.scale} ${3/cam.scale}" pointer-events="none"/><text x="${p.x+rr}" y="${p.y-rr}" font-size="${12/cam.scale}" fill="#ffdb9f" pointer-events="none">△</text>`;
    }
  }
  if(drag?.kind?.startsWith('ik')&&inverseGhost){
   const r=inverseGhost,show=r.goal&&r.actual&&Math.hypot(r.goal.x-r.actual.x,r.goal.y-r.actual.y)>5;
   if(show){s+=`<line x1="${r.actual.x}" y1="${r.actual.y}" x2="${r.goal.x}" y2="${r.goal.y}" stroke="#f4c57c" stroke-width="${1.5/cam.scale}" stroke-dasharray="${5/cam.scale} ${4/cam.scale}" opacity=".65" pointer-events="none"/><circle cx="${r.goal.x}" cy="${r.goal.y}" r="${10/cam.scale}" fill="none" stroke="#f5c782" stroke-width="${1.5/cam.scale}" stroke-dasharray="${3/cam.scale} ${3/cam.scale}" pointer-events="none"/>`;}
 }
 if(multi.length){for(const item of multi){const pos=entityPosition(item);if(pos)s+=`<circle cx="${pos.x}" cy="${pos.y}" r="${20/cam.scale+4}" stroke="#f7bf76" stroke-width="2.5" fill="none" pointer-events="none"/>`}}
  if(pending){const first=pending.id,kind=pending.kind;let p0=kind==='object'?entityPosition(pending):kind==='gear'?node(gear(first)?.node):kind==='rack'?node(rack(first)?.node):node(first);if(p0){s+=`<line x1="${p0.x}" y1="${p0.y}" x2="${pointer.x}" y2="${pointer.y}" stroke="#f6c17f" stroke-width="2" stroke-dasharray="8 5" pointer-events="none"/><circle cx="${p0.x}" cy="${p0.y}" r="13" fill="none" stroke="#f6c17f" stroke-width="2" pointer-events="none"/>`}}
  return s;
}
function render(){inspectGeometry();stage.innerHTML=sceneSVG();const safetyBadge=$('geometryBadge');if(safetyBadge){const d=geometryReport;safetyBadge.textContent=d.collisions.length?'⚠ '+d.collisions.length+' INTERFERÊNCIA(S)':d.singularities.length?'△ '+d.singularities.length+' POSIÇÃO(ÕES) CRÍTICA(S)':'◇ SEM INTERFERÊNCIA DETECTADA';safetyBadge.classList.toggle('geometry-danger',d.collisions.length>0);safetyBadge.classList.toggle('geometry-caution',!d.collisions.length&&d.singularities.length>0);safetyBadge.title='Análise 2D aproximada; abra Geometria para detalhes.';}const solverBadge=$('solverBadge');if(solverBadge){const ok=lastSolveInfo.ok&&maxResidual<.55;solverBadge.textContent=ok?'◇ SOLUCIONADOR · OK':'◇ RESTRIÇÕES · VERIFICAR';solverBadge.classList.toggle('solver-warning',!ok);solverBadge.title='V9: restrições globais prioritárias; arraste inverso por meta suave. Erro máximo: '+fmt(maxResidual,2)+' mm';if(drag?.kind?.startsWith('ik')&&inverseDragInfo){solverBadge.textContent=inverseDragInfo.blocked?'◇ MOVIMENTO BLOQUEADO':inverseDragInfo.limitReached?'◇ LIMITE DE CURSO':'◇ ARRASTE INVERSO · OK';solverBadge.classList.toggle('solver-warning',inverseDragInfo.blocked);}}if($('numJoints'))$('numJoints').textContent=jointCount();if($('jointBadge'))$('jointBadge').textContent=pendingPort?'SEGUNDO PONTO':'◉ '+jointCount()+' JUNTA(S)';$('numNodes').textContent=M.nodes.length;$('numBars').textContent=M.bars.length;$('numGears').textContent=M.gears.length;$('residual').textContent=fmt(maxResidual,1)+' mm';$('residual').style.color=maxResidual>1?'#f58b85':'#cceae1'}
function select(type,id,keepMulti=false){sel=type?{type,id}:null;if(!keepMulti)multi=[];renderProperties();render()}
function optRow(label,id,val,step='1',kind='number',min=''){return `<label class="field"><span>${label}</span><input data-prop="${id}" type="${kind}" ${kind==='number'?`step="${step}"`:''} ${min!==''?`min="${min}"`:''} value="${str(val)}"></label>`}
function checkRow(label,id,value){return `<label class="field"><span>${label}</span><input type="checkbox" data-prop="${id}" ${value?'checked':''}></label>`}
function toolButtons(deleteAllowed=true){return `<div class="prop-btns">${deleteAllowed?'<button class="btn warn mini" data-act="delete">✕ Excluir</button>':''}<button class="btn mini" data-act="fit">⊡ Enquadrar</button></div>`}
function renderProperties(){const p=$('properties'),h=$('inspectorTitle'),sub=$('inspectorSubtitle');if(multi.length===2){h.textContent='Alinhar dois objetos';sub.textContent='A primeira seleção é a referência; o segundo objeto será reposicionado, preservando seu conjunto conectado.';p.innerHTML='<div class="multi-objects">1º: '+multi[0].type+' '+multi[0].id+'<br>2º: '+multi[1].type+' '+multi[1].id+'<div class="prop-btns"><button class="btn mini primary" data-act="alignSelectionX">║ Alinhar X</button><button class="btn mini primary" data-act="alignSelectionY">═ Alinhar Y</button></div></div>';return}if(!sel){h.textContent='Propriedades';sub.textContent='Selecione um componente para modificar seus parâmetros.';p.innerHTML='<div class="placeholder">Clique em um pivô, barra, roda ou cremalheira para editar suas propriedades.<br><br>Para criar uma barra, clique em dois pontos.</div>';return}
  let html='',item=null;
  if(sel.type==='guide'){item=node(sel.id);if(!item?.slider){select(null);return;}const g=item.slider;
    h.textContent='Guia linear '+item.id.toUpperCase();sub.textContent='Trilho reposicionável com cursor prismático; arraste a linha para mover o conjunto.';
    html='<div class="prop-group"><div class="prop-title">Posição da guia · mm</div>'+optRow('Origem X','guideX',fmtRaw(g.ox))+optRow('Origem Y','guideY',fmtRaw(g.oy))+optRow('Rotação (°)','guideAngle',fmtRaw(g.angle))+optRow('Curso total (mm)','guideRange',fmtRaw(g.range),10,'number','20')+'</div><div class="tips">Arraste a linha tracejada para reposicionar o trilho junto com os componentes conectados. Modo R: rotacione em torno da origem.</div><div class="prop-btns"><button class="btn mini" data-act="moveGuide">✥ Mover guia</button><button class="btn mini" data-act="rotateGuide">⤾ Girar guia</button></div>';
    html+=renderJointControls(jointsForNode(item.id));
  }else if(sel.type==='node'){item=node(sel.id);if(!item){select(null);return}h.textContent='Pivô '+item.id.toUpperCase();sub.textContent=item.follower?'Pino excêntrico ligado a uma roda':item.fixed?'Apoio fixo ao solo':item.slider?'Cursor sobre guia linear':'Articulação móvel no plano';html='<div class="prop-group"><div class="prop-title">Posição (mm)</div>'+optRow('Coordenada X','x',fmtRaw(item.x))+optRow('Coordenada Y','y',fmtRaw(item.y))+checkRow('Preso ao solo','fixed',item.fixed)+'</div>';if(item.slider){html+='<div class="prop-group"><div class="prop-title">Guia de translação</div>'+optRow('Inclinação (°)','sliderAngle',item.slider.angle)+optRow('Curso total (mm)','sliderRange',item.slider.range,1,'number','20')+'</div>';}if(item.follower){html+='<div class="prop-group"><div class="prop-title">Excêntrico</div>'+optRow('Raio local X (mm)','followX',item.follower.rx)+optRow('Raio local Y (mm)','followY',item.follower.ry)+'</div>';}if(item.motor){html+=item.motor.type==='spring'?'<div class="prop-group"><div class="prop-title">Mola linear idealizada</div>'+optRow('Curso alvo (mm)','targetOffset',item.motor.targetOffset)+optRow('Tempo característico (s)','tau',item.motor.tau,.05,'number','.05')+'</div>':'<div class="prop-group"><div class="prop-title">Motor linear oscilante</div>'+optRow('Ciclos/min','rpm',item.motor.rpm,.5)+optRow('Amplitude (mm)','amplitude',item.motor.amplitude)+'</div>'}else if(item.slider&&!item.follower)html+='<div class="prop-btns"><button class="btn mini" data-act="motor">↻ Motor linear</button><button class="btn mini" data-act="spring">⌁ Mola</button></div>';
  }else if(sel.type==='bar'){item=bar(sel.id);if(!item){select(null);return}h.textContent='Barra '+item.id.toUpperCase();sub.textContent=isDraftBar(item)?'Barra em dimensionamento, com comprimento editável.':'Barra rígida: comprimento travado durante movimentos e animações.';html='<div class="prop-group"><div class="prop-title">Estado da dimensão</div><div class="tips">'+(isDraftBar(item)?'✎ Rascunho: o comprimento pode variar enquanto você encontra a medida.':'🔒 Travada: o comprimento não pode variar por acionamento, ligação ou solução numérica.')+'</div><div class="prop-btns"><button class="btn mini primary" data-act="'+(isDraftBar(item)?'lockBar':'draftBar')+'">'+(isDraftBar(item)?'🔒 Fixar dimensão atual':'✎ Liberar para dimensionar')+'</button></div></div><div class="prop-group"><div class="prop-title">Geometria</div>'+(isDraftBar(item)?optRow('Comprimento (mm)','length',fmtRaw(item.length)):optRow('Comprimento travado (mm)','length',fmtRaw(item.length)).replace('data-prop="length"','data-prop="length" disabled aria-disabled="true"'))+optRow('Orientação (°)','barAngle',fmtRaw(deg(Math.atan2(node(item.b).y-node(item.a).y,node(item.b).x-node(item.a).x))))+'<div class="tips">'+(isDraftBar(item)?'Ajuste esta dimensão no rascunho; fixe quando definir a medida final.':'Para alterar a cota, primeiro escolha Liberar para dimensionar.')+'</div></div>';if(item.motor)html+=item.motor.type==='spring'?'<div class="prop-group"><div class="prop-title">Mola angular idealizada</div>'+optRow('Ângulo final (°)','targetAngle',deg(item.motor.target),1)+optRow('Tempo característico (s)','tau',item.motor.tau,.05,'number','.05')+'</div>':'<div class="prop-group"><div class="prop-title">Motor angular</div>'+optRow('Rotação (rpm)','rpm',item.motor.rpm,.5)+optRow('Fase inicial (°)','baseAngle',deg(item.motor.base),1)+'</div>';else html+='<div class="prop-btns"><button class="btn mini" data-act="motor">↻ Aplicar motor</button><button class="btn mini" data-act="spring">⌁ Mola</button></div>';}
  else if(sel.type==='gear'){item=gear(sel.id);if(!item){select(null);return}h.textContent=(item.type==='gear'?'Engrenagem ':'Polia ')+item.id.toUpperCase();sub.textContent=item.type==='gear'?'Transmissão angular por número de dentes.':'Transmissão angular idealizada por correia sem escorregamento.';html='<div class="prop-group"><div class="prop-title">Posição e movimento</div>'+optRow('Centro X','gearX',fmtRaw(node(item.node).x))+optRow('Centro Y','gearY',fmtRaw(node(item.node).y))+optRow('Ângulo (°)','gearAngle',fmtRaw(deg(item.angle)))+'</div><div class="prop-group"><div class="prop-title">Dimensões</div>'+optRow('Dentes / referência','teeth',item.teeth,1,'number','8')+optRow('Módulo / passo (mm)','module',item.module,.1,'number','.5')+`<div class="tips">Raio primitivo: ${fmt(item.radius,2)} mm · diâmetro: ${fmt(2*item.radius,1)} mm</div></div>`;if(item.motor)html+=item.motor.type==='spring'?'<div class="prop-group"><div class="prop-title">Mola angular idealizada</div>'+optRow('Ângulo final (°)','targetAngle',deg(item.motor.target),1)+optRow('Tempo característico (s)','tau',item.motor.tau,.05,'number','.05')+'</div>':'<div class="prop-group"><div class="prop-title">Motor rotativo</div>'+optRow('Velocidade (rpm)','rpm',item.motor.rpm,.5)+'</div>';else html+='<div class="prop-btns"><button class="btn mini" data-act="motor">↻ Aplicar motor</button><button class="btn mini" data-act="spring">⌁ Mola</button><button class="btn mini" data-act="eccentric">◉ Pino excêntrico</button></div>';}
  else if(sel.type==='scissor'){
    item=scissor(sel.id);if(!item){select(null);return}
    h.textContent='Pantógrafo '+item.id.toUpperCase();sub.textContent='Módulo integrado ao projeto. Arraste ✥ para mover, ⤾ para girar e ↕ para variar a abertura.';
    html='<div class="prop-group"><div class="prop-title">Posição e geometria</div>'+optRow('Origem X (mm)','scX',fmtRaw(item.x))+optRow('Origem Y (mm)','scY',fmtRaw(item.y))+optRow('Rotação (°)','scAngle',fmtRaw(item.angle))+optRow('Altura do X (mm)','scHeight',fmtRaw(item.height))+`<div class="tips">${item.stages} estágios · diagonal ${fmt(item.diagonal,1)} mm · largura atual por X ${fmt(scissorWidth(item),1)} mm</div></div>`;
    const allJoints=jointsForScissor(item);const connections=allJoints.length;html+=`<div class="prop-group"><div class="prop-title">Pontos de articulação</div><div class="tips">${2*(item.stages+1)+item.stages} vértices disponíveis · ${connections} junta(s) universal(is). Em Unir pontos (J), escolha qualquer extremidade ou cruzamento. A rotação original é preservada.</div></div>`;
    html+=renderJointControls(allJoints);
    const link=scissorLink(item.id);if(link)html+=`<div class="prop-group"><div class="prop-title">Articulação ativa</div><div class="tips">Acoplado à cremalheira ${str(link.rackId.toUpperCase())}. Arraste ↕ para movimentar o pinhão. O apoio inicial fica ancorado.</div><div class="prop-btns"><button class="btn mini" data-act="unlinkPin">Desfazer união</button></div></div>`;
  }
  else if(sel.type==='rack'){item=rack(sel.id);if(!item){select(null);return}
    h.textContent='Cremalheira '+item.id.toUpperCase();sub.textContent=item.gearId?'Transmissão bidirecional sem escorregamento. Gire a orientação sem perder contato tangencial.':'Trilho dentado orientável; arraste, gire ou acople a um pinhão.';
    const nn=node(item.node),ss=nn.slider,q=rackQ(item),g=item.gearId?gear(item.gearId):null;
    html=`<div class="rack-movement"><strong>↔ Teste manual — sem iniciar animação</strong><p>Arraste este controle ou a peça na bancada. Um único pinhão pode transmitir movimento a várias cremalheiras.</p><input class="slider-rack" data-rack-slider="${item.id}" aria-label="Deslocamento da cremalheira ao longo da sua guia" type="range" min="${-rackMotionHalf(item)}" max="${rackMotionHalf(item)}" step=".5" value="${q}"><div class="tips">Deslocamento na guia: <strong id="rackPositionValue">${fmt(q,1)}</strong> mm</div></div>`+
      '<div class="prop-group"><div class="prop-title">Orientação e transmissão</div>'+optRow('Centro X (mm)','rackX',fmtRaw(nn.x))+optRow('Centro Y (mm)','rackY',fmtRaw(nn.y))+optRow('Rotação no plano (°)','rackAngle',ss.angle,1)+
      `<label class="field"><span>Lado de engrenamento</span><select data-prop="rackSide"><option value="1" ${item.side===1?'selected':''}>Lado +</option><option value="-1" ${item.side===-1?'selected':''}>Lado −</option></select></label>`+
      `<div class="tips">Gire pelo ⤾ no desenho ou use R. O lado muda o sentido da transmissão. Curso efetivo de engrenamento: ±${fmt(rackMotionHalf(item),1)} mm. ${g?'Pinhão: '+g.id.toUpperCase()+' · relação dx/dφ = '+fmt(-(item.side||1)*g.radius,1)+' mm/rad.':''}</div></div>`+
      '<div class="prop-group"><div class="prop-title">Dimensões e curso</div>'+optRow('Comprimento (mm)','length',item.length)+optRow('Curso da guia (mm)','rackRange',ss.range,10,'number','50')+'<div class="tips">O limite mais restritivo entre a guia e a extensão dentada prevalece.</div></div>';
    html+=`<div class="prop-group"><div class="prop-title">Ponto de conexão · deslizável</div><div class="tips">Arraste o ponto dourado diretamente na cremalheira ou selecione uma posição. Ele permanece solidário à barra durante a translação.</div><input class="slider-rack" data-anchor-slider="${item.id}" aria-label="Posição do ponto de conexão" type="range" min="${-item.length/2+6}" max="${item.length/2-6}" step="1" value="${item.anchorX||0}">${optRow('Posição a partir do centro (mm)','anchorX',fmtRaw(item.anchorX||0))}<div class="prop-btns"><button class="btn mini" data-act="anchorStart">◂ Início</button><button class="btn mini" data-act="anchorCenter">⊙ Centro</button><button class="btn mini" data-act="anchorEnd">Fim ▸</button></div></div>`;
    const link=rackLink(item.id);if(link)html+=`<div class="prop-group"><div class="prop-title">Junta cinemática ativa</div><div class="tips">Ligada ao pantógrafo ${str(link.scissorId.toUpperCase())}. O curso fica limitado pela abertura possível do X.</div><div class="prop-btns"><button class="btn mini" data-act="unlinkPin">Desfazer união</button></div></div>`;
    if(item.gearId)html+='<div class="prop-btns"><button class="btn mini" data-act="disconnectRack">Desacoplar pinhão</button></div>';
  }
  if(item?.motor)html+='<div class="prop-btns"><button class="btn mini warn" data-act="stopMotor">⏹ Remover acionamento</button></div>';
  const joins=(M.pointLinks||[]).filter(l=>sel.type==='node'?l.nodeId===sel.id:sel.type==='rack'?l.rackId===sel.id:false);
  if(sel.type==='node')html+=renderJointControls(jointsForNode(sel.id));
  if(sel.type==='rack')html+=renderJointControls((M.pointLinks||[]).filter(l=>l.rackId===sel.id).map(l=>({...l,kind:'rack-node'})));
  html+=`<hr style="border:0;border-top:1px solid #2d414b;margin:19px 0">`+toolButtons();p.innerHTML=html;
}
const fmtRaw=n=>String(Math.round(n*100)/100);
function applyProperty(field,value,checked){if(!sel)return;let obj=(sel.type==='node'||sel.type==='guide')?node(sel.id):sel.type==='bar'?bar(sel.id):sel.type==='gear'?gear(sel.id):sel.type==='scissor'?scissor(sel.id):rack(sel.id);if(!obj)return;let val=Number(value);if(!Number.isFinite(val)&&field!=='fixed')return;
  if(sel.type==='guide'){const n=obj,s=n.slider;if(!s)return;const dx=field==='guideX'?val-s.ox:0,dy=field==='guideY'?val-s.oy:0;if(field==='guideX'||field==='guideY')translateAssembly({type:'guide',id:n.id},dx,dy);if(field==='guideRange')s.range=Math.max(20,val);if(field==='guideAngle'){const q=(n.x-s.ox)*Math.cos(rad(s.angle))+(n.y-s.oy)*Math.sin(rad(s.angle));const r=M.racks.find(r=>r.node===n.id);if(r)rotateRack(r,val);else{s.angle=normDeg(val);n.x=s.ox+q*Math.cos(rad(s.angle));n.y=s.oy+q*Math.sin(rad(s.angle));}}}
  else if(field==='fixed'&&sel.type==='node'){obj.fixed=checked;if(checked){obj.slider=null;obj.motor=null} }
  else if(sel.type==='node'){
    if(field==='x'||field==='y'){obj[field]=val;if(obj.slider){obj.slider.ox=obj.x;obj.slider.oy=obj.y}}
    if(field==='sliderAngle'&&obj.slider)obj.slider.angle=val;
    if(field==='sliderRange'&&obj.slider)obj.slider.range=Math.max(20,val);
    if(field==='followX'&&obj.follower)obj.follower.rx=val;
    if(field==='followY'&&obj.follower)obj.follower.ry=val;
    if(field==='rpm'&&obj.motor)obj.motor.rpm=clamp(val,-120,120);
    if(field==='amplitude'&&obj.motor)obj.motor.amplitude=Math.max(0,val);
    if(field==='targetOffset'&&obj.motor?.type==='spring')obj.motor.targetOffset=val;
    if(field==='tau'&&obj.motor?.type==='spring')obj.motor.tau=clamp(val,.05,15);
  }else if(sel.type==='bar'){
    if(field==='barAngle'){const a=node(obj.a),z=node(obj.b),hold=a.fixed?'a':z.fixed?'b':'a',anchor=hold==='a'?a:z,moved=hold==='a'?z:a,sign=hold==='a'?1:-1;moved.x=anchor.x+sign*obj.length*Math.cos(rad(val));moved.y=anchor.y+sign*obj.length*Math.sin(rad(val));manualDrive={kind:'bar',id:obj.id,angle:rad(val),anchor:hold};solve(160);finishManual()}
    if(field==='length'){if(!isDraftBar(obj)){toast('Cota travada. Clique em «Liberar para dimensionar» antes de alterar a medida.',true);renderProperties();return;}obj.length=Math.max(5,val);const a=node(obj.a),z=node(obj.b),dx=z.x-a.x,dy=z.y-a.y,d=Math.max(1e-6,dist(a,z));if(!z.fixed){z.x=a.x+dx/d*obj.length;z.y=a.y+dy/d*obj.length}else if(!a.fixed){a.x=z.x-dx/d*obj.length;a.y=z.y-dy/d*obj.length}}
    if(field==='rpm'&&obj.motor)obj.motor.rpm=clamp(val,-120,120);
    if(field==='baseAngle'&&obj.motor)obj.motor.base=rad(val);
    if(field==='targetAngle'&&obj.motor?.type==='spring')obj.motor.target=rad(val);
    if(field==='tau'&&obj.motor?.type==='spring')obj.motor.tau=clamp(val,.05,15);
  }else if(sel.type==='gear'){
    if(field==='gearX'||field==='gearY'){const cur=node(obj.node);translateAssembly(sel,field==='gearX'?val-cur.x:0,field==='gearY'?val-cur.y:0)}
    if(field==='gearAngle'){manualDrive={kind:'gear',id:obj.id,angle:rad(val)};solve(140);finishManual()}
    if(field==='rpm'&&obj.motor)obj.motor.rpm=clamp(val,-120,120);
    if(field==='targetAngle'&&obj.motor?.type==='spring')obj.motor.target=rad(val);
    if(field==='tau'&&obj.motor?.type==='spring')obj.motor.tau=clamp(val,.05,15);
    if(field==='teeth')obj.teeth=Math.round(clamp(val,8,100));
    if(field==='module')obj.module=clamp(val,.5,10);
    if(['teeth','module'].includes(field)){obj.radius=obj.teeth*obj.module/2;for(let m of M.mates){const a=gear(m.a),b=gear(m.b);m.phase=b.angle-(m.type==='gear'?-1:1)*(a.radius/b.radius)*a.angle}for(let r of M.racks)if(r.gearId===obj.id){const q=rackQ(r);r.offset=q+(r.side||1)*obj.radius*obj.angle;placeRack(r)}}
  }else if(sel.type==='scissor'){const l=scissorLink(obj.id);if(l&&['scX','scY','scAngle','scHeight'].includes(field)){toast('A junta está conectada. Arraste o ponto ↕ para acionar ou desfaça a união para editar a geometria.',true);renderProperties();return}if(field==='scX')obj.x=val;if(field==='scY')obj.y=val;if(field==='scAngle')obj.angle=normDeg(val);if(field==='scHeight')obj.height=clamp(val,Math.min(25,obj.diagonal*.22),obj.diagonal*.98);placeScissor(obj);
  }else if(sel.type==='rack'){if(field==='rackX'||field==='rackY'){const n=node(obj.node);translateAssembly(sel,field==='rackX'?val-n.x:0,field==='rackY'?val-n.y:0)}if(field==='length')obj.length=Math.max(40,val);if(field==='rackRange')node(obj.node).slider.range=Math.max(50,val);if(field==='rackAngle')rotateRack(obj,val);if(field==='rackSide')flipRackSide(obj,val>=0?1:-1);if(field==='anchorX')setRackAnchor(obj,val)}
  solve();render();if(['guideX','guideY','guideAngle','guideRange','module','teeth','sliderAngle','length','fixed','rackRange','rackAngle','rackSide','barAngle','gearX','gearY','gearAngle','rackX','rackY','scX','scY','scAngle','scHeight'].includes(field))renderProperties();
}
function deleteItem(type,id){
 const group=groupForTarget({type,id});
 if(group){M.pinLinks=M.pinLinks.filter(l=>l.scissorId!==group.id);M.pointLinks=M.pointLinks.filter(l=>!([...group.topIds,...group.bottomIds,...group.centerIds].includes(l.nodeId)));M.nodeLinks=M.nodeLinks.filter(l=>!([...group.topIds,...group.bottomIds,...group.centerIds].includes(l.a)||[...group.topIds,...group.bottomIds,...group.centerIds].includes(l.b)));const ids=new Set([...group.topIds,...group.bottomIds,...group.centerIds]);M.nodes=M.nodes.filter(n=>!ids.has(n.id));M.bars=M.bars.filter(b=>!ids.has(b.a)&&!ids.has(b.b));M.aligns=M.aligns.filter(a=>!ids.has(a.a)&&!ids.has(a.b));M.scissors=M.scissors.filter(g=>g.id!==group.id);select(null);solve();render();toast('Módulo pantográfico removido.');return}

  if(type==='node'){M.nodeLinks=M.nodeLinks.filter(l=>l.a!==id&&l.b!==id);M.pointLinks=M.pointLinks.filter(l=>l.nodeId!==id&&rack(l.rackId)?.node!==id);M.pinLinks=M.pinLinks.filter(l=>rack(l.rackId)?.node!==id);M.bars=M.bars.filter(b=>b.a!==id&&b.b!==id);M.gears=M.gears.filter(g=>g.node!==id);M.racks=M.racks.filter(r=>r.node!==id);M.aligns=M.aligns.filter(a=>a.a!==id&&a.b!==id);M.nodes=M.nodes.filter(n=>n.id!==id);M.nodes=M.nodes.filter(n=>!n.follower||M.gears.some(g=>g.id===n.follower.gear))}
  if(type==='bar')M.bars=M.bars.filter(b=>b.id!==id);
  if(type==='gear'){M.gears=M.gears.filter(g=>g.id!==id);M.nodes=M.nodes.filter(n=>!n.follower||n.follower.gear!==id);M.racks.forEach(r=>{if(r.gearId===id)disconnectRack(r)})}
  if(type==='rack'){M.pointLinks=M.pointLinks.filter(l=>l.rackId!==id);M.pinLinks=M.pinLinks.filter(l=>l.rackId!==id);M.racks=M.racks.filter(r=>r.id!==id)}
  M.pinLinks=M.pinLinks.filter(l=>M.racks.some(r=>r.id===l.rackId)&&M.scissors.some(g=>g.id===l.scissorId));
  M.pointLinks=M.pointLinks.filter(l=>M.racks.some(r=>r.id===l.rackId)&&M.nodes.some(n=>n.id===l.nodeId));
  M.nodeLinks=M.nodeLinks.filter(l=>M.nodes.some(n=>n.id===l.a)&&M.nodes.some(n=>n.id===l.b));
  M.mates=M.mates.filter(m=>M.gears.some(g=>g.id===m.a)&&M.gears.some(g=>g.id===m.b));
  M.bars=M.bars.filter(b=>M.nodes.some(n=>n.id===b.a)&&M.nodes.some(n=>n.id===b.b));
  select(null);solve();render();
}
function fit(){if(M.nodes.length===0){cam={x:0,y:0,scale:1.5};render();return}let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const n of M.nodes){let r=M.gears.find(g=>g.node===n.id),spread=r?r.radius+18:0;x0=Math.min(x0,n.x-spread);x1=Math.max(x1,n.x+spread);y0=Math.min(y0,n.y-spread);y1=Math.max(y1,n.y+spread);if(n.slider){let dr=n.slider.range/2,u=Math.cos(rad(n.slider.angle)),v=Math.sin(rad(n.slider.angle));x0=Math.min(x0,n.slider.ox-Math.abs(u)*dr);x1=Math.max(x1,n.slider.ox+Math.abs(u)*dr);y0=Math.min(y0,n.slider.oy-Math.abs(v)*dr);y1=Math.max(y1,n.slider.oy+Math.abs(v)*dr)}}cam.x=(x0+x1)/2;cam.y=(y0+y1)/2;cam.scale=clamp(Math.min((stage.clientWidth-115)/Math.max(x1-x0,150),(stage.clientHeight-115)/Math.max(y1-y0,150)),.35,2.4);render()}
function toast(msg,bad=false){const el=$('toast');el.textContent=msg;el.classList.add('show');el.classList.toggle('bad',bad);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3600)}
function findForTool(p,target){if(['bar','node','fixed','slider','alignX','alignY'].includes(tool))return hitNode(p);return null}
function processClick(p){
  if(tool==='unlink'){disconnectNear(p);return;}
  if(tool==='joint'){
    const selected=closestPort(p,23/cam.scale,pendingPort);if(!selected){toast('Toque sobre um ponto de conexão destacado.',true);return}
    if(!pendingPort){pendingPort=selected;toast('Primeiro ponto: '+portName(selected)+'. Agora escolha o segundo.');render();return}
    const a=pendingPort;
    const reason=compatiblePorts(a,selected);if(reason){toast(reason+' Escolha outra porta.',true);render();return}
    pendingPort=null;const ok=connectJointPorts(a,selected);
    if(ok){solve(180);renderProperties();render()}
    else render();return;
  }
  if(tool==='select'){const target=hit(p);select(target?.type||null,target?.id);return}
  if(tool==='node'||tool==='fixed'){let n=hitNode(p);if(n&&tool==='fixed'){n.fixed=!n.fixed;if(n.fixed){n.slider=null;n.motor=null}}else if(!n)n=addNode(p.x,p.y,{fixed:tool==='fixed'});select('node',n.id);solve();return}
  if(tool==='slider'){let n=hitNode(p)||addNode(p.x,p.y);n.fixed=false;n.follower=null;n.slider={ox:n.x,oy:n.y,angle:0,range:450};select('node',n.id);solve();return}
  if(tool==='alignX'||tool==='alignY'){
    const picked=hit(p);if(!picked){toast('Clique em um objeto existente: pivô, barra, roda, cremalheira ou pantógrafo.',true);return}
    const group=groupForTarget(picked),target=group?{type:'scissor',id:group.id}:picked;
    if(!pending){pending={kind:'object',...target};toast('Referência definida. Clique no segundo objeto para alinhá-lo.');render();return}
    const first={type:pending.type,id:pending.id};alignObjects(first,target,tool==='alignX'?'x':'y');pending=null;select(target.type,target.id);setTool('select');return;
  }
  if(tool==='bar'){
    let n=hitNode(p);if(!n)n=addNode(p.x,p.y);
    if(!pending){pending={kind:'node',id:n.id};toast('Primeiro pivô definido. Escolha o segundo.');render();return}
    if(pending.id===n.id){toast('Selecione outro pivô.',true);return}
    let b=addBar(node(pending.id),n);if(b){select('bar',b.id);solve()}
    pending=null;render();return;
  }
  if(tool==='gear'||tool==='pulley'){let existing=hitNode(p);let g=addGear(existing?existing.x:p.x,existing?existing.y:p.y,tool,24,3.5);if(existing){M.nodes=M.nodes.filter(n=>n.id!==g.node);g.node=existing.id;existing.fixed=true;existing.slider=null}select('gear',g.id);return}
  if(tool==='rack'){let r=addRack(p.x,p.y);select('rack',r.id);return}
  if(tool==='eccentric'){const g=hitGear(p);if(!g){toast('Clique sobre uma roda para criar um pino excêntrico.',true);return}const n=addFollower(g);select('node',n.id);solve();return}
  if(tool==='motor'||tool==='spring'){const picked=hit(p);if(!picked){toast('Selecione uma barra, roda ou cursor.',true);return}let obj=picked.type==='node'?node(picked.id):picked.type==='bar'?bar(picked.id):picked.type==='gear'?gear(picked.id):null;if(picked.type==='node'&&obj?.fixed){const g=M.gears.find(g=>g.node===obj.id);if(g){makeMotor('gear',g,tool==='spring'?'spring':'motor');select('gear',g.id);return}}if(obj&&makeMotor(picked.type,obj,tool==='spring'?'spring':'motor'))select(picked.type,picked.id);return}
  if(tool==='mesh'||tool==='belt'){
    const g=hitGear(p);if(!g){toast('Clique em uma roda.',true);return}if(!pending){pending={kind:'gear',id:g.id};render();return}
    const a=gear(pending.id);const worked=addMate(a,g,tool==='mesh'?'gear':'belt');pending=null;if(worked){select('gear',g.id);solve()}return;
  }
  if(tool==='rackmesh'){
    if(!pending){const g=hitGear(p);if(!g||g.type!=='gear'){toast('Primeiro selecione uma engrenagem.',true);return}pending={kind:'gear',id:g.id};render();return}
    const r=hitRack(p),g=gear(pending.id);if(!r){toast('Agora clique na cremalheira.',true);return}
    const rn=node(r.node);if(M.bars.some(b=>b.a===rn.id||b.b===rn.id)){toast('Esta cremalheira já participa de outra ligação.',true);return}
    if(connectRack(r,g)){pending=null;select('rack',r.id);solve();toast('Transmissão acoplada. Repita na mesma engrenagem para conectar mais cremalheiras.')}
    return;
  }
  if(tool==='delete'){const picked=hit(p);if(picked)deleteItem(picked.type,picked.id);else toast('Clique em uma peça para excluir.');return}
}
function onDown(e){
 if(e.button!==0&&e.pointerType!=='touch')return;
 const p=ptOf(e);pointer=p;
 if(tool!=='select'&&tool!=='move'&&tool!=='rotate'){processClick(p);return}
 if(playing){playing=false;updatePlay()}
 const dom=e.target.closest?.('[data-kind]');
 const clickedPort=e.target.closest?.('[data-port-kind]');
 let picked=hit(p);
 if(clickedPort?.dataset.portKind==='node')picked={type:'node',id:clickedPort.dataset.portId};
 if(clickedPort?.dataset.portKind==='rack')picked={type:'rack',id:clickedPort.dataset.portId};
 if(dom){const kind=dom.dataset.kind,id=dom.dataset.id;
   if(kind==='guide')picked={type:'guide',id};
   if(kind==='rack-anchor')picked={type:'rack',id};
   if(kind==='scissor'||kind==='scissor-drive'||kind==='scissor-rotate')picked={type:'scissor',id};
   else if(kind==='gear'||kind==='rack'||kind==='bar')picked={type:kind,id};
   else if(kind==='node'){const n=node(id),gg=scissorForNode(id),rackOn=M.racks.find(r=>r.node===id),gearOn=M.gears.find(g=>g.node===id);
     if(gg)picked={type:'node',id};else if(rackOn)picked={type:'rack',id:rackOn.id};else if(gearOn&&!e.altKey)picked={type:'gear',id:gearOn.id};else picked={type:'node',id};
   }
 }
 if(e.shiftKey&&tool==='select'&&picked){
   const gg=groupForTarget(picked);if(gg)picked={type:'scissor',id:gg.id};
   if(multi.length===0&&sel&&(sel.type!==picked.type||sel.id!==picked.id)){
     const sg=groupForTarget(sel);multi.push(sg?{type:'scissor',id:sg.id}:sel);
   }
   const pos=multi.findIndex(o=>o.type===picked.type&&o.id===picked.id);
   if(pos>=0)multi.splice(pos,1);else if(multi.length<2)multi.push(picked);else multi=[multi[1],picked];
   sel=picked;renderProperties();render();return;
 }
 if(!picked){if(!e.shiftKey)select(null);drag={kind:'pan',start:{x:e.clientX,y:e.clientY},origin:{x:cam.x,y:cam.y}};stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');return}
 const group=groupForTarget(picked),kind=dom?.dataset.kind;
 if(picked.type==='guide'){
   const n=node(picked.id),s=n?.slider;if(!s)return;
   select('guide',n.id);
   if(tool==='rotate'){const startQ=(n.x-s.ox)*Math.cos(rad(s.angle))+(n.y-s.oy)*Math.sin(rad(s.angle));drag={kind:'guideRotate',id:n.id,start:p,base:s.angle,startQ};}
   else drag={kind:'guideMove',id:n.id,previous:p};
 }else if(group){
   select('scissor',group.id);
   if((kind==='scissor-drive'||kind==='node')&&tool==='select'){
     const id=kind==='scissor-drive'?group.driveId:picked.id,n=node(id);drag={kind:'ikNode',id,start:p,origin:{x:n.x,y:n.y},scissorId:group.id};
   }
   else if(kind==='scissor-rotate'||tool==='rotate'){
     const c=scissorCenter(group);drag={kind:'scissorRotate',id:group.id,startAngle:group.angle,center:c,pointerAngle:Math.atan2(p.y-c.y,p.x-c.x)};
   }else drag={kind:'scissorMove',id:group.id,start:p,previous:p,origin:{x:group.x,y:group.y}};
 }else if(picked.type==='rack'){
   const r=rack(picked.id),n=node(r.node),handle=hitRackRotate(p);
   select('rack',r.id);
   if(kind==='rack-anchor'&&tool==='select'){drag={kind:'rackAnchor',id:r.id,start:p,origin:r.anchorX||0}}
   else if(tool==='rotate'||handle){drag={kind:'rackRotate',id:r.id,offset:rad(n.slider.angle)-(Math.atan2(p.y-n.y,p.x-n.x)+Math.PI/2)}}
   else if(tool==='move'){drag={kind:'assemblyMove',target:{type:'rack',id:r.id},start:p,previous:p}}
   else drag={kind:'ikNode',id:n.id,start:p,origin:{x:n.x,y:n.y},rackId:r.id};
 }else if(picked.type==='gear'){
   const g=gear(picked.id),center=node(g.node),pointerAngle=Math.atan2(p.y-center.y,p.x-center.x);
   select('gear',g.id);
   const nearCenter=dist(p,center)<Math.max(13/cam.scale,g.radius*.29);
   if(tool==='move'||tool==='select'&&nearCenter)drag={kind:'assemblyMove',target:{type:'gear',id:g.id},start:p,previous:p};
   else drag={kind:'ikGear',id:g.id,lastAngle:pointerAngle,angle:g.angle};
 }else if(picked.type==='bar'){
   const b=bar(picked.id),a=node(b.a),z=node(b.b);
   select('bar',b.id);
   if(tool==='move'){drag={kind:'assemblyMove',target:{type:'bar',id:b.id},start:p,previous:p}}
   else if(tool==='select'){
     const end=dist(p,a)<dist(p,z)?a:z;
     if(!end.fixed)drag={kind:'ikNode',id:end.id,start:p,origin:{x:end.x,y:end.y}};
     else {const other=end===a?z:a;if(!other.fixed)drag={kind:'ikNode',id:other.id,start:p,origin:{x:other.x,y:other.y}}}
   }else{const anchor=a.fixed?'a':z.fixed?'b':'a',pn=anchor==='a'?a:z;
     drag={kind:'barRotate',id:b.id,anchor,offset:Math.atan2(z.y-a.y,z.x-a.x)-Math.atan2(p.y-pn.y,p.x-pn.x)};
   }
 }else if(picked.type==='node'){
   const n=node(picked.id),join=pointLinkOfNode(n.id);select('node',n.id);
   if(tool==='move'){drag={kind:'assemblyMove',target:{type:'node',id:n.id},start:p,previous:p}}
   else if(n.fixed){toast('Apoio fixo. Use Mover (G) para reposicionar o conjunto ou desative o apoio para testá-lo.',true);}
   else drag={kind:'ikNode',id:n.id,start:p,origin:{x:n.x,y:n.y}};
 }
 if(drag){stage.setPointerCapture(e.pointerId);stage.classList.add('dragging')}
}
function manualRackPosition(r,q,commit=false){
  if(!r)return;const desired=clampManualRack(q,r),previous=rackQ(r);
  manualDrive={kind:'rack',id:r.id,q:desired};
  solve(165);
  // Não aceitar uma posição que viole barras e apoios de uma junta adicionada.
  // Procura o último ponto admissível entre o estado anterior e o solicitado.
  if((M.pointLinks||[]).length&&maxResidual>.8){
    let good=previous,bad=desired;
    for(let i=0;i<17;i++){
      const mid=(good+bad)*.5;manualDrive={kind:'rack',id:r.id,q:mid};solve(145);
      if(maxResidual<.8)good=mid;else bad=mid;
    }
    manualDrive={kind:'rack',id:r.id,q:good};solve(165);
    if(Math.abs(good-desired)>1)toast('Limite cinemático: a conexão não permite continuar sem deformar uma barra.',true);
  }
  if(commit)finishManual();
  render();
  const display=$('rackPositionValue');if(display)display.textContent=fmt(rackQ(r),1);
  const control=document.querySelector('[data-rack-slider]');if(control&&control.dataset.rackSlider===r.id)control.value=String(rackQ(r));
}
function finishManual(){
  // Não volta à posição inicial ao soltar: redefine a fase inicial da transmissão.
  for(const g of M.gears){
    if(g.motor?.type==='spring'){
      const difference=g.motor.target-g.motor.start;
      g.motor.start=g.angle;g.motor.target=g.angle+difference;
    }
    g.baseAngle=g.angle-(g.motor?.type==='motor'?rad(g.motor.rpm*6)*t:0);
  }
  manualDrive=null;
  solve(145);
  render();
}
// V9: resolver uma cadeia puxando QUALQUER pivô, e não apenas pelo elemento motor.
// Metas suaves deixam a posição fora do alcance sobre o limite admissível do mecanismo.
function runInverseGoal(request){
 const goals=new Map(),fixed=new Map();
 if(request.kind==='gear')goals.set(`${request.id}.angle`,request.angle);
 else{goals.set(`${request.id}.x`,request.x);goals.set(`${request.id}.y`,request.y)}
 // Ao arrastar o acionamento do pantógrafo isolado, manter orientação e base.
 // A abertura permanece variável; para grupos conectados, o acoplamento a outras
 // estruturas determina a posição pela equação de coincidência.
 if(request.scissorId){const g=scissor(request.scissorId);
   if(g){fixed.set(`${g.id}.angle`,rad(g.angle));if(!scissorJointCount(g)){fixed.set(`${g.id}.x`,g.x);fixed.set(`${g.id}.y`,g.y)}}
 }
 const backup=JSON.stringify(M);
 let result=solveConstraints(M,{pins:fixed,goals,goalWeight:request.kind==='gear'?.25:.038,iterations:24,maxVariables:210,goalTolerance:.45,acceptResidual:.22,strict:true,damping:1e-8});
 if(!result.ok){
   // Em limites muito exigentes, o cursor continua livre mas o conjunto não deforma.
   // Uma segunda tentativa mais suave busca a configuração admissível mais próxima.
   Object.assign(M,JSON.parse(backup));
   result=solveConstraints(M,{pins:fixed,goals,goalWeight:request.kind==='gear'?.07:.008,iterations:28,maxVariables:210,goalTolerance:.45,acceptResidual:.22,strict:true,damping:1e-9});
 }
 if(!result.ok){Object.assign(M,JSON.parse(backup));inverseDragInfo={...result,blocked:true};}
 else inverseDragInfo={...result,blocked:false};
 if(result.ok){lastSolveInfo=result;maxResidual=result.maxResidual;}
 if(request.kind==='node'){
   const at=node(request.id);inverseGhost={goal:{x:request.x,y:request.y},actual:at?{x:at.x,y:at.y}:null};
 }else inverseGhost=null;
 render();
}
function onMove(e){
 const p=ptOf(e);pointer=p;
 $('coordBadge').textContent='X '+fmt(p.x,0)+' · Y '+fmt(p.y,0)+' mm';
 if(!drag){if(tool==='joint'||tool==='unlink'){const next=closestPort(p,22/cam.scale,pendingPort);if((hoverPort?portId(hoverPort):null)!==(next?portId(next):null)){hoverPort=next;render()}}else if(pending)render();return}
 if(drag.kind==='ikNode'){
   const goal={x:drag.origin.x+p.x-drag.start.x,y:drag.origin.y+p.y-drag.start.y};
   runInverseGoal({kind:'node',id:drag.id,x:goal.x,y:goal.y,scissorId:drag.scissorId});
 }else if(drag.kind==='ikGear'){
   const g=gear(drag.id),center=node(g.node),a=Math.atan2(p.y-center.y,p.x-center.x);
   let delta=a-drag.lastAngle;if(delta>Math.PI)delta-=TAU;if(delta< -Math.PI)delta+=TAU;
   drag.angle+=delta;drag.lastAngle=a;
   runInverseGoal({kind:'gear',id:g.id,angle:drag.angle});
 }else if(drag.kind==='guideMove'){
   const dx=p.x-drag.previous.x,dy=p.y-drag.previous.y;
   translateAssembly({type:'guide',id:drag.id},dx,dy);drag.previous=p;
   solve(95);render();
 }else if(drag.kind==='guideRotate'){
   const n=node(drag.id),s=n?.slider;if(!s)return;
   const delta=Math.atan2(p.y-s.oy,p.x-s.ox)-Math.atan2(drag.start.y-s.oy,drag.start.x-s.ox);
   let angle=normDeg(drag.base+deg(delta));if(e.shiftKey)angle=Math.round(angle/15)*15;
   const r=M.racks.find(r=>r.node===n.id);
   if(r)rotateRack(r,angle);
   else {s.angle=angle;n.x=s.ox+drag.startQ*Math.cos(rad(angle));n.y=s.oy+drag.startQ*Math.sin(rad(angle));}
   solve(95);render();
 }else if(drag.kind==='assemblyMove'){
   const dx=p.x-drag.previous.x,dy=p.y-drag.previous.y;translateAssembly(drag.target,dx,dy);drag.previous=p;solve(100);render();
 }else if(drag.kind==='scissorMove'){
   const g=scissor(drag.id);if(scissorLink(g.id)){const dx=p.x-drag.previous.x,dy=p.y-drag.previous.y;translateAssembly({type:'scissor',id:g.id},dx,dy);drag.previous=p;}else{g.x=drag.origin.x+p.x-drag.start.x;g.y=drag.origin.y+p.y-drag.start.y}solve(100);render();
 }else if(drag.kind==='scissorRotate'){
   const g=scissor(drag.id);const angle=Math.atan2(p.y-drag.center.y,p.x-drag.center.x);
   let next=drag.startAngle+deg(angle-drag.pointerAngle);if(e.shiftKey)next=Math.round(next/15)*15;
   const pivotId=scissorPrimaryContact(g),pivot=pivotId?{...node(pivotId)}:scissorCenter(g);g.angle=normDeg(next);placeScissor(g);const moved=pivotId?node(pivotId):scissorCenter(g);g.x+=pivot.x-moved.x;g.y+=pivot.y-moved.y;placeScissor(g);solve(110);render();
 }else if(drag.kind==='scissorHeight'){
   const g=scissor(drag.id),{v}=localAxes(g.angle),change=dot({x:p.x-drag.start.x,y:p.y-drag.start.y},v);
   const targetH=clamp(drag.original+change,...Object.values(scissorHeightLimits(g)));
   const l=scissorLink(g.id);if(l){const r=rack(l.rackId);if(r)manualRackPosition(r,l.q0+targetH-l.h0)}else{g.height=targetH;solve(100);render();}
 }else if(drag.kind==='rack'){
   const r=rack(drag.id);manualRackPosition(r,drag.origin+dot({x:p.x-drag.start.x,y:p.y-drag.start.y},rackAxes(r).u));
 }else if(drag.kind==='linkedNode'){
   const r=rack(drag.rackId);if(r)manualRackPosition(r,drag.origin+dot({x:p.x-drag.start.x,y:p.y-drag.start.y},rackAxes(r).u));
 }else if(drag.kind==='rackAnchor'){
   const r=rack(drag.id),delta=dot({x:p.x-drag.start.x,y:p.y-drag.start.y},rackAxes(r).u);
   setRackAnchor(r,drag.origin+delta);solve(100);render();
 }else if(drag.kind==='rackRotate'){
   const r=rack(drag.id),n=node(r.node);
   let angle=deg(Math.atan2(p.y-n.y,p.x-n.x)+Math.PI/2+drag.offset);
   if(e.shiftKey)angle=Math.round(angle/15)*15;
   rotateRack(r,angle);solve(100);render();
   const control=document.querySelector('[data-prop="rackAngle"]');if(control)control.value=String(Math.round(node(r.node).slider.angle*10)/10);
 }else if(drag.kind==='barRotate'){
   const b=bar(drag.id),a=node(b.a),z=node(b.b),pn=drag.anchor==='a'?a:z;
   let angle=Math.atan2(p.y-pn.y,p.x-pn.x)+drag.offset;
   if(e.shiftKey)angle=rad(Math.round(deg(angle)/15)*15);
   manualDrive={kind:'bar',id:b.id,angle,anchor:drag.anchor};solve(140);render();
 }else if(drag.kind==='gear'){
   const g=gear(drag.id),center=node(g.node),nextAngle=Math.atan2(p.y-center.y,p.x-center.x);
   let delta=nextAngle-drag.lastAngle;if(delta>Math.PI)delta-=TAU;if(delta< -Math.PI)delta+=TAU;
   drag.angle+=delta;drag.lastAngle=nextAngle;
   manualDrive={kind:'gear',id:g.id,angle:drag.angle};solve(120);render();
 }else if(drag.kind==='node'){
   const n=node(drag.id);if(!n)return;
   const dx=p.x-drag.start.x,dy=p.y-drag.start.y;let x=drag.origin.x+dx,y=drag.origin.y+dy;
   if(n.slider){const s=n.slider,ux=Math.cos(rad(s.angle)),uy=Math.sin(rad(s.angle));const q=clamp((x-s.ox)*ux+(y-s.oy)*uy,-s.range/2,s.range/2);x=s.ox+q*ux;y=s.oy+q*uy}
   else if(n.follower){const g=gear(n.follower.gear),c=node(g.node),ddx=x-c.x,ddy=y-c.y,cs=Math.cos(-g.angle),sn=Math.sin(-g.angle);n.follower.rx=ddx*cs-ddy*sn;n.follower.ry=ddx*sn+ddy*cs}
   if(n.motor){n.motor=null;toast('Motor linear desativado para controle manual.')}
   manualDrive={kind:'node',id:n.id,x,y};solve(140);render();
 }else if(drag.kind==='pan'){
   cam.x=drag.origin.x-(e.clientX-drag.start.x)/cam.scale;cam.y=drag.origin.y-(e.clientY-drag.start.y)/cam.scale;render();
 }
 if(drag.kind==='ikNode')snapCandidate=bestPivotSnap(drag.id);else if(['rackAnchor','rack','assemblyMove','scissorMove','scissorHeight'].includes(drag.kind))snapCandidate=bestSnapCandidate();if(snapCandidate)render();
}
function onUp(e){
  if(drag&&['ikNode','ikGear'].includes(drag.kind)){
    for(const g of M.gears)g.baseAngle=g.angle-(g.motor?.type==='motor'?rad(g.motor.rpm*6)*t:0);
  }
  if(drag&&manualDrive)finishManual();
  if(drag&&snapCandidate?.kind==='port'&&drag.kind==='ikNode'){const target=snapCandidate.target,source=snapCandidate.source;if(connectJointPorts(source,target)&&target.kind==='node')sel={type:'node',id:target.nodeId}}
  if(drag&&snapCandidate?.kind==='pin'&&['rackAnchor','rack','assemblyMove','scissorMove','scissorHeight'].includes(drag.kind)){
    const candidate=snapCandidate,r=rack(candidate.rackId),g=scissor(candidate.scissorId);
    if(r&&g&&dist(rackAnchor(r),node(g.driveId))<=(23/cam.scale)){connectJointPorts({kind:'rack',rackId:r.id,slot:'custom',offset:r.anchorX||0},{kind:'node',nodeId:g.driveId});}
  }
  snapCandidate=null;drag=null;inverseGhost=null;inverseDragInfo=null;
  renderProperties();render();
  stage.classList.remove('dragging');
  try{stage.releasePointerCapture(e.pointerId)}catch{}
}
stage.addEventListener('pointerdown',onDown);stage.addEventListener('pointermove',onMove);stage.addEventListener('pointerup',onUp);stage.addEventListener('pointercancel',onUp);
stage.addEventListener('wheel',e=>{e.preventDefault();const p=ptOf(e),before=cam.scale;cam.scale=clamp(cam.scale*(e.deltaY>0?.89:1.12),.32,4.5);cam.x+= (p.x-cam.x)*(1-before/cam.scale);cam.y+=(p.y-cam.y)*(1-before/cam.scale);render()},{passive:false});
function updatePlay(){$('playBtn').innerHTML=playing?'Ⅱ Pausar':'▶ Iniciar';$('playBtn').classList.toggle('primary',!playing)}
function updateTime(){const mins=Math.floor(t/60),sec=Math.floor(t%60),ct=Math.floor(t%1*100);$('timeVal').textContent=String(mins).padStart(2,'0')+':'+String(sec).padStart(2,'0')+'.'+String(ct).padStart(2,'0')}
function createScissor(stages=3,width=110,height=140,replace=false){
 stages=Math.round(clamp(Number(stages)||3,1,6));width=clamp(Number(width)||110,55,210);height=clamp(Number(height)||140,65,240);
 if(replace){M=serial();stablePose=null;M.name='Pantógrafo de '+stages+' estágios';sel=null;multi=[];pending=null;manualDrive=null;t=0;playing=false;updatePlay()}
 const diagonal=Math.hypot(width,height);
 const existing=M.nodes.length>0,other=M.nodes.filter(n=>!scissorForNode(n.id));
 const xRight=M.nodes.length?Math.max(...M.nodes.map(n=>n.x+(M.gears.find(g=>g.node===n.id)?.radius||0))):cam.x;
 const yMid=M.nodes.length?(Math.min(...M.nodes.map(n=>n.y))+Math.max(...M.nodes.map(n=>n.y)))/2:cam.y;
 const origin=existing?{x:xRight+85,y:yMid-height/2}:{x:cam.x-stages*width/2,y:cam.y-height/2};
 const group={id:idFor('p'),stages,diagonal,height,x:origin.x,y:origin.y,angle:0,topIds:[],bottomIds:[],centerIds:[],driveId:null};
 for(let i=0;i<=stages;i++){
   const a=addNode(group.x+i*width,group.y),b=addNode(group.x+i*width,group.y+height);
   group.topIds.push(a.id);group.bottomIds.push(b.id);
 }
 for(let i=0;i<stages;i++){
   const c=addNode(group.x+(i+.5)*width,group.y+height*.5);
   group.centerIds.push(c.id);
   const a=node(group.topIds[i]),b=node(group.bottomIds[i]),q=node(group.topIds[i+1]),z=node(group.bottomIds[i+1]);
   addBar(a,c);addBar(c,z);addBar(b,c);addBar(c,q);
 }
 group.driveId=group.bottomIds[0];M.scissors.push(group);placeScissor(group);
 solve(120);setTool('select');select('scissor',group.id);renderProperties();updateTime();
 $('scissorModal').classList.remove('show');$('examplesModal').classList.remove('show');
 requestAnimationFrame(fit);
 toast('Pantógrafo ADICIONADO ao desenho. ↕ abre; ✥ move; ⤾ gira.');
 return group;
}
function goPreset(name){pendingPort=null;hoverPort=null;if(name==='scissor'){createScissor(3,110,140,true);return}M=serial();stablePose=null;snapCandidate=null;sel=null;multi=[];pending=null;manualDrive=null;t=0;playing=false;updatePlay();let n=(x,y,opt={})=>addNode(x,y,opt);let b=(a,z)=>addBar(a,z);let g=(x,y,typ='gear',teeth=24,m=3.5)=>addGear(x,y,typ,teeth,m);
  if(name==='four'){
    M.name='Mecanismo de quatro barras';let a=n(-160,80,{fixed:true}),q=n(-90,80),c=n(40,-71.9868),d=n(90,80,{fixed:true});b(a,q);b(q,c);b(c,d);M.bars[0].motor={rpm:7,base:0};
  }else if(name==='slider'){
    M.name='Biela-manivela';let a=n(-180,15,{fixed:true}),q=n(-110,15),c=n(70,15,{slider:{ox:70,oy:15,angle:0,range:580}});b(a,q);b(q,c);M.bars[0].motor={rpm:7,base:0};
  }else if(name==='gears'){
    M.name='Trem de engrenagens';let a=g(-130,0,'gear',26),z=g(-21.5,0,'gear',36),c=g(76.5,0,'gear',20);addMate(a,z,'gear');addMate(z,c,'gear');a.motor={rpm:9};
  }else if(name==='rack'){
    M.name='Pinhão e cremalheira';const a=g(-5,-54,'gear',28);const r=addRack(-5,a.radius-54+9);node(r.node).slider.range=950;connectRack(r,a,1);a.motor={rpm:2.4};
  }else if(name==='rackdual'||name==='rackparallel'){
    const orthogonal=name==='rackdual';M.name=orthogonal?'Duas cremalheiras a 90°':'Cremalheiras opostas no mesmo pinhão';
    const a=g(0,0,'gear',26),radius=a.radius+RACK_CLEARANCE;
    const bottom=addRack(-48,radius);node(bottom.node).slider.range=420;bottom.length=190;connectRack(bottom,a,1);
    const other=addRack(orthogonal?radius:-48,orthogonal?-48:-radius);
    node(other.node).slider.range=420;other.length=190;rotateRack(other,orthogonal?90:0);connectRack(other,a,-1);
  }else if(name==='rackscissor'){
    M.name='Pinhão + cremalheira + pantógrafo';
    const a=g(-110,100,'gear',24),r=addRack(-110,100-a.radius-RACK_CLEARANCE);r.length=230;
    node(r.node).slider.range=240;connectRack(r,a,-1);
    const sg=createScissor(3,110,140,false);attachRackScissor(r,sg);
    a.motor={rpm:1.25};
  }else if(name==='spring'){
    M.name='Abertura automática por mola';let a=n(-160,80,{fixed:true}),q=n(-90,80),c=n(40,-71.9868),d=n(90,80,{fixed:true});b(a,q);b(q,c);b(c,d);M.bars[0].motor={type:'spring',base:0,target:-rad(110),tau:.95};
  }else if(name==='eccentric'){
    M.name='Pino excêntrico e cursor';let gg=g(-130,-35,'gear',34);let pin=addFollower(gg);pin.follower.rx=40;let pos=n(65,-35,{slider:{ox:65,oy:-35,angle:0,range:430}});addBar(pin,pos);gg.motor={rpm:6};
  }else M.name='Projeto sem título';
  $('projectTitle').textContent=M.name;solve(200);renderProperties();requestAnimationFrame(fit);updateTime();$('examplesModal').classList.remove('show');setTool('select');
}
function serialize(){return {version:13,app:'Kinetika',project:M}}
function download(name,contents,mime){let blob=new Blob([contents],{type:mime}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),400)}
function exportJSON(){download((M.name||'mecanismo').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')+'.json',JSON.stringify(serialize(),null,2),'application/json');toast('Projeto exportado em JSON.')}
function exportSVG(){const old=stage.getAttribute('viewBox'),content=`<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="${old}" width="1400" height="900">${sceneSVG()}</svg>`;download('kinetika-mecanismo.svg',content,'image/svg+xml');toast('Desenho SVG exportado.')}
function loadJSON(input){let a=input?.project||input;if(!a||!Array.isArray(a.nodes)||!Array.isArray(a.bars)||!Array.isArray(a.gears)||!Array.isArray(a.mates)||!Array.isArray(a.racks))throw Error('Estrutura do arquivo incompatível');
  const known=new Set(a.nodes.map(n=>n.id));if(a.bars.some(b=>!known.has(b.a)||!known.has(b.b))||a.gears.some(g=>!known.has(g.node)))throw Error('Arquivo contém conexões inválidas');
  M={...serial(),...a,nodes:a.nodes,bars:a.bars,gears:a.gears,mates:a.mates,racks:a.racks,aligns:a.aligns||[],pinLinks:a.pinLinks||[],pointLinks:a.pointLinks||[],nodeLinks:a.nodeLinks||[],scissors:a.scissors||[],next:Math.max(1,Number(a.next)||1)};M.next=Math.max(M.next,...[...M.nodes,...M.bars,...M.gears,...M.mates,...M.racks,...M.aligns].map(v=>Number(String(v.id).slice(1))+1||1));
  // Migração de projetos V1/V2: offset antigo era coordenada global X.
  const oldVersion=Number(input?.version||1);
  for(const r of M.racks){r.anchorX=clamp(Number(r.anchorX)||0,-r.length/2+6,r.length/2-6);r.side=r.side===-1?-1:1;const n=node(r.node);if(!n||!n.slider)continue;
    if(oldVersion<3&&r.gearId&&gear(r.gearId)){
      const g=gear(r.gearId),c=node(g.node);n.slider.angle=0;
      const q=n.x-c.x;r.side=1;r.offset=q+g.radius*g.angle;
    }
    if(r.gearId&&gear(r.gearId))placeRack(r);
  }
  if(M.scissor?.topIds?.length&&!M.scissors.length){
    const legacy=M.scissor,A=node(legacy.topIds[0]),B=node(legacy.bottomIds[0]);
    if(A&&B){const ids=[...legacy.topIds,...legacy.bottomIds,...legacy.centerIds],inside=new Set(ids);
      const g={id:idFor('p'),stages:legacy.stages,diagonal:legacy.diagonal||Math.hypot(legacy.width,legacy.height),height:Math.abs(B.y-A.y),x:A.x,y:A.y,angle:0,topIds:legacy.topIds,bottomIds:legacy.bottomIds,centerIds:legacy.centerIds,driveId:legacy.driveId};
      M.scissors.push(g);for(const id of ids){const n=node(id);if(n){n.fixed=false;n.slider=null}}
      M.aligns=M.aligns.filter(c=>!(inside.has(c.a)&&inside.has(c.b)));M.scissor=null;placeScissor(g);
    }
  }
  M.pinLinks=M.pinLinks.filter(l=>rack(l.rackId)&&scissor(l.scissorId));
  M.pointLinks=M.pointLinks.filter(l=>rack(l.rackId)&&M.nodes.some(n=>n.id===l.nodeId));
  M.nodeLinks=(M.nodeLinks||[]).filter(l=>node(l.a)&&node(l.b));
  for(const b of M.bars)b.dimensionMode=isDraftBar(b)?'draft':'locked';
  stablePose=null;
  pendingPort=null;hoverPort=null;
  t=0;playing=false;sel=null;multi=[];pending=null;manualDrive=null;updatePlay();$('projectTitle').textContent=M.name;solve();renderProperties();fit();setTool('select');toast('Projeto importado com sucesso.');
}
// V7 · diagnostics (on demand) and versioned local history.
const history=new ProjectHistory(80), AUTOSAVE_KEY='kinetika.mechanical-atelier.v7';
let autosaveTimer=null;
function updateHistoryUI(){
  $('undoBtn').disabled=!history.canUndo;$('redoBtn').disabled=!history.canRedo;
}
function scheduleAutosave(){
  if(autosaveTimer)clearTimeout(autosaveTimer);
  const badge=$('saveBadge');if(badge)badge.textContent='○ ALTERAÇÕES LOCAIS';
  autosaveTimer=setTimeout(()=>{
    try{localStorage.setItem(AUTOSAVE_KEY,JSON.stringify(serialize()));if(badge)badge.textContent='● SALVO LOCALMENTE'}
    catch(err){if(badge)badge.textContent='! NÃO FOI POSSÍVEL SALVAR'}
  },550);
}
function commitChange(){
  if(!M)return;
  if(history.capture(M)){scheduleAutosave();updateHistoryUI()}
}
function restoreHistoryModel(next){
  if(!next)return;
  playing=false;manualDrive=null;drag=null;snapCandidate=null;pending=null;pendingPort=null;
  // Restoring a project uses the same legacy migrator as JSON import.
  loadJSON({version:7,project:next});
  updateHistoryUI();scheduleAutosave();
}
function undoProject(){if(!history.canUndo){toast('Nada para desfazer.');return}restoreHistoryModel(history.undo());toast('Ação desfeita.')}
function redoProject(){if(!history.canRedo){toast('Nada para refazer.');return}restoreHistoryModel(history.redo());toast('Ação refeita.')}
function showDiagnostics(){
  solve(180);
  const report=analyzeMechanism(M);
  const status=report.status==='móvel'?'Montagem móvel':report.status==='travado'?'Montagem travada':report.status==='incompatível'?'Montagem incompatível':report.status==='vazio'?'Sem componentes':'Análise parcial';
  const statusClass=report.status==='incompatível'?'error':report.status==='travado'?'locked':'';
  const metric=(label,value,note)=>`<div class="diag-metric"><span>${label}</span><strong>${str(value)}</strong><span>${note}</span></div>`;
  const issues=report.issues.length?report.issues.map(x=>`<div class="diag-issue ${x.severity}"><strong>${x.severity==='error'?'●':x.severity==='warning'?'◐':'○'} ${str(x.label)}</strong><p>${str(x.explanation)}</p></div>`).join(''):'<div class="diag-issue"><strong>Nenhum erro identificado nas restrições examinadas.</strong><p>Isso não garante resistência estrutural ou ausência de interferências.</p></div>';
  $('diagnoseResults').innerHTML=`<div class="diag-status ${statusClass}">◉ ${status}</div><div class="diag-metrics">${metric('Mobilidade estimada',report.mobility??'—','graus de liberdade do sistema 2D')}${metric('Restrições',report.constraints,'equações consideradas')}${metric('Posto',report.rank??'—','posto numérico do jacobiano')}${metric('Redundâncias',report.redundant??'—','restrições dependentes')}</div><div class="diag-v8-summary">◇ Solucionador V8: <strong>${str(lastSolveInfo.ok?'Convergência / posição admissível':'Verificação necessária')}</strong> · ${str(lastSolveInfo.constraints??'—')} equações · ${str(lastSolveInfo.iterations??'—')} iterações · erro do núcleo ${fmt(lastSolveInfo.maxResidual??0,2)} mm. ${lastSolveInfo.status==='too-large'?'Montagem maior que o limite de cálculo: aplicado modo de compatibilidade.':''}</div><div class="diag-issues">${issues}</div><div class="diag-caveat">A contagem inclui movimentos globais de montagens sem apoio fixo. É um diagnóstico local na posição atual, não uma prova de mobilidade global. Em singularidades o posto pode mudar; colisões, folgas, atrito, resistência e forças não são avaliados.</div>`;
  $('diagnoseModal').classList.add('show');
}
$('diagnoseBtn').onclick=showDiagnostics;$('diagnoseRefresh').onclick=showDiagnostics;
function showGeometry(){
  const d=inspectGeometry(true),metric=(v,label)=>`<div class="geometry-metric"><strong>${v}</strong><small>${label}</small></div>`;
  const row=(item,tone)=>`<div class="geometry-row ${tone}"><div class="geometry-row-head"><span>${tone==='collision'?'●':tone==='singularity'?'△':'◇'} ${str(item.label)}</span><small>${tone==='collision'?'INTERFERÊNCIA':tone==='singularity'?'POSSÍVEL SINGULARIDADE':'PROXIMIDADE'}</small></div><p>${str(item.description)}</p></div>`;
  const details=[...d.collisions.map(x=>row(x,'collision')),...d.singularities.map(x=>row(x,'singularity')),...d.near.map(x=>row(x,'near'))].slice(0,32).join('');
  $('geometryResults').innerHTML=`<div class="geometry-metrics">${metric(d.collisions.length,'Interferências')}${metric(d.singularities.length,'Posições críticas')}${metric(d.near.length,'Proximidades')}</div><div class="geometry-info">${d.partsInspected} elementos · ${d.pairsChecked} pares examinados · folga mínima configurada ${fmt(d.clearance,0)} mm${d.truncated?' · análise parcial por limite de elementos':''}.</div>${details||'<div class="geometry-empty">Nenhuma interferência ou singularidade geométrica indicada nesta configuração.</div>'}<p class="geometry-disclaimer">Os perfis são aproximados: barras ≈ 10 mm de espessura, cremalheiras ≈ 18 mm, rodas pelo raio primitivo. Juntas compartilhadas e engrenamentos declarados são tratados como contatos intencionais. O alerta de alinhamento colinear é um indício de ponto morto potencial, não prova de travamento. Não detecta colisões em planos 3D diferentes, folgas reais, perfil involuta, torque ou forças.</p>`;
  $('geometryOverlayToggle').checked=geometryOverlayVisible;
  $('geometryModal').classList.add('show');
}
$('geometryBtn').onclick=showGeometry;
$('geometryRefresh').onclick=showGeometry;
$('geometryOverlayToggle').onchange=e=>{geometryOverlayVisible=e.target.checked;render()};
$('geometryBadge').onclick=showGeometry;

// V11 — varredura temporal discreta, isolada do projeto em edição.
let sweepSession=null,sweepRunning=false,sweepCancelled=false;
const sweepClone=obj=>structuredClone(obj);
const sweepFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function openSweep(){
 playing=false;updatePlay();
 const plan=planMotionSweep(M);
 $('sweepModal').classList.add('show');
 $('sweepResults').hidden=true;$('sweepProgress').hidden=true;
 $('sweepDuration').value=plan.ok?String(Math.round(plan.duration*100)/100):'8';
 $('sweepExplanation').textContent=plan.ok?
 plan.virtualDrive?`Ensaio virtual: ${plan.virtualDrive.label}. O sistema percorrerá uma faixa geométrica idealizada sem adicionar motor ao seu projeto. Os segundos são apenas uma escala de referência; não representam velocidade física.`:`${plan.motors.length} acionamento(s) identificado(s): ${plan.motors.map(m=>m.label).join(', ')}. ${plan.approximateCycle?'Com vários acionamentos ou ciclos longos, a duração escolhida não garante cobrir todas as configurações combinadas.':''} A amostragem discreta pode deixar passar interferências entre quadros.`:
 plan.reason;
}
function closeSweep(){
 if(sweepRunning)sweepCancelled=true;
 $('sweepModal').classList.remove('show');
 // A análise nunca altera M. Mesmo ao fechar durante uma varredura, o loop é interrompido.
}
function sweepPreviewSVG(model,sample){
 const p=sample.pose; if(!p)return {viewBox:'0 0 400 240',markup:'<text x="20" y="35" fill="#f0d0ab">Pose indisponível</text>'};
 const pos=new Map(p.nodes.map(([id,x,y])=>[id,{x,y}]));
 const rot=new Map(p.gears.map(([id,a])=>[id,a]));
 const pts=[],items=[];
 const push=(x,y,margin=0)=>{if(Number.isFinite(x)&&Number.isFinite(y))pts.push([x-margin,y-margin],[x+margin,y+margin])};
 const f=n=>Number(n||0).toFixed(2);
 for(const b of model.bars||[]){const a=pos.get(b.a),z=pos.get(b.b);if(!a||!z)continue;push(a.x,a.y,7);push(z.x,z.y,7);items.push(`<path d="M${f(a.x)},${f(a.y)} L${f(z.x)},${f(z.y)}" stroke="#81c4ad" stroke-width="9" stroke-linecap="round" fill="none"/>`)}
 for(const g of model.gears||[]){const c=pos.get(g.node);if(!c)continue;const radius=g.radius||20,angle=rot.get(g.id)||0;push(c.x,c.y,radius+10);items.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(radius)}" fill="#233f42" stroke="#bdca96" stroke-width="3"/><line x1="${f(c.x)}" y1="${f(c.y)}" x2="${f(c.x+radius*.8*Math.cos(angle))}" y2="${f(c.y+radius*.8*Math.sin(angle))}" stroke="#b9d7bc" stroke-width="5" stroke-linecap="round"/>`)}
 for(const r of model.racks||[]){const c=pos.get(r.node),n=model.nodes.find(n=>n.id===r.node);if(!c||!n?.slider)continue;const a=n.slider.angle*Math.PI/180,dx=Math.cos(a)*(r.length/2),dy=Math.sin(a)*(r.length/2);push(c.x-dx,c.y-dy,14);push(c.x+dx,c.y+dy,14);items.push(`<line x1="${f(c.x-dx)}" y1="${f(c.y-dy)}" x2="${f(c.x+dx)}" y2="${f(c.y+dy)}" stroke="#e6bd7c" stroke-width="16" stroke-linecap="round"/>`)}
 for(const [id,x,y] of p.nodes){push(x,y,3);items.push(`<circle cx="${f(x)}" cy="${f(y)}" r="3.3" fill="#dcf5e8"/>`)}
 for(const e of [...(sample.report?.collisions||[]),...(sample.report?.singularities||[])]){
  if(!e.at||!Number.isFinite(e.at.x)||!Number.isFinite(e.at.y))continue;
  const color=e.kind==='collision'||e.gap<-.65?'#ff8378':'#eebd6c';
  items.push(`<circle cx="${f(e.at.x)}" cy="${f(e.at.y)}" r="13" stroke="${color}" stroke-width="2.6" fill="${color}" fill-opacity=".16"/>`);
 }
 if(!pts.length)return {viewBox:'0 0 400 240',markup:'<text x="18" y="30" fill="#b9d5ca">Nenhum componente geométrico</text>'};
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(70,Math.max(...xs)-minX),h=Math.max(70,Math.max(...ys)-minY),margin=Math.max(24,Math.max(w,h)*.06);
 const vb=[minX-margin,minY-margin,w+2*margin,h+2*margin];
 return {viewBox:vb.map(f).join(' '),markup:`<rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#14272b"/>${items.join('')}`};
}
function updateSweepPreview(index){
 if(!sweepSession?.samples?.length)return;
 index=clamp(Math.round(index),0,sweepSession.samples.length-1);
 const s=sweepSession.samples[index],frameCount=sweepSession.samples.length;
 $('sweepCursor').max=String(frameCount-1);$('sweepCursor').value=String(index);
 $('sweepFrameLabel').textContent=`${(index+1).toString().padStart(2,'0')}/${frameCount} · ${fmt(s.time,2)}s`;
 const visual=sweepPreviewSVG(sweepSession.model,s);$('sweepPreview').setAttribute('viewBox',visual.viewBox);$('sweepPreview').innerHTML=visual.markup;
 const marker=$('sweepChartMarker');if(marker){const x=30+index/(frameCount-1)*485;marker.setAttribute('x1',x);marker.setAttribute('x2',x)}
 document.querySelectorAll('#sweepEvents [data-sweep-event]').forEach(el=>{const from=Number(el.dataset.from),to=Number(el.dataset.to);el.classList.toggle('active',index>=from&&index<=to)});
}
function sweepGapChart(samples){
 const valid=samples.filter(s=>s.valid&&Number.isFinite(s.report?.minGap)),values=valid.map(s=>s.report.minGap),bound=Math.max(10,Math.min(65,...values.map(v=>Math.abs(v))));
 const range=Number.isFinite(bound)?bound:10,px=i=>30+i/(samples.length-1)*485,py=v=>78-v/range*55;
 // Não ligar visualmente quadros em que o resolvedor não convergiu.
 const paths=[];let seg='';for(let i=0;i<samples.length;i++){const s=samples[i];if(!s.valid||!Number.isFinite(s.report?.minGap)){if(seg)paths.push(seg);seg='';continue}seg+=(seg?'L':'M')+`${px(i).toFixed(1)},${py(clamp(s.report.minGap,-range,range)).toFixed(1)} `;}if(seg)paths.push(seg);
 return `<rect width="540" height="150" rx="10" fill="#f4f6f2"/><path d="M30 78 H515" stroke="#c86f63" stroke-width="1.5" stroke-dasharray="5 4"/><text x="8" y="19" fill="#678076" font-size="11">+${fmt(range,0)}</text><text x="16" y="81" fill="#a96861" font-size="11">0</text><text x="8" y="135" fill="#678076" font-size="11">−${fmt(range,0)}</text>${paths.map(d=>`<path d="${d}" fill="none" stroke="#3c8b79" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}<line id="sweepChartMarker" x1="30" x2="30" y1="12" y2="140" stroke="#313f38" stroke-width="1.3" stroke-dasharray="3 3"/><text x="30" y="146" fill="#6f8578" font-size="10">${fmt(samples[0].time,1)} s</text><text x="515" y="146" text-anchor="end" fill="#6f8578" font-size="10">${fmt(samples.at(-1).time,1)} s</text>`;
}
function renderSweepResults(){
 const {model,samples,summary,plan}=sweepSession;
 $('sweepResults').hidden=false;
 const metric=(value,label)=>`<div class="sweep-metric"><strong>${str(value)}</strong><small>${str(label)}</small></div>`;
 $('sweepMetrics').innerHTML=metric(summary.collisionEvents,'Trechos com interferência')+metric(summary.singularityEvents,'Trechos críticos')+metric(summary.minimumGap===null?'—':`${fmt(summary.minimumGap,1)} mm`,'Menor folga geométrica')+metric(summary.invalid,'Posições não resolvidas');
 $('sweepTimeline').innerHTML=samples.map((s,i)=>`<span data-sweep-frame="${i}" class="${sampleSeverity(s)}" title="${fmt(s.time,2)} s · ${sampleSeverity(s)}"></span>`).join('');
 $('sweepChart').innerHTML=sweepGapChart(samples);
 $('sweepEventCount').textContent=String(summary.intervals.length);
 $('sweepEvents').innerHTML=summary.intervals.length?summary.intervals.slice(0,65).map((e,i)=>`<button class="sweep-event ${e.kind}" data-sweep-event="${i}" data-from="${e.startIndex}" data-to="${e.endIndex}"><strong>${e.kind==='collision'?'●':'△'} ${str(e.label)}</strong><small>${fmt(e.startTime,2)}–${fmt(e.endTime,2)} s · ${e.kind==='collision'&&Number.isFinite(e.peakGap)?`Penetração máx. ${fmt(Math.abs(e.peakGap),1)} mm`:'posição crítica'}</small></button>`).join(''):'<div class="sweep-no-events">Nenhuma interferência ou singularidade foi encontrada nas posições amostradas. Isso não comprova ausência de colisões entre elas.</div>';
 $('sweepCaveat').textContent=`${samples.length} quadros em ${fmt(plan.duration,2)} s (passo ≈ ${fmt(plan.duration/(samples.length-1),3)} s). ${summary.minimumAt?.pair?`Menor folga: ${summary.minimumAt.pair.label} em ${fmt(summary.minimumAt.time,2)} s. `:''}${summary.invalid?'Há posições cuja geometria não foi resolvida com precisão suficiente; os alertas nesses trechos são inconclusivos. ':''}${summary.truncated?'Parte das peças não foi examinada pelo limite de segurança de cálculo. ':''}${plan.virtualDrive?'Acionamento virtual: não representa tempo ou velocidade física. ':''}Amostragem discreta em 2D; perfis aproximados, sem espessura real em Z, atrito ou forças. Sem garantir a ausência de interferências entre quadros.`;
 updateSweepPreview(summary.firstCollision??summary.intervals[0]?.startIndex??0);
}
async function runMotionSweep(){
 if(sweepRunning)return;
 const plan=planMotionSweep(M,{duration:Number($('sweepDuration').value),steps:Number($('sweepSteps').value),start:0});
 if(!plan.ok){$('sweepExplanation').textContent=plan.reason;toast(plan.reason,true);return}
 sweepCancelled=false;sweepRunning=true;sweepSession=null;
 playing=false;updatePlay();
 const original=M,originalTime=t,originalInfo=lastSolveInfo,originalResidual=maxResidual,originalManual=manualDrive,originalReport=geometryReport,originalCheck=geometryLastCheck;
 const working=sweepClone(original),samples=[];
 let virtualRange=null;
 if(plan.virtualDrive){
  const v=plan.virtualDrive;
  M=working;
  if(v.kind==='gear'){
   const g=gear(v.id),origin=g.angle,rel=gearRelations(g);
   const low=boundGearAngle(g,origin-Math.PI,rel),high=boundGearAngle(g,origin+Math.PI,rel);
   virtualRange={lo:low.invalid?origin-Math.PI:low.value,hi:high.invalid?origin+Math.PI:high.value};
  }else if(v.kind==='bar'){
   const b=bar(v.id),a=node(b.a),z=node(b.b);virtualRange={anchor:a.fixed?'a':'b',start:Math.atan2(z.y-a.y,z.x-a.x)};
  }
  M=original;
 }
 $('sweepRun').disabled=true;$('sweepCancel').hidden=false;$('sweepProgress').hidden=false;$('sweepResults').hidden=true;$('sweepProgressBar').style.width='0%';$('sweepProgressLabel').textContent='Preparando varredura…';
 $('sweepExplanation').textContent='Varrendo o percurso; o projeto original permanece intacto.';
 let error=null;
 try{
  for(let i=0;i<plan.steps;i++){
   if(sweepCancelled)break;
   const currentTime=plan.start+plan.duration*i/(plan.steps-1);
   M=working;t=currentTime;manualDrive=null;
   if(plan.virtualDrive){const v=plan.virtualDrive,fraction=i/(plan.steps-1);
    if(v.kind==='gear')manualDrive={kind:'gear',id:v.id,angle:virtualRange.lo+(virtualRange.hi-virtualRange.lo)*fraction};
    if(v.kind==='node'){const n=node(v.id),s=n.slider,an=rad(s.angle),q=(fraction-.5)*s.range;manualDrive={kind:'node',id:v.id,x:s.ox+Math.cos(an)*q,y:s.oy+Math.sin(an)*q};}
    if(v.kind==='scissor'){const sc=scissor(v.id),limits=scissorHeightLimits(sc);sc.height=limits.lo+(limits.hi-limits.lo)*fraction;placeScissor(sc);}
    if(v.kind==='bar')manualDrive={kind:'bar',id:v.id,anchor:virtualRange.anchor,angle:virtualRange.start-Math.PI+TAU*fraction};
   }
   solve(96);
   const report=analyzeGeometry(M,{maxParts:180,maxIssues:100});
   const valid=Number.isFinite(maxResidual)&&maxResidual<=.85&&lastSolveInfo.status!=='too-large';
   samples.push({time:currentTime,valid,residual:maxResidual,pose:capturePose(M),report});
   // Restaurar antes de renderizar o progresso; a UI nunca manipula o modelo temporário.
   M=original;t=originalTime;lastSolveInfo=originalInfo;maxResidual=originalResidual;manualDrive=originalManual;
   if(i%4===3||i===plan.steps-1){
    const percentage=(i+1)/plan.steps*100;
    $('sweepProgressBar').style.width=percentage.toFixed(1)+'%';
    $('sweepProgressLabel').textContent=`${i+1}/${plan.steps} posições analisadas`;
    await sweepFrame();
   }
  }
 }catch(e){error=e;console.error('Varredura:',e)}
 finally{
  M=original;t=originalTime;lastSolveInfo=originalInfo;maxResidual=originalResidual;manualDrive=originalManual;geometryReport=originalReport;geometryLastCheck=originalCheck;
  sweepRunning=false;$('sweepRun').disabled=false;$('sweepCancel').hidden=true;$('sweepProgress').hidden=true;
 }
 if(error){$('sweepExplanation').textContent='Não foi possível concluir a análise: '+error.message;toast('Erro ao analisar percurso.',true);return}
 if(sweepCancelled){$('sweepExplanation').textContent='Varredura interrompida. Nenhuma alteração foi feita no projeto.';return}
 const summary=summarizeMotionSweep(samples);sweepSession={model:sweepClone(original),plan,samples,summary};
 $('sweepExplanation').textContent=`Percurso amostrado: ${summary.collisionEvents} trecho(s) de interferência, ${summary.singularityEvents} trecho(s) críticos. Clique em um intervalo ou deslize o marcador para inspecionar.`;
 renderSweepResults();
}
function exportSweepCSV(){if(!sweepSession)return;
 const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const columns=['Amostra','Tempo (s)','Estado','Interferências','Singularidades','Proximidades','Folga mínima (mm)','Par de peças','Erro residual (mm)'];
 const content=[columns.map(esc).join(';'),...sweepSession.samples.map((s,i)=>[i+1,s.time.toFixed(5),sampleSeverity(s),s.report?.collisions.length||0,s.report?.singularities.length||0,s.report?.near.length||0,Number.isFinite(s.report?.minGap)?s.report.minGap.toFixed(3):'',s.report?.minPair?.label||'',s.residual.toFixed(5)].map(esc).join(';'))].join('\r\n');
 download('kinetika-v11-percurso.csv','\uFEFF'+content,'text/csv;charset=utf-8');
}
$('sweepBtn').onclick=openSweep;
$('geometrySweep').onclick=()=>{$('geometryModal').classList.remove('show');openSweep()};
$('sweepRun').onclick=runMotionSweep;
$('sweepRerun').onclick=runMotionSweep;
$('sweepCancel').onclick=()=>{sweepCancelled=true;$('sweepExplanation').textContent='Interrompendo após a amostra atual…'};
$('sweepExport').onclick=exportSweepCSV;
$('sweepCursor').oninput=e=>updateSweepPreview(Number(e.target.value));
$('sweepTimeline').addEventListener('click',e=>{const target=e.target.closest('[data-sweep-frame]');if(target)updateSweepPreview(Number(target.dataset.sweepFrame))});
$('sweepEvents').addEventListener('click',e=>{const target=e.target.closest('[data-sweep-event]');if(target)updateSweepPreview(Number(target.dataset.from))});
$('sweepModal').addEventListener('click',e=>{if(e.target===$('sweepModal')||e.target.closest('[data-close="sweepModal"]'))closeSweep()},true);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('sweepModal').classList.contains('show'))closeSweep()},true);

$('undoBtn').onclick=undoProject;$('redoBtn').onclick=redoProject;
// Complete a gesture as one history step, even when it comprises many pointermove updates.
stage.addEventListener('pointerup',()=>queueMicrotask(commitChange));
stage.addEventListener('pointercancel',()=>queueMicrotask(commitChange));
// Tool buttons, actions, presets and inspector events share a single history boundary.
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(b&&!['undoBtn','redoBtn','diagnoseBtn','diagnoseRefresh'].includes(b.id))queueMicrotask(commitChange);
});
document.addEventListener('change',e=>{if(e.target.matches('input, select'))queueMicrotask(commitChange)});
document.addEventListener('pointerup',e=>{if(e.target.closest('input[type=range]'))queueMicrotask(commitChange)});
window.addEventListener('beforeunload',()=>{try{localStorage.setItem(AUTOSAVE_KEY,JSON.stringify(serialize()))}catch{}});

$('palette').addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool)});
$('newPreset').onclick=()=>$('examplesModal').classList.add('show');
$('newBlank').onclick=()=>{goPreset('blank');toast('Área de trabalho limpa. Comece pelos apoios.')};
$('exportBtn').onclick=exportJSON;$('svgBtn').onclick=exportSVG;
$('importBtn').onclick=()=>$('fileInput').click();
$('fileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{loadJSON(JSON.parse(await f.text()));commitChange()}catch(err){toast('Falha ao importar: '+err.message,true)}e.target.value=''});
$('helpBtn').onclick=()=>$('helpModal').classList.add('show');
$('scissorBuilderBtn').onclick=()=>$('scissorModal').classList.add('show');
$('buildScissor').onclick=()=>createScissor($('scissorStages').value,$('scissorWidth').value,$('scissorHeight').value,false);
$('inspectorToggle').onclick=()=>$('inspector').classList.toggle('open');
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.remove('show')));
document.querySelectorAll('.modal-back').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('show')}));
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>goPreset(b.dataset.example)));
$('playBtn').onclick=()=>{playing=!playing;updatePlay();if(playing&&!motorTarget())toast('Sem motor: configure um acionamento para ver movimento.');};
$('resetBtn').onclick=()=>{t=0;playing=false;updatePlay();solve(180);render();updateTime()};
$('stepBtn').onclick=()=>{playing=false;updatePlay();t+=.05;solve(120);render();updateTime()};
$('speedControl').oninput=e=>{speed=Number(e.target.value);$('speedText').textContent=speed.toFixed(1)+'×'};
$('zoomIn').onclick=()=>{cam.scale=clamp(cam.scale*1.2,.3,4.5);render()};$('zoomOut').onclick=()=>{cam.scale=clamp(cam.scale/1.2,.3,4.5);render()};$('fitBtn').onclick=fit;
$('properties').addEventListener('input',e=>{const anchor=e.target.closest('[data-anchor-slider]');if(anchor){const r=rack(anchor.dataset.anchorSlider);if(r){setRackAnchor(r,Number(anchor.value));solve(100);render();const number=$('properties').querySelector('[data-prop="anchorX"]');if(number)number.value=String(r.anchorX)}return}
  const slider=e.target.closest('[data-rack-slider]');if(!slider)return;playing=false;updatePlay();manualRackPosition(rack(slider.dataset.rackSlider),Number(slider.value),true)});
$('properties').addEventListener('change',e=>{let p=e.target.closest('[data-prop]');if(p)applyProperty(p.dataset.prop,p.value,p.checked)});
$('properties').addEventListener('click',e=>{let act=e.target.closest('[data-act]');if(!act)return;if(act.dataset.act==='fit')fit();
 if(act.dataset.act==='detachJoint'||act.dataset.act==='detachPoint'){detachJoint(act.dataset.linkId);commitChange()}
 if(act.dataset.act==='moveGuide'&&sel?.type==='guide'){setTool('move');toast('Arraste o trilho para movimentar a guia e a montagem conectada.')}
 if(act.dataset.act==='rotateGuide'&&sel?.type==='guide'){setTool('rotate');toast('Arraste a linha da guia para ajustar a orientação.')}
 if(['draftBar','lockBar'].includes(act.dataset.act)&&sel?.type==='bar'){
   const b=bar(sel.id);if(b){if(act.dataset.act==='draftBar'){b.dimensionMode='draft';toast('✎ Dimensionamento ativado: experimente até definir a cota.')}else{const a=node(b.a),z=node(b.b);b.length=dist(a,z);b.dimensionMode='locked';toast('🔒 Comprimento fixado em '+fmt(b.length,2)+' mm. Simulações não podem alterá-lo.')}solve(120);render();renderProperties();commitChange()}
 }if(act.dataset.act==='detachPoint'){removePointLink(act.dataset.linkId)}if(['anchorStart','anchorCenter','anchorEnd'].includes(act.dataset.act)&&sel?.type==='rack'){const r=rack(sel.id);const pos=act.dataset.act==='anchorStart'?-r.length/2+6:act.dataset.act==='anchorEnd'?r.length/2-6:0;setRackAnchor(r,pos);solve(120);renderProperties();render();}if(act.dataset.act==='unlinkPin'){const l=sel?.type==='rack'?rackLink(sel.id):sel?.type==='scissor'?scissorLink(sel.id):null;if(l){detachPinLink(l.id);solve(100);renderProperties();render();}}if(act.dataset.act==='alignSelectionX')useTwoSelection('x');if(act.dataset.act==='alignSelectionY')useTwoSelection('y');if(act.dataset.act==='delete'&&sel)deleteItem(sel.type,sel.id);if(act.dataset.act==='disconnectRack'&&sel?.type==='rack'){disconnectRack(rack(sel.id));solve();renderProperties();render();toast('Cremalheira desconectada; permanece orientável.')}if(act.dataset.act==='stopMotor'){M.gears.forEach(g=>g.baseAngle=g.angle);removeMotors();playing=false;t=0;updatePlay();solve();render();renderProperties();toast('Acionamento removido.')}if(['motor','spring'].includes(act.dataset.act)&&sel){let obj=sel.type==='node'?node(sel.id):sel.type==='bar'?bar(sel.id):gear(sel.id);if(obj&&makeMotor(sel.type,obj,act.dataset.act))renderProperties()}if(act.dataset.act==='eccentric'&&sel?.type==='gear'){let nn=addFollower(gear(sel.id));select('node',nn.id);solve()}});
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redoProject();else undoProject();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoProject();return}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(document.querySelector('.modal-back.show')){if(e.key==='Escape')document.querySelectorAll('.modal-back').forEach(m=>m.classList.remove('show'));return}if(e.key==='Escape'){pending=null;pendingPort=null;setTool('select')}if(e.key===' '){e.preventDefault();$('playBtn').click()}if(e.key==='Delete'||e.key==='Backspace'){if(sel){deleteItem(sel.type,sel.id);commitChange()}}const keys={u:'unlink',j:'joint',v:'select',g:'move',r:'rotate',p:'node',f:'fixed',b:'bar',s:'slider',m:'motor'};if(keys[e.key.toLowerCase()])setTool(keys[e.key.toLowerCase()])});
let previous=0;function tick(ms){if(!previous)previous=ms;const dt=clamp((ms-previous)/1000,0,.05);previous=ms;if(playing){t+=dt*speed;solve();render();updateTime()}requestAnimationFrame(tick)}
new ResizeObserver(()=>render()).observe(stage);
goPreset('rackdual');select('rack',M.racks[1].id);
try{const raw=localStorage.getItem(AUTOSAVE_KEY);if(raw){const saved=JSON.parse(raw);loadJSON(saved);toast('Projeto anterior recuperado do navegador.')}}catch(err){console.warn('Autosave não carregado:',err)}
history.seed(M);updateHistoryUI();requestAnimationFrame(tick);

// KINÉTIKA V11 — percurso amostrado.

// V15 · Projeto generativo por componentes, validação determinística e distinção explícita IA/biblioteca local.
let advisorPlan=null,advisorOnline=false,advisorProvider=null,advisorBusy=false;
function advisorHtml(plan){
 const p=normalizeAdvisorPlan(plan),a=p.assembly||{nodes:[],bars:[],gears:[],racks:[],mates:[]};
 const counts=p.template==='custom'?`<p class="advisor-note"><strong>Montagem original:</strong> ${a.nodes.length} pivôs/apoios · ${a.bars.length} barras · ${a.gears.length} rodas · ${a.racks.length} cremalheiras · ${a.mates.length} transmissões. As medidas são hipóteses iniciais.</p>`:'';
 const note=p.template==='custom'?'O grafo será validado antes da inserção. Simule e avalie pontos mortos, colisões e graus de liberdade após inserir.':'A inserção usa exclusivamente um exemplo da biblioteca, não uma geometria nova gerada pela IA.';
 const button=p.template==='none'?'<p class="advisor-note">Sem montagem automática válida para esta ideia. Especifique entradas, saídas e apoios para obter uma proposta mais concreta.</p>':`<button class="btn primary" id="advisorApply">＋ Inserir proposta no projeto</button><p class="advisor-note">${str(note)}</p>`;
 return `<div class="advisor-result-head"><span class="advisor-tag">${p.mode==='ai'?'◉ IA generativa conectada':'◇ Exemplo local · sem IA'}</span><h3>${str(p.title)}</h3><p>${str(p.explanation)}</p></div>${counts}<div class="advisor-layout"><div><strong>Montagem proposta</strong><ol>${p.steps.map(step=>`<li>${str(step)}</li>`).join('')}</ol></div><div><strong>Restrições e cuidados</strong><ul>${p.warnings.map(w=>`<li>${str(w)}</li>`).join('')}</ul></div></div>${button}`;
}
async function advisorStatus(){
 const badge=$('advisorStatus');if(!badge)return;
 badge.textContent='Verificando disponibilidade do Gemini…';
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),4500);
  const res=await fetch('/.netlify/functions/mechanical-advisor',{signal:ctrl.signal});clearTimeout(timer);
  if(!res.ok)throw Error('Serviço indisponível');
  const data=await res.json();advisorOnline=!!data.available;advisorProvider=advisorOnline?data.provider:null;
  badge.textContent=advisorOnline?(advisorProvider==='gemini'?'● Gemini online disponível. Informe o código de acesso para gerar uma montagem original.':'● OpenAI online disponível. Informe o código de acesso para gerar uma montagem original.'):'○ IA não configurada no Netlify. Adicione GEMINI_API_KEY e KINETIKA_ASSISTANT_ACCESS_CODE; exemplos locais disponíveis abaixo.';
 }catch{advisorOnline=false;advisorProvider=null;badge.textContent='○ IA online não respondeu. Utilize a biblioteca local ou verifique as funções do Netlify.';}
 $('advisorAccessRow').hidden=!advisorOnline;
}
function showAdvisorPlan(plan){advisorPlan=normalizeAdvisorPlan(plan);$('advisorResult').innerHTML=advisorHtml(advisorPlan);}
function advisorError(message){advisorPlan=null;$('advisorResult').innerHTML=`<div class="advisor-empty"><strong>Não foi possível criar uma montagem com IA.</strong><p>${str(message)}</p><p>O projeto não foi alterado. Você pode corrigir a configuração ou usar conscientemente um exemplo da biblioteca local.</p></div>`;}
async function askAdvisor(){
 if(advisorBusy)return;
 const question=$('advisorQuestion').value.trim();if(question.length<6){$('advisorStatus').textContent='Descreva seu objetivo com pelo menos seis caracteres.';return;}
 if(!advisorOnline){advisorError('A API do Gemini não está disponível neste site. Configure a chave e o código no Netlify para gerar um mecanismo novo.');$('advisorStatus').textContent='IA indisponível · nenhuma sugestão apresentada como generativa.';return;}
 const access=$('advisorAccess').value.trim();if(!access){advisorError('Informe o código de acesso ao Gemini configurado no Netlify.');$('advisorAccess').focus();return;}
 advisorBusy=true;$('advisorAsk').disabled=true;$('advisorStatus').textContent=`Consultando ${advisorProvider==='gemini'?'Gemini':'OpenAI'} para gerar geometria e conexões…`;
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),34500);
  let response;
  try{response=await fetch('/.netlify/functions/mechanical-advisor',{signal:ctrl.signal,method:'POST',headers:{'content-type':'application/json','x-kinetika-access':access},body:JSON.stringify({question,project:modelSummary(M)})});}finally{clearTimeout(timer)}
  const result=await response.json();if(!response.ok)throw Error(result.error||`Servidor HTTP ${response.status}`);
  showAdvisorPlan({...result.plan,mode:'ai'});
  const a=advisorPlan.assembly;const shape=advisorPlan.template==='custom'?` · ${a.nodes.length} pivôs, ${a.bars.length} barras, ${a.gears.length} rodas`:'';
  $('advisorStatus').textContent=`● ${result.provider==='gemini'?'Gemini':'OpenAI'} respondeu com uma proposta${shape}. Analise e confirme antes de inserir.`;
 }catch(err){const msg=err.name==='AbortError'?'Tempo de resposta esgotado.':String(err.message).slice(0,220);advisorError(msg);$('advisorStatus').textContent='IA indisponível · não substituímos a resposta por outro mecanismo.';}
 finally{advisorBusy=false;$('advisorAsk').disabled=false;}
}
function localAdvisor(){
 const question=$('advisorQuestion').value.trim();if(question.length<6){$('advisorStatus').textContent='Descreva o movimento para consultar a biblioteca local.';return;}
 try{showAdvisorPlan(suggestLocalPlan(question));$('advisorStatus').textContent='◇ Exemplo local sem IA. Não é uma proposta gerada pelo Gemini.';}
 catch(err){advisorError(err.message)}
}
function addAdvisorTemplate(){
 if(!advisorPlan||advisorPlan.template==='none')return;
 const snapshot=JSON.stringify(M);
 try{
  playing=false;updatePlay();
  const maxX=M.nodes.length?Math.max(...M.nodes.map(n=>n.x)):cam.x;
  const centerX=M.nodes.length?maxX+270:cam.x,centerY=M.nodes.length?(Math.min(...M.nodes.map(n=>n.y))+Math.max(...M.nodes.map(n=>n.y)))/2:cam.y;
  if(advisorPlan.template==='custom'){
   const made=appendCustomAssembly(M,advisorPlan.assembly,centerX,centerY);
   const residual=solve(180);
   if(!Number.isFinite(residual)||residual>1)throw Error(`restrições iniciais incompatíveis (residual ${fmt(residual,2)} mm). Revise apoios e medidas.`);
   const firstGear=made.gears[0],firstBar=made.bars[0];
   if(firstGear)select('gear',firstGear);else if(firstBar)select('bar',firstBar);
   toast(`Montagem criada: ${made.bars.length} barras, ${made.gears.length} rodas, ${made.racks.length} cremalheiras. Verifique os limites 2D.`);
  }else if(advisorPlan.template==='cross_racks'){
   const made=appendCrossRacks(M,centerX,centerY);solve(120);select('gear',made.gearId);toast('Exemplo em cruz inserido; inspecione as interferências 2D.');
  }else if(advisorPlan.template==='scissor'){createScissor(3,110,140,false);toast('Exemplo de pantógrafo inserido no projeto atual.');}
  commitChange();$('advisorModal').classList.remove('show');fit();
 }catch(err){M=JSON.parse(snapshot);stablePose=null;solve();render();toast('Montagem rejeitada: '+err.message,true);advisorStatusTextError(err.message)}
}
function advisorStatusTextError(message){$('advisorStatus').textContent=`Proposta não inserida: ${String(message).slice(0,130)}`}
$('advisorBtn').addEventListener('click',()=>{$('advisorModal').classList.add('show');advisorStatus()});
$('advisorAsk').addEventListener('click',askAdvisor);
$('advisorLocal').addEventListener('click',localAdvisor);
$('advisorQuestion').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')askAdvisor()});
$('advisorResult').addEventListener('click',e=>{if(e.target.closest('#advisorApply'))addAdvisorTemplate()});
document.querySelectorAll('[data-advisor-prompt]').forEach(button=>button.addEventListener('click',()=>{$('advisorQuestion').value=button.dataset.advisorPrompt;localAdvisor()}));
