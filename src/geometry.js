/** KINÉTIKA V10 · Auditoria geométrica 2D.
 * Inspeção de envelopes esquemáticos (não perfis reais dos dentes, peças 3D ou tensões).
 * Contatos em juntas articuladas e engrenamentos explicitamente definidos são intencionais.
 */
const hypot = (a,b) => Math.hypot(a,b);
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const dist = (a,b) => hypot(a.x-b.x,a.y-b.y);
const center = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const vec = (a,b) => ({x:b.x-a.x,y:b.y-a.y});
const cross = (a,b) => a.x*b.y-a.y*b.x;
const dot = (a,b) => a.x*b.x+a.y*b.y;
export function closestPointOnSegment(p,a,b) {
 const v=vec(a,b),d=dot(v,v),t=d<1e-12?0:clamp(dot(vec(a,p),v)/d,0,1);
 return {x:a.x+v.x*t,y:a.y+v.y*t,t};
}
export function segmentSeparation(a,b,c,d) {
 // Segmentos que se cruzam fisicamente devem ser tratados como distância zero.
 const v=vec(a,b),w=vec(c,d),den=cross(v,w);
 if(Math.abs(den)>1e-9){
  const dc=vec(a,c),t=cross(dc,w)/den,u=cross(dc,v)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+t*v.x,y:a.y+t*v.y};return {distance:0,a:p,b:p,intersects:true}}
 }
 const candidates=[
  [a,closestPointOnSegment(a,c,d)],
  [b,closestPointOnSegment(b,c,d)],
  [closestPointOnSegment(c,a,b),c],
  [closestPointOnSegment(d,a,b),d]
 ];
 const best=candidates.map(([p,q])=>({distance:dist(p,q),a:p,b:q,intersects:false})).sort((x,y)=>x.distance-y.distance)[0];
 return best;
}
/**
 * report.collisions: penetrations of physical-envelope proxies.
 * report.near: close approaches (not a collision).
 * report.singularities: local geometric toggle candidates, not a proof of jamming.
 */
export function analyzeGeometry(M,options={}) {
 const clearance=Math.max(0,Number(options.clearance??2));
 const barHalfWidth=Math.max(.1,Number(options.barHalfWidth??5));
 const rackHalfWidth=Math.max(.1,Number(options.rackHalfWidth??9));
 const maxParts=Math.max(12,Number(options.maxParts??180));
 const maxIssues=Math.max(5,Number(options.maxIssues??60));
 const nodes=new Map((M.nodes||[]).map(n=>[n.id,n]));
 const gears=new Map((M.gears||[]).map(g=>[g.id,g]));
 const rackByNode=new Map((M.racks||[]).map(r=>[r.node,r]));
 const linkedRackNodes=new Set((M.pointLinks||[]).map(l=>`${l.rackId}/${l.nodeId}`));
 const linkedNodePairs=new Set((M.nodeLinks||[]).flatMap(l=>[`${l.a}/${l.b}`,`${l.b}/${l.a}`]));
 const jointNodeIds=new Set();
 for(const s of M.scissors||[]){for(const id of [...(s.topIds||[]),...(s.bottomIds||[]),...(s.centerIds||[])])jointNodeIds.add(id)}
 const parts=[];
 for(const b of M.bars||[]){const a=nodes.get(b.a),z=nodes.get(b.b);if(finitePoint(a)&&finitePoint(z)&&dist(a,z)>1e-7)
  parts.push({type:'bar',id:b.id,label:`Barra ${b.id}`,a,b:z,r:barHalfWidth,nodeIds:[b.a,b.b]});}
 for(const g of M.gears||[]){const n=nodes.get(g.node);if(finitePoint(n)&&Number.isFinite(g.radius)&&g.radius>0)parts.push({type:'wheel',id:g.id,label:`${g.type==='pulley'?'Polia':'Engrenagem'} ${g.id}`,center:n,r:g.radius,nodeId:g.node,gear:g});}
 for(const rack of M.racks||[]){const n=nodes.get(rack.node),angle=n?.slider?.angle;if(!finitePoint(n)||!Number.isFinite(angle)||!(rack.length>0))continue;
  const u={x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)};
  const hh=rack.length/2;parts.push({type:'rack',id:rack.id,label:`Cremalheira ${rack.id}`,a:{x:n.x-u.x*hh,y:n.y-u.y*hh},b:{x:n.x+u.x*hh,y:n.y+u.y*hh},r:rackHalfWidth,nodeId:rack.node,gearId:rack.gearId});
 }
 const truncated=parts.length>maxParts;
 const used=truncated?parts.slice(0,maxParts):parts;
 const collisions=[],near=[],singularities=[];
 let minGap=Infinity,minPair=null;
 let totalPairs=0;
 const sharesJoint=(a,b)=>a.type==='bar'&&b.type==='bar'&&a.nodeIds.some(id=>b.nodeIds.some(other=>other===id||linkedNodePairs.has(`${id}/${other}`)));
 const mounted=(bar,wheel)=>bar.type==='bar'&&wheel.type==='wheel'&&bar.nodeIds.some(id=>id===wheel.nodeId||linkedNodePairs.has(`${id}/${wheel.nodeId}`));
 const attachedRack=(bar,rack)=>bar.type==='bar'&&rack.type==='rack'&&(bar.nodeIds.includes(rack.nodeId)||bar.nodeIds.some(id=>linkedRackNodes.has(`${rack.id}/${id}`)||[...linkedNodePairs].some(pair=>pair.startsWith(`${id}/`)&&linkedRackNodes.has(`${rack.id}/${pair.split('/')[1]}`))));
 const connectedWheel=(a,b)=>(M.mates||[]).find(m=>(m.a===a.id&&m.b===b.id)||(m.a===b.id&&m.b===a.id));
 function record(a,b,measure,radiusAdjust=0){
  const gap=measure.distance-a.r-b.r+radiusAdjust;
  if(gap<minGap){minGap=gap;minPair={aId:a.id,bId:b.id,label:`${a.label} × ${b.label}`};}
  if(collisions.length+near.length>=maxIssues)return;
  const pt=center(measure.a,measure.b);
  const item={id:`${a.id}/${b.id}`,label:`${a.label} × ${b.label}`,aId:a.id,bId:b.id,gap,at:pt,kind:gap<-.65?'collision':'near',description:gap<-.65?`Sobreposição geométrica aproximada de ${Math.abs(gap).toFixed(1)} mm.`:`Folga estimada de ${Math.max(0,gap).toFixed(1)} mm.`};
  if(gap<-.65)collisions.push(item);else if(gap<clearance&&gap>=-.65)near.push(item);
 }
 for(let i=0;i<used.length;i++)for(let j=i+1;j<used.length;j++){
  const a=used[i],b=used[j];totalPairs++;
  if(sharesJoint(a,b)||mounted(a,b)||mounted(b,a)||attachedRack(a,b)||attachedRack(b,a))continue;
  if(a.type==='wheel'&&b.type==='wheel'){
    const mate=connectedWheel(a,b);if(mate?.type==='belt')continue;
    // Engrenagens acopladas encostam nas circunferências primitivas por definição.
    const allowed=mate?.type==='gear'?Math.max(2,(a.gear.module||3)*.8):0;
    record(a,b,{distance:dist(a.center,b.center),a:a.center,b:b.center},allowed);continue;
  }
  if(a.type==='wheel'||b.type==='wheel'){
    const wheel=a.type==='wheel'?a:b,linear=a.type==='wheel'?b:a;
    if(linear.type==='rack'&&linear.gearId===wheel.id)continue;
    const q=closestPointOnSegment(wheel.center,linear.a,linear.b);
    record(a,b,{distance:dist(q,wheel.center),a:wheel.center,b:q});continue;
  }
  record(a,b,segmentSeparation(a.a,a.b,b.a,b.b));
 }
 const incidence=new Map();
 for(const b of M.bars||[]){for(const id of [b.a,b.b]){if(!incidence.has(id))incidence.set(id,[]);incidence.get(id).push(b)}}
 for(const [id,bs] of incidence){
  if(bs.length!==2||jointNodeIds.has(id))continue;
  const n=nodes.get(id),q1=nodes.get(bs[0].a===id?bs[0].b:bs[0].a),q2=nodes.get(bs[1].a===id?bs[1].b:bs[1].a);
  if(!finitePoint(n)||!finitePoint(q1)||!finitePoint(q2))continue;
  const a=vec(n,q1),b=vec(n,q2),d=hypot(a.x,a.y)*hypot(b.x,b.y);
  if(d<1e-7)continue;
  const sine=Math.abs(cross(a,b))/d,cosine=dot(a,b)/d;
  if(sine<Math.sin(3*Math.PI/180)){
    singularities.push({id:`node/${id}`,label:`Junta ${id}: barras quase colineares`,at:{x:n.x,y:n.y},angle:Math.acos(clamp(cosine,-1,1))*180/Math.PI,description:'Alinhamento crítico (ponto morto potencial). Verifique a mobilidade e o sentido de transmissão ao atravessar essa posição.'});
  }
 }
 for(const s of M.scissors||[]){if(!(s.diagonal>0))continue;const ratio=s.height/s.diagonal;
  if(ratio>.96||ratio<.24){const at={x:s.x,y:s.y};if(finitePoint(at))singularities.push({id:`scissor/${s.id}`,label:`Pantógrafo ${s.id}: limite de abertura`,at,angle:null,description:'Relação altura/diagonal próxima de extremo geométrico; pode haver amplificação de esforços ou perda de movimento útil.'});}
 }
 collisions.sort((a,b)=>a.gap-b.gap);near.sort((a,b)=>a.gap-b.gap);
 return {collisions,near,singularities,partsInspected:used.length,totalParts:parts.length,pairsChecked:totalPairs,truncated,clearance,minGap:Number.isFinite(minGap)?minGap:null,minPair,model:'2D',counts:{collisions:collisions.length,near:near.length,singularities:singularities.length}};
}

// KINÉTIKA V11 — menor folga entre pares.
