/** KINÉTIKA V15 — DSL declarativa limitada para propostas originais de IA.
 * Somente entidades geométricas tipadas; não interpreta scripts, funções, SVG ou HTML.
 * A validação é de forma e topologia local. Não certifica cinemática, fabricação ou segurança.
 */
const CAP={nodes:28,bars:36,gears:8,racks:8,mates:10};
const ids=/^[A-Za-z][A-Za-z0-9_-]{0,23}$/;
const numeric=(x,label,lo,hi)=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<lo||x>hi)throw Error(`${label}: informe um número entre ${lo} e ${hi}.`);
 return x;
};
const assertId=(v,label)=>{if(typeof v!=='string'||!ids.test(v))throw Error(`${label}: referência inválida.`);return v};
const collection=(v,key)=>{if(!Array.isArray(v))throw Error(`O grupo '${key}' precisa ser uma lista.`);if(v.length>CAP[key])throw Error(`Limite de ${CAP[key]} elementos em '${key}'.`);return v};
export const emptyAssembly=()=>({nodes:[],bars:[],gears:[],racks:[],mates:[]});

export function validateCustomAssembly(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('A IA não forneceu uma montagem estruturada.');
 const all=new Set(), nodeIds=new Set(),gearIds=new Set(),rackIds=new Set();
 const unique=(id,label)=>{assertId(id,label);if(all.has(id))throw Error(`Identificador duplicado: ${id}.`);all.add(id);return id};
 const nodes=collection(raw.nodes,'nodes').map((n,i)=>{
  if(!n||typeof n!=='object')throw Error('Nó inválido.');
  const id=unique(n.id,`pivô ${i+1}`);nodeIds.add(id);
  const x=numeric(n.x,`${id}.x`,-700,700),y=numeric(n.y,`${id}.y`,-700,700);
  if(typeof n.fixed!=='boolean')throw Error(`${id}: fixed precisa ser verdadeiro ou falso.`);
  const sliderAngle=numeric(n.sliderAngle,`${id}.sliderAngle`,-360,360);
  const sliderRange=numeric(n.sliderRange,`${id}.sliderRange`,0,900);
  if(n.fixed&&sliderRange>0)throw Error(`${id}: um pivô não pode ser fixo e deslizante simultaneamente.`);
  return {id,x,y,fixed:n.fixed,sliderAngle,sliderRange};
 });
 const byNode=new Map(nodes.map(n=>[n.id,n]));
 const bars=collection(raw.bars,'bars').map((b,i)=>{
  const a=assertId(b?.a,`barra ${i+1}.a`),c=assertId(b?.b,`barra ${i+1}.b`);
  if(!nodeIds.has(a)||!nodeIds.has(c)||a===c)throw Error(`Barra ${i+1}: pontos inexistentes ou repetidos.`);
  const p=byNode.get(a),q=byNode.get(c);if(Math.hypot(p.x-q.x,p.y-q.y)<8)throw Error(`Barra ${i+1}: comprimento inferior a 8 mm.`);
  return {a,b:c};
 });
 const pairs=new Set();for(const b of bars){const k=[b.a,b.b].sort().join('|');if(pairs.has(k))throw Error('Há uma barra duplicada.');pairs.add(k)}
 const gears=collection(raw.gears,'gears').map((g,i)=>{
  const id=unique(g?.id,`engrenagem ${i+1}`);gearIds.add(id);
  const node=assertId(g.node,`${id}.node`);if(!nodeIds.has(node))throw Error(`${id}: eixo inexistente.`);
  if(!['gear','pulley'].includes(g.type))throw Error(`${id}: tipo de roda inválido.`);
  const teeth=numeric(g.teeth,`${id}.teeth`,8,96),module=numeric(g.module,`${id}.module`,.5,10);
  if(!Number.isInteger(teeth))throw Error(`${id}: dentes inteiros obrigatórios.`);
  return {id,node,type:g.type,teeth,module};
 });
 const racks=collection(raw.racks,'racks').map((r,i)=>{
  const id=unique(r?.id,`cremalheira ${i+1}`);rackIds.add(id);
  const node=assertId(r.node,`${id}.node`);if(!nodeIds.has(node))throw Error(`${id}: cursor inexistente.`);
  if(byNode.get(node).sliderRange<=0)throw Error(`${id}: a cremalheira exige cursor em guia linear.`);
  const gear=typeof r.gear==='string'?r.gear:'';
  if(gear&&(!gearIds.has(gear)||gears.find(x=>x.id===gear)?.type!=='gear'))throw Error(`${id}: engrenagem motriz inexistente ou não dentada.`);
  const side=numeric(r.side,`${id}.side`,-1,1);if(![-1,1].includes(side))throw Error(`${id}: lado da cremalheira precisa ser -1 ou 1.`);
  const length=numeric(r.length,`${id}.length`,55,480);
  return {id,node,gear,side,length};
 });
 const usedRackNodes=new Set();for(const r of racks){if(usedRackNodes.has(r.node))throw Error('Duas cremalheiras não podem compartilhar o mesmo cursor.');usedRackNodes.add(r.node)}
 const mates=collection(raw.mates,'mates').map((m,i)=>{
  const a=assertId(m?.a,`transmissão ${i+1}.a`),b=assertId(m?.b,`transmissão ${i+1}.b`);
  if(!gearIds.has(a)||!gearIds.has(b)||a===b)throw Error(`Transmissão ${i+1}: engrenagens inexistentes/repetidas.`);
  if(!['gear','belt'].includes(m.type))throw Error(`Transmissão ${i+1}: tipo desconhecido.`);
  if(m.type==='gear'){
   const ga=gears.find(g=>g.id===a),gb=gears.find(g=>g.id===b);
   if(ga.type!=='gear'||gb.type!=='gear'||Math.abs(ga.module-gb.module)>.0001)throw Error(`Transmissão ${i+1}: engrenagens com módulos incompatíveis.`);
  }
  return {a,b,type:m.type};
 });
 if(!bars.length&&!gears.length&&!racks.length)throw Error('A montagem não contém peças móveis ou transmissões.');
 return {nodes,bars,gears,racks,mates};
}

/** Insere em um modelo aberto, preservando os objetos existentes; o chamador gerencia rollback. */
export function appendCustomAssembly(model,raw,centerX=0,centerY=0){
 const spec=validateCustomAssembly(raw);
 if(!model||!Array.isArray(model.nodes)||!Array.isArray(model.bars)||!Array.isArray(model.gears)||!Array.isArray(model.racks)||!Array.isArray(model.mates)||!Number.isInteger(model.next))throw Error('Projeto atual incompatível.');
 const map=new Map(),gn=new Map(),gg=new Map(),out={nodes:[],bars:[],gears:[],racks:[],mates:[]};
 const xs=spec.nodes.map(n=>n.x),ys=spec.nodes.map(n=>n.y);
 const dx=centerX-(Math.min(...xs)+Math.max(...xs))/2,dy=centerY-(Math.min(...ys)+Math.max(...ys))/2;
 const alloc=(prefix)=>`${prefix}${model.next++}`;
 for(const n of spec.nodes){
  const id=alloc('n'),x=n.x+dx,y=n.y+dy;
  const newNode={id,x,y,fixed:n.fixed,slider:n.sliderRange?{ox:x,oy:y,angle:n.sliderAngle,range:n.sliderRange}:null,follower:null,motor:null};
  model.nodes.push(newNode);map.set(n.id,id);gn.set(n.id,newNode);out.nodes.push(id);
 }
 for(const b of spec.bars){
  const a=gn.get(b.a),z=gn.get(b.b),id=alloc('b');
  model.bars.push({id,a:a.id,b:z.id,length:Math.hypot(a.x-z.x,a.y-z.y),dimensionMode:'locked',motor:null});out.bars.push(id);
 }
 for(const g of spec.gears){
  const id=alloc('g'),gear={id,node:map.get(g.node),type:g.type,teeth:g.teeth,module:g.module,radius:g.teeth*g.module/2,angle:0,baseAngle:0,motor:null};
  model.gears.push(gear);gg.set(g.id,gear);out.gears.push(id);
 }
 for(const r of spec.racks){
  const id=alloc('r'),gear=gg.get(r.gear)||null,nn=gn.get(r.node),slider=nn.slider;
  if(gear){const center=model.nodes.find(n=>n.id===gear.node),a=slider.angle*Math.PI/180;
   slider.ox=center.x-r.side*(gear.radius+9)*Math.sin(a);
   slider.oy=center.y+r.side*(gear.radius+9)*Math.cos(a);
   nn.x=slider.ox;nn.y=slider.oy;
  }
  model.racks.push({id,node:nn.id,length:r.length,gearId:gear?.id||null,offset:0,side:r.side,anchorX:0});out.racks.push(id);
 }
 for(const m of spec.mates){
  const a=gg.get(m.a),b=gg.get(m.b),id=alloc('m');
  model.mates.push({id,a:a.id,b:b.id,type:m.type,phase:0});out.mates.push(id);
 }
 return out;
}
