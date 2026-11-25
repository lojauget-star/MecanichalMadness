/** Testes funcionais de configurações de mecanismo, além das juntas 2D.
 * Um comprimento de barra correto não implica que a função do produto é cumprida.
 * A família inicialmente auditável é uma mesa de parede com dobradiça, escora e guia.
 */
const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const rad=d=>d*Math.PI/180;
export function functionalIntent(question){
 const q=clean(question);
 return /\bmesa\b/.test(q)&&/(parede|mural|retratil|dobrav|basculant|rebativel|compactad|encostad)/.test(q)?'wall_table':null;
}
/** Uma vista lateral de referência, NÃO um projeto estrutural de mesa. */
export function referenceWallTable(){
 return {mode:'local',template:'custom',title:'Mesa retrátil de parede · estudo cinemático',
 explanation:'Uma barra rígida representa o tampo lateral, presa à parede pela dobradiça A. Uma escora conecta sua ponta T ao cursor S de uma guia vertical na parede. O cursor move a abertura com um grau de liberdade. É um estudo 2D, não um móvel pronto.',
 steps:['Fixar a dobradiça A na parede.','Usar a barra A–T de 560 mm como referência para o tampo.','Ligar a escora T–S ao cursor vertical S, abaixo da dobradiça.','Mover S para baixo para abrir o tampo até horizontal.','Na posição fechada, tampo e escora ficam quase verticais junto à parede.'],
 warnings:['Limitar o fechamento a cerca de 85° para evitar singularidade no alinhamento vertical.','Precisará de trava e batentes mecânicos, verificação de carga, estabilidade e cópia simétrica do suporte.','O tampo é representado por uma barra 2D, sem espessura real nem colisões volumétricas.'],
 assembly:{nodes:[{id:'A',x:0,y:0,fixed:true,sliderAngle:0,sliderRange:0},{id:'T',x:560,y:0,fixed:false,sliderAngle:0,sliderRange:0},{id:'S',x:0,y:280,fixed:false,sliderAngle:90,sliderRange:520}],bars:[{a:'A',b:'T'},{a:'T',b:'S'}],gears:[],racks:[],mates:[]}};
}
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function auditWallTableAssembly(spec){
 const fail=reason=>({ok:false,kind:'wall_table',reason});
 if(!spec||!Array.isArray(spec.nodes)||!Array.isArray(spec.bars))return fail('Nenhum conjunto de barras foi descrito.');
 const nodes=spec.nodes,bars=spec.bars;
 const attached=(a,b)=>bars.some(p=>p.a===a&&p.b===b||p.a===b&&p.b===a);
 for(const A of nodes.filter(n=>n.fixed)){
  for(const T of nodes.filter(n=>!n.fixed&&!n.sliderRange&&attached(A.id,n.id))){
   const L=d(A,T);if(L<150||L>700||T.x-A.x<L*.86||Math.abs(T.y-A.y)>L*.13)continue;
   for(const S of nodes.filter(n=>!n.fixed&&n.sliderRange>0&&attached(T.id,n.id))){
    if(Math.abs(S.x-A.x)>L*.06||S.y<=A.y||Math.abs(Math.cos(rad(S.sliderAngle)))>.13)continue;
    const K=d(S,T);if(K<=1.005*L)continue;
    const initial=A.y+Math.sqrt(K*K-L*L);
    if(Math.abs(S.y-initial)>L*.10)continue;
    let min=Infinity,max=-Infinity,feasible=true;
    for(let i=0;i<=34;i++){
     const theta=rad(85*i/34),x=L*Math.cos(theta);
     const sy=A.y-L*Math.sin(theta)+Math.sqrt(K*K-x*x);
     min=Math.min(min,sy);max=Math.max(max,sy);
     if(Math.abs(sy-S.y)>S.sliderRange/2+1e-5){feasible=false;break}
    }
    if(!feasible)continue;
    return {ok:true,kind:'wall_table',checked:true,hingeId:A.id,tipId:T.id,sliderId:S.id,openAngleDeg:0,closedAngleDeg:85,tabletopLengthMm:Math.round(L),braceLengthMm:Math.round(K),foldedDepthMm:Math.round(L*Math.cos(rad(85))),sliderTravelMm:Math.round(max-min),caveat:'Somente cinemática 2D. Falta validar travamento, esforços, estabilidade e fabricação.'};
   }
  }
 }
 return fail('Não foi identificada uma mesa lateral articulada à parede com escora à ponta e guia vertical capaz de percorrer aberto horizontal e recolhido quase vertical. Outras arquiteturas são possíveis, mas não foram verificadas por este teste.');
}
export function auditFunctionalPlan(question,plan){
 if(functionalIntent(question)!=='wall_table')return {ok:true,checked:false};
 return plan?.template==='custom'?auditWallTableAssembly(plan.assembly):{ok:false,kind:'wall_table',reason:'A IA não propôs uma montagem verificável para as posições aberta e fechada da mesa.'};
}
