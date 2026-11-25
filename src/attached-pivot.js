/** Pivôs embutidos em barras, cremalheiras, engrenagens e polias.
 * Permanecem solidários à peça, sem dividir a barra original.
 * Cinemática plana idealizada (não analisa cargas).
 */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rad=d=>d*Math.PI/180;
export function attachedPivotPosition(model,f){
 if(!f)return null;
 const find=(arr,id)=>arr?.find(v=>v.id===id);
 if(f.bar){
  const b=find(model.bars,f.bar);if(!b)return null;
  const a=find(model.nodes,b.a),z=find(model.nodes,b.b);if(!a||!z)return null;
  const t=clamp(Number(f.ratio)||0,.001,.999);
  return {x:a.x+t*(z.x-a.x),y:a.y+t*(z.y-a.y)};
 }
 if(f.rack){
  const r=find(model.racks,f.rack),n=r&&find(model.nodes,r.node);
  if(!n?.slider)return null;const a=rad(n.slider.angle),q=Number(f.offset)||0;
  return {x:n.x+q*Math.cos(a),y:n.y+q*Math.sin(a)};
 }
 if(f.gear){
  const g=find(model.gears,f.gear),n=g&&find(model.nodes,g.node);
  if(!n)return null;const c=Math.cos(g.angle),s=Math.sin(g.angle);
  return {x:n.x+f.rx*c-f.ry*s,y:n.y+f.rx*s+f.ry*c};
 }
 return null;
}
export function attachPivot(model,kind,id,p){
 const find=(a,id)=>a.find(v=>v.id===id);
 let f;
 if(kind==='bar'){
  const b=find(model.bars,id);if(!b)throw Error('Barra não encontrada.');
  const a=find(model.nodes,b.a),z=find(model.nodes,b.b);if(!a||!z)throw Error('Barra sem extremidades.');
  const dx=z.x-a.x,dy=z.y-a.y,d2=dx*dx+dy*dy;if(d2<1)throw Error('Barra curta demais.');
  f={bar:id,ratio:clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d2,.05,.95)};
 }else if(kind==='rack'){
  const r=find(model.racks,id),n=r&&find(model.nodes,r.node);
  if(!n?.slider)throw Error('Cremalheira sem guia.');
  const a=rad(n.slider.angle),offset=(p.x-n.x)*Math.cos(a)+(p.y-n.y)*Math.sin(a);
  f={rack:id,offset:clamp(offset,-r.length/2+8,r.length/2-8)};
 }else if(kind==='gear'){
  const g=find(model.gears,id),n=g&&find(model.nodes,g.node);
  if(!n)throw Error('Roda sem eixo.');
  const c=Math.cos(g.angle),s=Math.sin(g.angle),dx=p.x-n.x,dy=p.y-n.y;
  let rx=dx*c+dy*s,ry=-dx*s+dy*c;
  const len=Math.hypot(rx,ry),r=clamp(len,g.radius*.2,g.radius*.94);
  if(len<1e-9){rx=g.radius*.65;ry=0}else{rx*=r/len;ry*=r/len}
  f={gear:id,rx,ry};
 }else throw Error('Escolha barra, cremalheira ou roda.');
 const point=attachedPivotPosition(model,f);if(!point)throw Error('Não foi possível posicionar o pivô.');
 const n={id:'n'+model.next++,x:point.x,y:point.y,fixed:false,slider:null,follower:f,motor:null};
 model.nodes.push(n);return n;
}
export function detachPivotsFrom(model,kind,id){
 let total=0;for(const n of model.nodes)if(n.follower?.[kind]===id){n.follower=null;total++}
 return total;
}
