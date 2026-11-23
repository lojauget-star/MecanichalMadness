/** KINÉTIKA V8 — resolvedor geométrico 2D, Jacobiano esparso + mínimos quadrados amortecidos.
 * Posições (mm) e rotações (rad) são incógnitas de um mesmo sistema.
 * Não simula energia, inércia, impacto, atrito ou resistência mecânica.
 */
const rad = d => d*Math.PI/180;
const deg = a => a*180/Math.PI;
const finite = Number.isFinite;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const length = (x,y) => Math.hypot(x,y);
export function solveConstraints(M, options={}) {
 const nodes=M.nodes||[], bars=M.bars||[],gears=M.gears||[],racks=M.racks||[],scissors=M.scissors||[];
 const nmap=new Map(nodes.map(n=>[n.id,n])),gmap=new Map(gears.map(g=>[g.id,g])),rmap=new Map(racks.map(r=>[r.id,r]));
 const keys=[], values=[], lookup=new Map(), hard=new Set();
 const put=(key,value,fixed=false)=>{lookup.set(key,values.length);keys.push(key);values.push(value);if(fixed)hard.add(key)};
 for(const n of nodes){put(`${n.id}.x`,n.x,!!n.fixed);put(`${n.id}.y`,n.y,!!n.fixed)}
 for(const g of gears)put(`${g.id}.angle`,g.angle);
 for(const s of scissors){put(`${s.id}.x`,s.x);put(`${s.id}.y`,s.y);put(`${s.id}.height`,s.height);put(`${s.id}.angle`,rad(s.angle))}
 const pins=options.pins||new Map();for(const [key,value] of pins instanceof Map?pins:Object.entries(pins)){if(lookup.has(key)){values[lookup.get(key)]=value;hard.add(key)}}
 // Alvos suaves: perseguir o cursor sem permitir distorção das restrições físicas.
 const goals=options.goals instanceof Map?[...options.goals]:Object.entries(options.goals||{});
 const goalWeight=options.goalWeight??.045;
 const isGoal=goals.length>0;
 const free=keys.map((k,i)=>hard.has(k)?-1:i).filter(i=>i>=0);
 const maxVars=options.maxVariables??160;
 if(free.length>maxVars)return {ok:false,converged:false,status:'too-large',reason:`${free.length} variáveis livres, limite ${maxVars}`,maxResidual:Infinity,iterations:0};
 const reverse=new Map(free.map((id,j)=>[id,j]));
 const value=(x,key)=>{const i=lookup.get(key);return i===undefined?NaN:x[i]};
 const pos=(x,id)=>({x:value(x,`${id}.x`),y:value(x,`${id}.y`)});
 const gearAngle=(x,id)=>value(x,`${id}.angle`);
 const scVal=(x,id,k)=>value(x,`${id}.${k}`);
 const validNode=id=>nmap.has(id);
 const axe=s=>({ux:Math.cos(rad(s.angle)),uy:Math.sin(rad(s.angle)),vx:-Math.sin(rad(s.angle)),vy:Math.cos(rad(s.angle))});
 const rackQ=(x,r)=>{const s=nmap.get(r.node)?.slider;if(!s)return 0;const p=pos(x,r.node),a=axe(s);return (p.x-s.ox)*a.ux+(p.y-s.oy)*a.uy};
 const off=(r,l)=>l.slot==='start'?-r.length/2+8:l.slot==='end'?r.length/2-8:l.slot==='center'?0:Number(r.anchorX)||0;
 const rackPoint=(x,r,l)=>{const a=axe(nmap.get(r.node).slider),p=pos(x,r.node),v=off(r,l);return {x:p.x+v*a.ux,y:p.y+v*a.uy}};
 const compile=x=>{
   const rows=[];
   function add(label,res,entries,scale=1){if(!finite(res))return;const gg=[];for(const [key,v] of entries){const index=lookup.get(key);if(index===undefined||!finite(v))continue;const j=reverse.get(index);if(j!==undefined&&Math.abs(v)>1e-12)gg.push([j,v*scale])}rows.push({label,r:res*scale,g:gg})}
   for(const b of bars){if(!validNode(b.a)||!validNode(b.b))continue;const a=pos(x,b.a),c=pos(x,b.b),dx=c.x-a.x,dy=c.y-a.y,d=length(dx,dy),den=Math.max(d,1e-7),ux=dx/den,uy=dy/den;
     add(`Barra ${b.id}`,d-b.length,[[`${b.a}.x`,-ux],[`${b.a}.y`,-uy],[`${b.b}.x`,ux],[`${b.b}.y`,uy]])}
   for(const n of nodes){if(!n.slider)continue;const s=n.slider,p=pos(x,n.id),a=axe(s),dx=p.x-s.ox,dy=p.y-s.oy;
     add(`Guia ${n.id}`,dx*a.vx+dy*a.vy,[[`${n.id}.x`,a.vx],[`${n.id}.y`,a.vy]]);
     const q=dx*a.ux+dy*a.uy,half=Math.max(0,s.range/2);if(Math.abs(q)>half)add(`Curso ${n.id}`,q-clamp(q,-half,half),[[`${n.id}.x`,a.ux],[`${n.id}.y`,a.uy]])}
   for(const c of M.aligns||[]){if(!validNode(c.a)||!validNode(c.b))continue;const ax=c.axis==='y'?'y':'x';add(`Alinhar ${ax} ${c.a}/${c.b}`,value(x,`${c.a}.${ax}`)-value(x,`${c.b}.${ax}`),[[`${c.a}.${ax}`,1],[`${c.b}.${ax}`,-1]])}
   for(const n of nodes){if(!n.follower)continue;const f=n.follower,g=gmap.get(f.gear);if(!g||!validNode(g.node))continue;const a=gearAngle(x,g.id),cs=Math.cos(a),sn=Math.sin(a),p=pos(x,n.id),c=pos(x,g.node);
      add(`Excêntrico ${n.id} x`,p.x-c.x-f.rx*cs+f.ry*sn,[[`${n.id}.x`,1],[`${g.node}.x`,-1],[`${g.id}.angle`,f.rx*sn+f.ry*cs]]);
      add(`Excêntrico ${n.id} y`,p.y-c.y-f.rx*sn-f.ry*cs,[[`${n.id}.y`,1],[`${g.node}.y`,-1],[`${g.id}.angle`,-f.rx*cs+f.ry*sn]])}
   for(const m of M.mates||[]){const a=gmap.get(m.a),b=gmap.get(m.b);if(!a||!b)continue;const sign=m.type==='gear'?-1:1,k=sign*a.radius/b.radius;
     add(`Transmissão ${m.id}`,gearAngle(x,b.id)-k*gearAngle(x,a.id)-(m.phase||0),[[`${b.id}.angle`,1],[`${a.id}.angle`,-k]],Math.max(15,Math.min(60,b.radius)));
     if(m.type==='gear'&&validNode(a.node)&&validNode(b.node)){
       const p=pos(x,a.node),q=pos(x,b.node),dx=q.x-p.x,dy=q.y-p.y,d=length(dx,dy),den=Math.max(d,1e-7);
       add(`Centro ${m.id}`,d-a.radius-b.radius,[[`${a.node}.x`,-dx/den],[`${a.node}.y`,-dy/den],[`${b.node}.x`,dx/den],[`${b.node}.y`,dy/den]]);
     }
   }
   for(const r of racks){const n=nmap.get(r.node);if(!n?.slider)continue;const a=axe(n.slider);if(r.gearId&&gmap.has(r.gearId)){const g=gmap.get(r.gearId),side=r.side||1;
      add(`Pinhão ${r.id}`,rackQ(x,r)+side*g.radius*gearAngle(x,g.id)-(r.offset||0),[[`${r.node}.x`,a.ux],[`${r.node}.y`,a.uy],[`${g.id}.angle`,side*g.radius]]);
      // A distância normal do pinhão à cremalheira é geométrica, independente de rotação.
      if(validNode(g.node)){const p=pos(x,r.node),c=pos(x,g.node);
        add(`Tangência ${r.id}`,(p.x-c.x)*a.vx+(p.y-c.y)*a.vy-side*(g.radius+9),[[`${r.node}.x`,a.vx],[`${r.node}.y`,a.vy],[`${g.node}.x`,-a.vx],[`${g.node}.y`,-a.vy]])}
     }
   }
   for(const l of M.pointLinks||[]){const r=rmap.get(l.rackId);if(!r||!validNode(l.nodeId)||!nmap.get(r.node)?.slider)continue;const p=pos(x,l.nodeId),t=rackPoint(x,r,l);
      add(`Junta ${l.id} x`,p.x-t.x,[[`${l.nodeId}.x`,1],[`${r.node}.x`,-1]]);
      add(`Junta ${l.id} y`,p.y-t.y,[[`${l.nodeId}.y`,1],[`${r.node}.y`,-1]])}
   for(const s of scissors){const a=scVal(x,s.id,'angle'),h=scVal(x,s.id,'height'),w=Math.sqrt(Math.max(1e-10,s.diagonal*s.diagonal-h*h)),ca=Math.cos(a),sa=Math.sin(a),dw=-h/w;
      const target=(id,k,v)=>{if(!validNode(id))return;const along=k*w,cross=v*h;
        const px=scVal(x,s.id,'x')+along*ca-cross*sa,py=scVal(x,s.id,'y')+along*sa+cross*ca;
        const dhx=k*dw*ca-v*sa,dhy=k*dw*sa+v*ca;
        add(`Pantógrafo ${s.id} ${id}.x`,value(x,`${id}.x`)-px,[[`${id}.x`,1],[`${s.id}.x`,-1],[`${s.id}.height`,-dhx],[`${s.id}.angle`,along*sa+cross*ca]]);
        add(`Pantógrafo ${s.id} ${id}.y`,value(x,`${id}.y`)-py,[[`${id}.y`,1],[`${s.id}.y`,-1],[`${s.id}.height`,-dhy],[`${s.id}.angle`,-along*ca+cross*sa]]);
      };
      for(let k=0;k<=s.stages;k++){target(s.topIds?.[k],k,0);target(s.bottomIds?.[k],k,1)}
      for(let k=0;k<s.stages;k++)target(s.centerIds?.[k],k+.5,.5);
   }
   for(const l of M.pinLinks||[]){const r=rmap.get(l.rackId),s=scissors.find(t=>t.id===l.scissorId);if(!r||!s||!nmap.get(r.node)?.slider)continue;const a=axe(nmap.get(r.node).slider);
      add(`Acionamento ${l.id}`,scVal(x,s.id,'height')-l.h0-rackQ(x,r)+l.q0,[[`${s.id}.height`,1],[`${r.node}.x`,-a.ux],[`${r.node}.y`,-a.uy]])}
   for(const [key,desired] of goals){
     if(!lookup.has(key)||hard.has(key)||!finite(desired))continue;
     const weight=options.goalWeights?.[key]??goalWeight;
     add(`Meta ${key}`,value(x,key)-desired,[[key,1]],weight);
     rows[rows.length-1].goal=true;
   }
   return rows;
 };
 const energy=rs=>rs.reduce((s,r)=>s+r.r*r.r,0);
 const start=values.slice(),nfree=free.length,iters=Math.max(1,Math.min(options.iterations??10,30));
 let x=values.slice(),iterations=0,converged=false,status='ok';let error=Infinity;
 for(let t=0;t<iters;t++){
   const rows=compile(x),max=Math.max(0,...rows.filter(r=>!r.goal).map(r=>Math.abs(r.r)));
   const goalError=Math.max(0,...rows.filter(r=>r.goal).map(r=>Math.abs(r.r)));
   if(isGoal&&max<(options.tolerance??.015)&&goalError<goalWeight*(options.goalTolerance??.12)){converged=true;error=max;break}
   if(!isGoal&&max<(options.tolerance??.015)){converged=true;error=max;break}
   if(!nfree){status='pinned';error=max;break}
   const lambda=options.damping??(isGoal?1e-7:.002),grad=new Float64Array(nfree),diag=new Float64Array(nfree).fill(lambda);
   for(const row of rows){for(const [j,v] of row.g){grad[j]-=v*row.r;diag[j]+=v*v}}
   // Normal equations computed implicitly from sparse Jacobian; PCG uses Jacobi preconditioner.
   const mul=v=>{const out=Float64Array.from(v,x=>lambda*x);for(const row of rows){let dot=0;for(const [j,a] of row.g)dot+=a*v[j];for(const [j,a] of row.g)out[j]+=a*dot}return out};
   const dx=new Float64Array(nfree),rr=Float64Array.from(grad),z=rr.map((v,j)=>v/Math.max(diag[j],1e-9)),p=Float64Array.from(z);
   let rz=rr.reduce((s,v,j)=>s+v*z[j],0),g2=rr.reduce((s,v)=>s+v*v,0);
   for(let c=0;c<Math.min(nfree*2+4,140)&&g2>1e-17;c++){
     const Ap=mul(p),den=p.reduce((s,v,j)=>s+v*Ap[j],0);if(den<1e-22)break;
     const alpha=rz/den;for(let j=0;j<nfree;j++){dx[j]+=alpha*p[j];rr[j]-=alpha*Ap[j]}
     const nextZ=rr.map((v,j)=>v/Math.max(diag[j],1e-9)),rzNext=rr.reduce((s,v,j)=>s+v*nextZ[j],0);
     g2=rr.reduce((s,v)=>s+v*v,0);if(g2<1e-15)break;
     const beta=rzNext/Math.max(rz,1e-25);for(let j=0;j<nfree;j++)p[j]=nextZ[j]+beta*p[j];rz=rzNext;
   }
   const oldEnergy=energy(rows);let accepted=false;
   for(const alpha of [1,.5,.25,.125,.0625]){
      const trial=x.slice();for(let j=0;j<nfree;j++){const id=free[j];const key=keys[id];const maxStep=key.endsWith('.angle')?.35:40;trial[id]+=clamp(dx[j]*alpha,-maxStep,maxStep)}
      for(const s of scissors){const hi=s.diagonal*.985,lo=Math.max(20,s.diagonal*.2),idx=lookup.get(`${s.id}.height`);if(idx!==undefined&&!hard.has(`${s.id}.height`))trial[idx]=clamp(trial[idx],lo,hi)}
      const e=energy(compile(trial));if(e<oldEnergy-1e-10){x=trial;accepted=true;break}
   }
   iterations=t+1;
   if(!accepted){status='stalled';break}
 }
 const remaining=compile(x),maxResidual=Math.max(0,...remaining.filter(r=>!r.goal).map(r=>Math.abs(r.r)));
 const targetResidual=Math.max(0,...remaining.filter(r=>r.goal).map(r=>Math.abs(r.r/Math.max(goalWeight,1e-12))));
 if(maxResidual<(options.tolerance??.015)&&(!isGoal||targetResidual<(options.goalTolerance??.12)))converged=true;
 const ok=converged||maxResidual<(options.acceptResidual??.6);
 // Never commit a worsened/inconsistent partial pose when the caller requests strict validation.
 if(options.strict&&!ok)return {ok:false,converged:false,status:'incompatible',maxResidual,targetResidual,iterations,constraints:remaining.filter(r=>!r.goal).length};
 for(const n of nodes){n.x=value(x,`${n.id}.x`);n.y=value(x,`${n.id}.y`)}
 for(const g of gears)g.angle=value(x,`${g.id}.angle`);
 for(const s of scissors){s.x=scVal(x,s.id,'x');s.y=scVal(x,s.id,'y');s.height=scVal(x,s.id,'height');s.angle=deg(scVal(x,s.id,'angle'))}
 return {ok,converged,status:ok?'resolved':status,maxResidual,targetResidual,limitReached:isGoal&&targetResidual>(options.goalTolerance??.7),iterations,constraints:remaining.filter(r=>!r.goal).length,variables:nfree};
}