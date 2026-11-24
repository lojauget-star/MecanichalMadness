/** KINÉTIKA V12 — juntas de coincidência e gestão explícita de cotas.
 * Modelagem geométrica, sem deformação elástica nem cálculo de resistência.
 */
export const isDraftBar = bar => bar?.dimensionMode === 'draft';
export const declaredBarLength = (bar, positions) => {
  const a = positions.get(bar.a), b = positions.get(bar.b);
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN;
};
export const isScissorNode = (model, nodeId) => (model.scissors || []).some(s =>
  [...(s.topIds||[]), ...(s.bottomIds||[]), ...(s.centerIds||[])].includes(nodeId));
export const isConnectedScissor = (model, scissor) => {
 const ids = new Set([...(scissor.topIds||[]), ...(scissor.bottomIds||[]), ...(scissor.centerIds||[])]);
 return (model.pointLinks||[]).some(l=>ids.has(l.nodeId)) ||
  (model.nodeLinks||[]).some(l=>ids.has(l.a)||ids.has(l.b)) ||
  (model.pinLinks||[]).some(l=>l.scissorId===scissor.id);
};
export const countScissorContacts = (model, scissor) => {
 const ids = new Set([...(scissor.topIds||[]), ...(scissor.bottomIds||[]), ...(scissor.centerIds||[])]);
 return (model.pointLinks||[]).filter(l=>ids.has(l.nodeId)).length +
  (model.nodeLinks||[]).filter(l=>ids.has(l.a)||ids.has(l.b)).length +
  (model.pinLinks||[]).filter(l=>l.scissorId===scissor.id).length;
};
export function validateNodeJoint(model,a,b){
 if(a===b)return 'Não é possível unir um ponto a ele mesmo.';
 const nodes = new Map((model.nodes||[]).map(n=>[n.id,n]));
 const n1=nodes.get(a),n2=nodes.get(b);
 if(!n1 || !n2)return 'Os dois pontos devem existir.';
 if((model.nodeLinks||[]).some(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a)))return 'Essa junta já existe.';
 const same=(model.scissors||[]).some(s=>{
  const ids=[...(s.topIds||[]),...(s.bottomIds||[]),...(s.centerIds||[])];
  return ids.includes(a)&&ids.includes(b);
 });
 if(same)return 'Esses vértices já pertencem ao mesmo pantógrafo; una-os a uma peça externa.';
 if(n1.fixed&&n2.fixed&&Math.hypot(n1.x-n2.x,n1.y-n2.y)>.05)
  return 'Dois apoios fixos em posições diferentes não podem ser coincidentes.';
 return null;
}
/** Preserva o ângulo do pantógrafo ao transladar um vértice para a posição-alvo. */
export function translateScissorToVertex(s, nodeId, point, nodes){
 const n=nodes.find(n=>n.id===nodeId);
 if(!n || !point)return false;
 const dx=point.x-n.x,dy=point.y-n.y;
 s.x+=dx;s.y+=dy;
 return true;
}
