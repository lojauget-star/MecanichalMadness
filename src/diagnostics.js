/** Numeric local mobility estimate; not a force, collision, or structural solver. */
export function analyzeMechanism(M,options={}){
 const N=M.nodes||[],G=M.gears||[],R=M.racks||[],S=M.scissors||[];
 const bars=M.bars||[],links=M.pointLinks||[],pin=M.pinLinks||[];
 const ns=new Map(N.map(n=>[n.id,n])),gs=new Map(G.map(g=>[g.id,g])),rs=new Map(R.map(r=>[r.id,r]));
 const keys=[],start=[],lookup=new Map();
 const add=(key,num)=>{lookup.set(key,start.length);keys.push(key);start.push(Number(num)||0)};
 for(const n of N){add(n.id+'.x',n.x);add(n.id+'.y',n.y)}
 for(const g of G)add(g.id+'.a',g.angle);
 for(const s of S)for(const k of ['x','y','angle','height'])add(s.id+'.'+k,s[k]);
 const v=(x,k)=>x[lookup.get(k)],pos=(x,id)=>({x:v(x,id+'.x'),y:v(x,id+'.y')});
 const issues=[],constraints=[],warn=(severity,label,explanation)=>issues.push({severity,label,explanation});
 const addC=(label,ks,fn)=>constraints.push({label,cols:[...new Set(ks.map(k=>lookup.get(k)).filter(z=>z!==undefined))],fn});
 const d2r=d=>d*Math.PI/180;
 const q=(x,r)=>{const t=ns.get(r.node)?.slider;if(!t)return 0;const p=pos(x,r.node),a=d2r(t.angle);return (p.x-t.ox)*Math.cos(a)+(p.y-t.oy)*Math.sin(a)};
 const anchor=(x,r,l)=>{const n=pos(x,r.node),a=d2r(ns.get(r.node)?.slider?.angle||0);const off=l.slot==='start'?-r.length/2+8:l.slot==='end'?r.length/2-8:l.slot==='center'?0:(r.anchorX||0);return {x:n.x+off*Math.cos(a),y:n.y+off*Math.sin(a)}};
 for(const n of N){
  if(n.fixed)for(const k of ['x','y'])addC('Apoio '+n.id,[n.id+'.'+k],x=>v(x,n.id+'.'+k)-n[k]);
  if(n.slider){const t=n.slider,a=d2r(t.angle);addC('Guia '+n.id,[n.id+'.x',n.id+'.y'],x=>-(v(x,n.id+'.x')-t.ox)*Math.sin(a)+(v(x,n.id+'.y')-t.oy)*Math.cos(a))}
  if(n.follower){const g=gs.get(n.follower.gear);if(!g)continue;const ks=[n.id+'.x',n.id+'.y',g.node+'.x',g.node+'.y',g.id+'.a'];
   addC('Excêntrico X',ks,x=>pos(x,n.id).x-pos(x,g.node).x-n.follower.rx*Math.cos(v(x,g.id+'.a'))+n.follower.ry*Math.sin(v(x,g.id+'.a')));
   addC('Excêntrico Y',ks,x=>pos(x,n.id).y-pos(x,g.node).y-n.follower.rx*Math.sin(v(x,g.id+'.a'))-n.follower.ry*Math.cos(v(x,g.id+'.a')))}
 }
 for(const b of bars){if(!ns.has(b.a)||!ns.has(b.b)){warn('error','Barra '+b.id,'Articulação ausente.');continue}const ks=[b.a+'.x',b.a+'.y',b.b+'.x',b.b+'.y'];addC('Barra '+b.id,ks,x=>Math.hypot(pos(x,b.a).x-pos(x,b.b).x,pos(x,b.a).y-pos(x,b.b).y)-b.length)}
 for(const al of M.aligns||[]){if(ns.has(al.a)&&ns.has(al.b)){const k=al.axis==='x'?'x':'y';addC('Alinhamento '+k,[al.a+'.'+k,al.b+'.'+k],x=>v(x,al.a+'.'+k)-v(x,al.b+'.'+k))}}
 for(const m of M.mates||[]){const a=gs.get(m.a),b=gs.get(m.b);if(!a||!b)continue;const sign=m.type==='gear'?-1:1;addC('Transmissão '+m.id,[a.id+'.a',b.id+'.a'],x=>v(x,b.id+'.a')-sign*a.radius/b.radius*v(x,a.id+'.a')-m.phase);
  if(m.type==='gear'&&Math.abs(a.module-b.module)>.001)warn('error','Módulos incompatíveis','Engrenagens com módulos diferentes não engrenam.')}
 for(const r of R){if(!ns.get(r.node)?.slider){warn('error','Cremalheira '+r.id,'Guia linear ausente.');continue}if(r.gearId){const g=gs.get(r.gearId);if(g)addC('Pinhão '+r.id,[r.node+'.x',r.node+'.y',g.id+'.a'],x=>q(x,r)+(r.side||1)*g.radius*v(x,g.id+'.a')-r.offset)}}
 for(const l of links){const r=rs.get(l.rackId);if(!r||!ns.has(l.nodeId)){warn('error','Junta '+l.id,'Componente ausente.');continue}for(const k of ['x','y'])addC('Junta '+l.id+' '+k,[l.nodeId+'.'+k,r.node+'.x',r.node+'.y'],x=>pos(x,l.nodeId)[k]-anchor(x,r,l)[k])}
 for(const s of S){
  const ks=[s.id+'.x',s.id+'.y',s.id+'.angle',s.id+'.height'];
  const items=[];for(let i=0;i<=s.stages;i++){items.push([s.topIds[i],i,0],[s.bottomIds[i],i,1])}
  for(let i=0;i<s.stages;i++)items.push([s.centerIds[i],i+.5,.5]);
  for(const [id,i,j] of items){if(!ns.has(id))continue;for(const k of ['x','y'])addC('Pantógrafo '+s.id,[id+'.x',id+'.y',...ks],x=>{const a=d2r(v(x,s.id+'.angle')),h=v(x,s.id+'.height'),w=Math.sqrt(Math.max(0,s.diagonal*s.diagonal-h*h));const px=v(x,s.id+'.x')+i*w*Math.cos(a)-j*h*Math.sin(a),py=v(x,s.id+'.y')+i*w*Math.sin(a)+j*h*Math.cos(a);return v(x,id+'.'+k)-(k==='x'?px:py)})}
  if(s.height>=s.diagonal*.98||s.height<=s.diagonal*.20)warn('warning','Pantógrafo '+s.id,'Próximo de um limite de curso ou configuração singular.')}
 for(const l of pin){const r=rs.get(l.rackId),s=S.find(s=>s.id===l.scissorId);if(!r||!s)continue;addC('Acionamento '+l.id,[s.id+'.height',r.node+'.x',r.node+'.y'],x=>v(x,s.id+'.height')-l.h0-q(x,r)+l.q0);for(const k of ['x','y','angle'])addC('Fixação '+k,[s.id+'.'+k],x=>v(x,s.id+'.'+k)-s[k])}
 if(options.forSolver)return {constraints,start,lookup,keys};
 if(start.length>260){warn('info','Montagem extensa','Análise limitada a 260 variáveis para manter a interface responsiva.');return {status:'parcial',issues,variables:start.length,constraints:constraints.length,rank:null,mobility:null,redundant:null}}
 const basis=[];let rank=0,maxResidual=0;
 for(const c of constraints){let f=c.fn(start);if(!Number.isFinite(f)){warn('error',c.label,'Valor geométrico inválido.');continue}maxResidual=Math.max(maxResidual,Math.abs(f));const a=new Float64Array(start.length);
  for(const j of c.cols){const old=start[j],h=1e-5*Math.max(1,Math.abs(old)*.01);start[j]=old+h;const p=c.fn(start);start[j]=old-h;const m=c.fn(start);start[j]=old;a[j]=(p-m)/(2*h)}
  let length=Math.hypot(...a);if(length<1e-9)continue;for(let j=0;j<a.length;j++)a[j]/=length;
  for(let pass=0;pass<2;pass++)for(const b of basis){let proj=0;for(let j=0;j<a.length;j++)proj+=a[j]*b[j];for(let j=0;j<a.length;j++)a[j]-=proj*b[j]}
  length=Math.hypot(...a);if(length>1e-6){for(let j=0;j<a.length;j++)a[j]/=length;basis.push(a);rank++}
 }
 if(maxResidual>.5)warn('error','Resíduo geométrico','Uma ou mais restrições diferem da geometria atual em mais de 0,5 unidade.');
 const mobility=Math.max(0,start.length-rank),redundant=Math.max(0,constraints.length-rank);
 if(redundant)warn('info','Vínculos dependentes',redundant+' equação(ões) redundante(s); algumas são legítimas em cadeias fechadas.');
 if(N.length&&!N.some(n=>n.fixed))warn('info','Sem apoio fixo','A mobilidade inclui translação/rotação global.');
 return {variables:start.length,constraints:constraints.length,rank,mobility,redundant,maxResidual,issues,status:issues.some(i=>i.severity==='error')?'incompatível':mobility?'móvel':'travado'};
}

/**
 * KINÉTIKA V8: resolvedor global 2D por Jacobiano esparso e Gauss–Newton
 * amortecido. Reutiliza o conjunto de equações do diagnóstico.
 * Calcula somente cinemática; não calcula forças, atrito, colisões ou rigidez.
 */
export function solveConstraints(M,{pins=new Map(),iterations=9,tolerance=.025,maxVariables=150,strict=true}={}){
 const {constraints,start,lookup,keys}=analyzeMechanism(M,{forSolver:true});
 const hard=new Set();for(const n of M.nodes||[])if(n.fixed){hard.add(n.id+'.x');hard.add(n.id+'.y')}
 const x=start.slice();
 for(const [key,value] of (pins instanceof Map?pins:Object.entries(pins))){const i=lookup.get(key);if(i!==undefined){x[i]=value;hard.add(key)}}
 const active=keys.map((key,i)=>hard.has(key)?-1:i).filter(i=>i>=0);
 if(active.length>maxVariables)return {ok:false,status:'too-large',maxResidual:Infinity,constraints:constraints.length,iterations:0};
 const index=new Map(active.map((id,i)=>[id,i]));
 const evaluate=vector=>constraints.map(c=>({c,res:c.fn(vector)})).filter(row=>Number.isFinite(row.res));
 const maxError=vector=>evaluate(vector).reduce((mx,row)=>Math.max(mx,Math.abs(row.res)),0);
 let used=0,converged=false;
 for(let k=0;k<Math.max(1,Math.min(24,iterations));k++){
  const rows=evaluate(x),err=rows.reduce((mx,row)=>Math.max(mx,Math.abs(row.res)),0);
  if(err<tolerance){converged=true;break}
  if(!active.length)break;
  const lambda=.004,b=new Float64Array(active.length),diag=new Float64Array(active.length).fill(lambda),J=[];
  for(const {c,res} of rows){
   const jac=[];
   for(const col of c.cols){
    const j=index.get(col);if(j===undefined)continue;
    const original=x[col],h=Math.max(1e-5,Math.abs(original)*1e-6);
    x[col]=original+h;const plus=c.fn(x);x[col]=original-h;const minus=c.fn(x);x[col]=original;
    const derivative=(plus-minus)/(2*h);
    if(!Number.isFinite(derivative)||Math.abs(derivative)<1e-14)continue;
    jac.push([j,derivative]);b[j]-=derivative*res;diag[j]+=derivative*derivative;
   }
   J.push(jac);
  }
  const multiply=v=>{
   const out=Float64Array.from(v,e=>lambda*e);
   for(const jac of J){let projection=0;for(const [j,a] of jac)projection+=a*v[j];for(const [j,a] of jac)out[j]+=a*projection}
   return out;
  };
  const delta=new Float64Array(active.length),r=Float64Array.from(b),z=Float64Array.from(r,(v,j)=>v/diag[j]),p=Float64Array.from(z);
  let rz=r.reduce((sum,v,j)=>sum+v*z[j],0);
  for(let cg=0;cg<Math.min(140,active.length*2+6);cg++){
   const Ap=multiply(p),den=p.reduce((sum,v,j)=>sum+v*Ap[j],0);
   if(!Number.isFinite(den)||den<1e-22)break;
   const alpha=rz/den;
   for(let j=0;j<active.length;j++){delta[j]+=alpha*p[j];r[j]-=alpha*Ap[j]}
   let residualNorm=0;for(const v of r)residualNorm+=v*v;
   if(residualNorm<1e-12)break;
   const next=Float64Array.from(r,(v,j)=>v/diag[j]),nextRZ=r.reduce((sum,v,j)=>sum+v*next[j],0),beta=nextRZ/Math.max(rz,1e-22);
   for(let j=0;j<active.length;j++)p[j]=next[j]+beta*p[j];rz=nextRZ;
  }
  let previous=0;for(const {res} of rows)previous+=res*res;
  let accepted=false;
  for(const factor of [1,.5,.25,.125,.0625]){
   const trial=x.slice();
   for(let j=0;j<active.length;j++){
    const key=keys[active[j]],limit=key.endsWith('.angle')||key.endsWith('.a')?.35:45;
    trial[active[j]]+=Math.max(-limit,Math.min(limit,delta[j]*factor));
   }
   let energy=0;for(const {res} of evaluate(trial))energy+=res*res;
   if(energy<previous-1e-10){for(let j=0;j<trial.length;j++)x[j]=trial[j];accepted=true;break}
  }
  used=k+1;if(!accepted)break;
 }
 const maxResidual=maxError(x),ok=converged||maxResidual<.6;
 if(strict&&!ok)return {ok:false,status:'incompatible',maxResidual,iterations:used,constraints:constraints.length};
 for(const n of M.nodes||[]){n.x=x[lookup.get(n.id+'.x')];n.y=x[lookup.get(n.id+'.y')]}
 for(const g of M.gears||[])g.angle=x[lookup.get(g.id+'.a')];
 for(const s of M.scissors||[])for(const key of ['x','y','angle','height'])s[key]=x[lookup.get(s.id+'.'+key)];
 return {ok,status:ok?'resolved':'partial',maxResidual,iterations:used,constraints:constraints.length,converged};
}
