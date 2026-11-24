/**
 * Estimador local de mobilidade 2D por posto do jacobiano das restrições.
 * O cálculo é puramente geométrico: não representa atrito, forças, colisões,
 * contato dos dentes nem modos de flexão. O motor de posição principal permanece
 * responsável pela simulação/posicionamento.
 */
const finite = x => Number.isFinite(x);
const d2r = a => a * Math.PI / 180;
const norm = (x, y) => Math.hypot(x, y);

export function analyzeMechanism(M, options = {}) {
  const nodes = M.nodes || [], gears = M.gears || [], scissors = M.scissors || [];
  const bars = M.bars || [], racks = M.racks || [], mates = M.mates || [];
  const byNode = new Map(nodes.map(n => [n.id, n]));
  const byGear = new Map(gears.map(g => [g.id, g]));
  const byRack = new Map(racks.map(r => [r.id, r]));
  const byScissor = new Map(scissors.map(s => [s.id, s]));
  const variables = [], ids = new Map();
  const addVariable = (key, value) => { ids.set(key, variables.length); variables.push(Number(value) || 0); };
  for (const n of nodes) { addVariable(`${n.id}.x`, n.x); addVariable(`${n.id}.y`, n.y); }
  for (const g of gears) addVariable(`${g.id}.angle`, g.angle);
  for (const g of scissors) {
    for (const k of ['x', 'y', 'angle', 'height']) addVariable(`${g.id}.${k}`, g[k]);
  }
  const count = variables.length;
  const issues = [];
  const MAX_VARS = options.maxVariables ?? 260;
  const graph = { variables: count, constraints: 0, rank: null, mobility: null, redundant: null };
  const addIssue = (severity, label, explanation) => issues.push({ severity, label, explanation });
  if (count > MAX_VARS) {
    addIssue('info', 'Montagem extensa', `A análise de posto foi limitada a ${MAX_VARS} variáveis para não bloquear a interface.`);
    return { ...graph, status: 'parcial', issues, components: { nodes: nodes.length, bars: bars.length, gears: gears.length, racks: racks.length, scissors: scissors.length } };
  }
  const cons = [];
  const val = (x, key) => x[ids.get(key)];
  const np = (x, id) => ({x:val(x,`${id}.x`), y:val(x,`${id}.y`)});
  const ga = (x, id) => val(x,`${id}.angle`);
  const sc = (x,id,key) => val(x,`${id}.${key}`);
  function push(label, keys, fn, unit='mm') {
    const cols = [...new Set(keys.map(k=>ids.get(k)).filter(k=>k!==undefined))];
    if (cols.length) cons.push({label, cols, fn, unit});
  }
  function qRack(x,r) {
    const n=byNode.get(r.node), s=n?.slider;
    if (!s) return 0;
    const p=np(x,r.node), a=d2r(s.angle);
    return (p.x-s.ox)*Math.cos(a)+(p.y-s.oy)*Math.sin(a);
  }
  function portOffset(r,l) {
    if (l.slot==='start') return -r.length/2+8;
    if (l.slot==='end') return r.length/2-8;
    if (l.slot==='center') return 0;
    return Number(r.anchorX)||0;
  }
  function rackPort(x,r,l) {
    const p=np(x,r.node), a=d2r(byNode.get(r.node)?.slider?.angle||0), off=portOffset(r,l);
    return {x:p.x+off*Math.cos(a),y:p.y+off*Math.sin(a)};
  }
  for(const n of nodes) {
    const keys=[`${n.id}.x`, `${n.id}.y`];
    if(n.fixed) {
      push(`Apoio ${n.id} · X`,[keys[0]],x=>val(x,keys[0])-n.x);
      push(`Apoio ${n.id} · Y`,[keys[1]],x=>val(x,keys[1])-n.y);
    }
    if(n.slider) {
      const s=n.slider,a=d2r(s.angle),vx=-Math.sin(a),vy=Math.cos(a);
      push(`Guia ${n.id}`,keys,x=>(val(x,keys[0])-s.ox)*vx+(val(x,keys[1])-s.oy)*vy);
      if(!finite(s.range)||s.range<=0) addIssue('error',`Guia ${n.id}`,'O curso definido deve ser positivo.');
    }
    if(n.follower) {
      const g=byGear.get(n.follower.gear),c=g&&byNode.get(g.node);
      if(!g||!c) {addIssue('error',`Pino ${n.id}`,'Engrenagem de origem inexistente.');continue;}
      const all=[...keys,`${c.id}.x`,`${c.id}.y`,`${g.id}.angle`];
      push(`Excêntrico ${n.id} · X`,all,x=>{const a=ga(x,g.id),t=n.follower;return np(x,n.id).x-np(x,c.id).x-t.rx*Math.cos(a)+t.ry*Math.sin(a)});
      push(`Excêntrico ${n.id} · Y`,all,x=>{const a=ga(x,g.id),t=n.follower;return np(x,n.id).y-np(x,c.id).y-t.rx*Math.sin(a)-t.ry*Math.cos(a)});
    }
  }
  for(const b of bars) {
    if(!byNode.has(b.a)||!byNode.has(b.b)) {addIssue('error',`Barra ${b.id}`,'Articulação inexistente.');continue;}
    const k=[`${b.a}.x`,`${b.a}.y`,`${b.b}.x`,`${b.b}.y`];
    if(b.dimensionMode!=='draft')push(`Comprimento ${b.id}`,k,x=>norm(np(x,b.a).x-np(x,b.b).x,np(x,b.a).y-np(x,b.b).y)-b.length);
    if(!finite(b.length)||b.length<=0) addIssue('error',`Barra ${b.id}`,'Comprimento nulo ou inválido.');
  }
  for(const a of M.aligns||[]) {
    if(!byNode.has(a.a)||!byNode.has(a.b))continue;
    const key=a.axis==='x'?'x':'y';
    push(`Alinhar ${key.toUpperCase()} · ${a.a}/${a.b}`,[`${a.a}.${key}`,`${a.b}.${key}`],x=>val(x,`${a.a}.${key}`)-val(x,`${a.b}.${key}`));
  }
  for(const m of mates) {
    const a=byGear.get(m.a),b=byGear.get(m.b);
    if(!a||!b) {addIssue('error',`Transmissão ${m.id}`,'Engrenagem ou polia inexistente.');continue;}
    const ratio=a.radius/b.radius, sign=m.type==='gear'?-1:1;
    push(`Transmissão ${m.id}`,[`${a.id}.angle`,`${b.id}.angle`],x=>ga(x,b.id)-sign*ratio*ga(x,a.id)-m.phase,'rad');
    if(m.type==='gear') {
      if(Math.abs(a.module-b.module)>.001) addIssue('error',`Engrenagens ${a.id}/${b.id}`,'Módulos incompatíveis.');
      const p=byNode.get(a.node),t=byNode.get(b.node);
      if(p&&t&&Math.abs(norm(p.x-t.x,p.y-t.y)-a.radius-b.radius)>1) addIssue('warning',`Engrenagens ${a.id}/${b.id}`,'A distância entre centros não coincide com a soma dos raios primitivos.');
    }
  }
  for(const r of racks) {
    const n=byNode.get(r.node);
    if(!n?.slider) {addIssue('error',`Cremalheira ${r.id}`,'Cremalheira sem guia linear válida.');continue;}
    if(r.gearId) {
      const g=byGear.get(r.gearId);
      if(!g) {addIssue('error',`Cremalheira ${r.id}`,'Pinhão vinculado não existe.');continue;}
      const ks=[`${r.node}.x`,`${r.node}.y`,`${g.id}.angle`];
      push(`Pinhão–cremalheira ${r.id}`,ks,x=>qRack(x,r)+(r.side||1)*g.radius*ga(x,g.id)-r.offset);
      if(Math.abs(qRack(variables,r))>Math.max(0,r.length/2-16)+1) addIssue('warning',`Cremalheira ${r.id}`,'A região de contato saiu da extensão dentada.');
    }
  }
  for(const l of M.nodeLinks||[]){
    if(!byNode.has(l.a)||!byNode.has(l.b)){addIssue('error',`Junta ${l.id}`,'Vértice da junta ausente.');continue;}
    for(const axis of ['x','y'])push(`Junta universal ${l.id} ${axis.toUpperCase()}`,[`${l.a}.${axis}`,`${l.b}.${axis}`],x=>np(x,l.a)[axis]-np(x,l.b)[axis]);
  }
  for(const l of M.pointLinks||[]) {
    const r=byRack.get(l.rackId),n=byNode.get(l.nodeId);
    if(!r||!n) {addIssue('error',`Junta ${l.id}`,'Referência a componente ausente.');continue;}
    const ks=[`${n.id}.x`,`${n.id}.y`,`${r.node}.x`,`${r.node}.y`];
    for(const axis of ['x','y']) push(`Junta ${l.id} · ${axis.toUpperCase()}`,ks,x=>np(x,n.id)[axis]-rackPort(x,r,l)[axis]);
  }
  for(const g of scissors) {
    const all=[`${g.id}.x`,`${g.id}.y`,`${g.id}.angle`,`${g.id}.height`];
    const idx={};
    for (let i=0;i<=(g.stages||0);i++) {
      for (const [kind,id] of [['top',g.topIds?.[i]],['bottom',g.bottomIds?.[i]]]) {
        if(!id||!byNode.has(id))continue;
        idx[id]={i,kind};
      }
    }
    for (let i=0;i<(g.stages||0);i++) if(g.centerIds?.[i])idx[g.centerIds[i]]={i,kind:'center'};
    for(const [id,where] of Object.entries(idx)) {
      const keys=[`${id}.x`,`${id}.y`,...all];
      for(const axis of ['x','y']) push(`Pantógrafo ${g.id} · ${id}.${axis}`,keys,x=>{
        const a=d2r(sc(x,g.id,'angle')),h=sc(x,g.id,'height'),w=Math.sqrt(Math.max(0,g.diagonal*g.diagonal-h*h));
        const i=where.i+(where.kind==='center'?.5:0),v=where.kind==='top'?0:where.kind==='center'?.5:1;
        const px=sc(x,g.id,'x')+i*w*Math.cos(a)-v*h*Math.sin(a);
        const py=sc(x,g.id,'y')+i*w*Math.sin(a)+v*h*Math.cos(a);
        return np(x,id)[axis]-(axis==='x'?px:py);
      });
    }
    if(g.height>=g.diagonal*.98||g.height<=g.diagonal*.20) addIssue('warning',`Pantógrafo ${g.id}`,'Configuração próxima de um limite geométrico: pode ocorrer singularidade ou perda de curso útil.');
    if(g.height>=g.diagonal) addIssue('error',`Pantógrafo ${g.id}`,'Altura excede a diagonal das barras.');
  }
  for(const l of M.pinLinks||[]) {
    const r=byRack.get(l.rackId),g=byScissor.get(l.scissorId);
    if(!r||!g) {addIssue('error',`União ${l.id}`,'Vínculo aponta para peça ausente.');continue;}
    push(`Acionamento ${l.id}`,[`${g.id}.height`,`${r.node}.x`,`${r.node}.y`],x=>sc(x,g.id,'height')-l.h0-qRack(x,r)+l.q0);
    push(`Orientação ${l.id}`,[`${g.id}.angle`],x=>sc(x,g.id,'angle')-g.angle,'rad');
    for(const axis of ['x','y'])push(`Base ${l.id} · ${axis}`,[`${g.id}.${axis}`],x=>sc(x,g.id,axis)-g[axis]);
  }
  graph.constraints=cons.length;
  if (!count) return { ...graph,rank:0,mobility:0,redundant:0,status:'vazio',issues,components:{nodes:0,bars:0,gears:0,racks:0,scissors:0} };
  const BASIS=[]; let rank=0, residualMax=0, strongest=[];
  for(const c of cons) {
    const f0=c.fn(variables);
    if(!finite(f0)) { addIssue('error',c.label,'Restrição produz valor não finito.');continue; }
    const a=Math.abs(f0)*(c.unit==='rad'?60:1);
    if(a>residualMax)residualMax=a;
    if(a>.45)strongest.push({label:c.label,residual:a,unit:c.unit});
    const vec=new Float64Array(count);
    for(const j of c.cols) {
      const saved=variables[j];let h=1e-5*Math.max(1,Math.abs(saved)*.01);
      variables[j]=saved+h;const fplus=c.fn(variables);
      variables[j]=saved-h;const fminus=c.fn(variables);
      variables[j]=saved;
      vec[j]=(fplus-fminus)/(2*h);
    }
    let n2=0;for(let j=0;j<count;j++)n2+=vec[j]*vec[j];
    if(n2<1e-18)continue;
    let scale=Math.sqrt(n2);for(let j=0;j<count;j++)vec[j]/=scale;
    // Modified Gram–Schmidt twice improves numeric stability for closed loops.
    for(let pass=0;pass<2;pass++)for(const basis of BASIS){
      let proj=0;for(let j=0;j<count;j++)proj+=vec[j]*basis[j];
      if(Math.abs(proj)>1e-12)for(let j=0;j<count;j++)vec[j]-=proj*basis[j];
    }
    n2=0;for(let j=0;j<count;j++)n2+=vec[j]*vec[j];
    if(n2>1e-12){scale=Math.sqrt(n2);for(let j=0;j<count;j++)vec[j]/=scale;BASIS.push(vec);rank++;}
  }
  graph.rank=rank;graph.mobility=Math.max(0,count-rank);graph.redundant=Math.max(0,cons.length-rank);
  const severe=issues.some(x=>x.severity==='error');
  if(strongest.length) {
    strongest.sort((a,b)=>b.residual-a.residual);
    const n=strongest[0];addIssue('error',n.label,`Incompatibilidade geométrica detectada (resíduo normalizado ≈ ${n.residual.toFixed(2)} mm).`);
  }
  if(graph.redundant>0) addIssue('info','Restrições dependentes',`${graph.redundant} vínculo(s) não aumentam o posto do jacobiano; podem ser redundâncias legítimas, não necessariamente erros.`);
  if(!nodes.some(n=>n.fixed)&&nodes.length) addIssue('info','Montagem sem apoio fixo','A translação e/ou rotação global também contam como graus de liberdade.');
  const status=severe||strongest.length?'incompatível':graph.mobility===0?'travado':'móvel';
  return {...graph,status,issues,residualMax,components:{nodes:nodes.length,bars:bars.length,gears:gears.length,racks:racks.length,scissors:scissors.length}};
}
