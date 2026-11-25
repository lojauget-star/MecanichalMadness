/** KINÉTIKA: propostas locais verificáveis. Não são inferências de IA. */
import {emptyAssembly,validateCustomAssembly} from './assembly-builder.js';
import {functionalIntent,referenceWallTable} from './functional-design.js';
export const TEMPLATE_IDS = Object.freeze(['cross_racks', 'scissor', 'custom', 'none']);
const lower = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function suggestLocalPlan(question) {
  const text = lower(question);
  if(functionalIntent(question)==='wall_table')return referenceWallTable();
  if (/(cruz|quatro direc|4 direc|quatro brac|4 brac|quatro cremalheir|4 cremalheir)/.test(text)) {
    return {
      template: 'cross_racks', title: 'Expansão em quatro direções',
      explanation: 'Um pinhão central transmite sua rotação a quatro cremalheiras tangentes, orientadas em dois eixos perpendiculares. Um mesmo ângulo do pinhão produz quatro movimentos lineares coordenados.',
      steps: ['Colocar uma engrenagem central sobre um eixo fixo.', 'Dispor duas cremalheiras horizontais em lados opostos do pinhão.', 'Adicionar duas cremalheiras verticais nos outros dois lados.', 'Testar o giro e ajustar cursos, sentidos e folgas antes de incorporar braços estruturais.'],
      warnings: ['Modelo cinemático 2D: os trilhos se cruzam em projeção. Uma montagem física pode exigir camadas axiais distintas, guias e espaçadores.', 'A direção de saída depende do lado de engrenamento. As quatro cremalheiras não se movem radialmente sobre a mesma reta passando pelo centro.'],
      mode: 'local'
    };
  }
  if (/(pantograf|tesoura|sanfona)/.test(text)) {
    return {template:'scissor',title:'Elevação por pantógrafo',explanation:'Um conjunto de barras cruzadas com pivôs centrais permite variar altura e largura por um curso de entrada. A implantação requer apoios e guias coerentes.',steps:['Adicionar três estágios de tesoura ao projeto.', 'Definir qual apoio ficará fixo e qual extremidade será deslizante.', 'Aplicar movimento a um ponto guiado.', 'Inspecionar singularidades nas posições quase fechada e quase aberta.'],warnings:['Pantógrafos colapsados podem alcançar singularidades; não inferir força ou estabilidade estrutural pela animação.'],mode:'local'};
  }
  if (/(biela|pistao|piston|manivela|alternad|reciproc)/.test(text)) {
    return {template:'custom',title:'Mecanismo biela–manivela (biblioteca local)',explanation:'Uma barra em rotação transmite deslocamento alternado a um cursor. O desenho é um exemplo parametrizável, não uma montagem calculada para seu produto.',steps:['Criar um apoio fixo, dois pivôs móveis e uma guia horizontal.', 'Conectar o apoio à manivela e a manivela à biela.', 'Mover manualmente a manivela e observar o cursor.', 'Ajustar as dimensões, verificando pontos mortos e interferências.'],warnings:['Exemplo local predefinido, sem consulta à IA.', 'A montagem pode exigir ajustes de posição e comprimento para cumprir o curso desejado.'],mode:'local',assembly:{nodes:[{id:'A',x:0,y:0,fixed:true,sliderAngle:0,sliderRange:0},{id:'B',x:45,y:55,fixed:false,sliderAngle:0,sliderRange:0},{id:'C',x:165,y:0,fixed:false,sliderAngle:0,sliderRange:320}],bars:[{a:'A',b:'B'},{a:'B',b:'C'}],gears:[],racks:[],mates:[]}};
  }
  return {template:'none',title:'Estudo da ideia',explanation:'Para selecionar uma transmissão é necessário definir o movimento de entrada e o de saída, o curso aproximado e quais pontos permanecem fixos.',steps:['Descrever o objetivo em termos de movimento (girar, deslizar, elevar ou expandir).', 'Informar o número de saídas e a direção de cada uma.', 'Experimentar uma transmissão simples primeiro e acoplar novos mecanismos progressivamente.'],warnings:['Esta é uma orientação local baseada em regras, não uma resposta de modelo de IA.'],mode:'local'};
}
export function modelSummary(model) {return {nodes:model.nodes?.length||0,bars:model.bars?.length||0,gears:model.gears?.length||0,racks:model.racks?.length||0,scissors:model.scissors?.length||0,joints:(model.pinLinks?.length||0)+(model.pointLinks?.length||0)+(model.nodeLinks?.length||0)};}
/** Adiciona sem apagar o projeto atual. Sem privilégios para modificar código. */
export function appendCrossRacks(model, x=0, y=0) {
  if (!model || !Array.isArray(model.nodes)||!Array.isArray(model.gears)||!Array.isArray(model.racks)) throw Error('Projeto inválido');
  const next=prefix=>`${prefix}${model.next++}`;
  const gn={id:next('n'),x,y,fixed:true,slider:null,follower:null,motor:null};model.nodes.push(gn);
  const radius=36,gear={id:next('g'),node:gn.id,type:'gear',teeth:24,module:3,radius,angle:0,baseAngle:0,motor:null};model.gears.push(gear);
  const spread=radius+9;
  // Tangentes nas quatro faces do pinhão: duas horizontais, duas verticais.
  const defs=[{angle:0,side:1},{angle:0,side:-1},{angle:90,side:1},{angle:90,side:-1}];
  const racks=[];
  for(const d of defs){
    const angle=d.angle*Math.PI/180, ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
    const px=x+d.side*spread*vx, py=y+d.side*spread*vy;
    const nn={id:next('n'),x:px,y:py,fixed:false,slider:{ox:px,oy:py,angle:d.angle,range:138},follower:null,motor:null};model.nodes.push(nn);
    const rr={id:next('r'),node:nn.id,length:190,gearId:gear.id,offset:0,side:d.side,anchorX:0};model.racks.push(rr);racks.push(rr);
  }
  return {gearId:gear.id,rackIds:racks.map(r=>r.id),x,y};
}
export function normalizeAdvisorPlan(raw) {
 const p=(raw&&typeof raw==='object')?raw:{};
 const template=TEMPLATE_IDS.includes(p.template)?p.template:'none';
 const asText=(s,max=1200)=>String(s??'').slice(0,max);
 return {mode:p.mode==='ai'?'ai':'local',template,title:asText(p.title,120),explanation:asText(p.explanation,1100),steps:(Array.isArray(p.steps)?p.steps:[]).slice(0,6).map(x=>asText(x,250)),warnings:(Array.isArray(p.warnings)?p.warnings:[]).slice(0,4).map(x=>asText(x,260)),assembly:template==='custom'?validateCustomAssembly(p.assembly):emptyAssembly()};
}
