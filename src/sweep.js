/** KINÉTIKA V11 — ferramenta de amostragem de trajetórias, sem simulação de forças.
 * Funções puras: planejamento temporal e sumarização de amostras obtidas do motor existente.
 * A análise é discreta; uma varredura não prova ausência de colisões entre amostras.
 */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);

export function planMotionSweep(model, options={}){
 const motors=[];
 for(const g of model.gears||[])if(g.motor)motors.push({label:`Roda ${g.id}`,motor:g.motor});
 for(const b of model.bars||[])if(b.motor)motors.push({label:`Barra ${b.id}`,motor:b.motor});
 for(const n of model.nodes||[])if(n.motor&&n.slider)motors.push({label:`Cursor ${n.id}`,motor:n.motor});
 if(!motors.length){
  const g=(model.gears||[])[0],n=(model.nodes||[]).find(n=>n.slider&&!n.fixed),sc=(model.scissors||[])[0],b=(model.bars||[]).find(b=>{
   const a=model.nodes?.find(n=>n.id===b.a),z=model.nodes?.find(n=>n.id===b.b);
   return (a?.fixed&&!z?.fixed)||(z?.fixed&&!a?.fixed);
  });
  const virtualDrive=g?{kind:'gear',id:g.id,label:`Roda ${g.id}`}:
   n?{kind:'node',id:n.id,label:`Cursor ${n.id}`}:
   sc?{kind:'scissor',id:sc.id,label:`Pantógrafo ${sc.id}`}:
   b?{kind:'bar',id:b.id,label:`Barra ${b.id}`}:null;
  if(!virtualDrive)return {ok:false,reason:'Sem acionamento e sem eixo, guia, pantógrafo ou manivela que possa ser varrido. Adicione um motor ou um elemento móvel.',motors:[]};
  const duration=clamp(options.duration??10,.25,90),steps=Math.round(clamp(options.steps??81,11,201));
  const start=finite(options.start)?Math.max(0,options.start):0;
  return {ok:true,duration,steps,start,end:start+duration,motors:[],virtualDrive,approximateCycle:true,multiDriver:false};
 }
 const periods=motors.map(({motor})=>motor.type==='spring'?Math.max(.05,motor.tau||.9)*5.5:60/Math.max(.01,Math.abs(motor.rpm||8)));
 const duration=clamp(options.duration??Math.max(...periods),.25,90);
 const steps=Math.round(clamp(options.steps??81,11,201));
 const start=finite(options.start)?Math.max(0,options.start):0;
 return {ok:true,duration,steps,start,end:start+duration,motors:motors.map((entry,i)=>({...entry,period:periods[i]})),multiDriver:motors.length>1,approximateCycle:motors.length>1||periods.some(p=>p>90)};
}

export function capturePose(model){
 return {nodes:(model.nodes||[]).map(n=>[n.id,n.x,n.y]),gears:(model.gears||[]).map(g=>[g.id,g.angle]),scissors:(model.scissors||[]).map(s=>[s.id,s.x,s.y,s.height,s.angle])};
}

export function summarizeMotionSweep(samples){
 const intervals=[],active=new Map();let minimumGap=null,minimumAt=null,invalid=0,firstCollision=null,criticalSamples=0,truncated=false;
 const close=(key,last)=>{const event=active.get(key);if(!event)return;event.endIndex=last;event.endTime=samples[last]?.time??event.startTime;intervals.push(event);active.delete(key)};
 for(let i=0;i<samples.length;i++){
  const s=samples[i],report=s.report||{collisions:[],singularities:[],near:[]};
  if(s.valid===false){invalid++;for(const key of [...active.keys()])close(key,i-1);continue}
  truncated ||=Boolean(report.truncated);
  if(finite(report.minGap)&&(minimumGap===null||report.minGap<minimumGap)){minimumGap=report.minGap;minimumAt={index:i,time:s.time,pair:report.minPair||null}}
  if(report.collisions?.length&&firstCollision===null)firstCollision=i;
  if(report.singularities?.length)criticalSamples++;
  const seen=new Set();
  for(const [kind,issues] of [['collision',report.collisions||[]],['singularity',report.singularities||[]]])for(const issue of issues){
   const key=`${kind}:${issue.id}`;seen.add(key);
   let evt=active.get(key);
   if(!evt){evt={key,kind,id:issue.id,label:issue.label,startIndex:i,endIndex:i,startTime:s.time,endTime:s.time,peakGap:finite(issue.gap)?issue.gap:null,firstDescription:issue.description};active.set(key,evt)}
   else{evt.endIndex=i;evt.endTime=s.time;if(finite(issue.gap)&&(evt.peakGap===null||issue.gap<evt.peakGap))evt.peakGap=issue.gap}
  }
  for(const key of [...active.keys()])if(!seen.has(key))close(key,i-1);
 }
 for(const key of [...active.keys()])close(key,samples.length-1);
 intervals.sort((a,b)=>a.startIndex-b.startIndex||(a.kind==='collision'?-1:1));
 return {intervals,minimumGap,minimumAt,invalid,firstCollision,criticalSamples,truncated,collisionEvents:intervals.filter(x=>x.kind==='collision').length,singularityEvents:intervals.filter(x=>x.kind==='singularity').length,samples:samples.length};
}

export function sampleSeverity(sample){if(sample.valid===false)return 'invalid';if(sample.report?.collisions?.length)return 'collision';if(sample.report?.singularities?.length)return 'singularity';if(sample.report?.near?.length)return 'near';return 'clear'}
