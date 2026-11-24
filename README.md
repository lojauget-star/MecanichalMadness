# KINÉTIKA V10 — Interferências e singularidades 2D

Novo módulo `src/geometry.js`, com checagem geométrica aproximada de colisões e posições críticas.

## Novidades

- △ **Geometria** na barra superior: sobreposição de barras, rodas e cremalheiras, e distância mínima de aproximação.
- **Vermelho** na bancada: interferência geométrica estimada. **Amarelo**: alinhamento crítico de barras ou pantógrafo no limite de abertura.
- Exclusão de contatos intencionais em pivôs compartilhados, pinhão-cremalheira vinculado e engrenagens efetivamente engrenadas.
- Modal com inventário dos alertas, resumo, controle de sobreposição gráfica e recalcular.
- 13 testes automatizados de proximidade e colinearidade adicionados aos testes existentes.

## Limitações

Os componentes são aproximados por segmentos com espessura e círculos pelo raio primitivo. Uma colisão de envelopes 2D pode ser fisicamente evitada por peças em planos de profundidade diferentes. Pontos mortos são **suspeitas geométricas**, não prova de perda de mobilidade; não se calculam forças, deformações, espessuras reais, tolerâncias de fabricação ou perfis dos dentes. A versão atual não impede automaticamente o movimento ao identificar interferência: ela apenas sinaliza.

## Desenvolvimento

```bash
npm install
npm run dev
npm run check
npm test
npm run build
```

Netlify: `npm run build`, publish `dist`.
# KINÉTIKA · Mechanical Atelier V9

Laboratório 2D para montagem e experimentação de mecanismos: barras, pivôs, guias, engrenagens, cremalheiras, polias e pantógrafos. Interface responsiva com orientação livre de peças e vínculos por portas de conexão.

## Executar

Requer Node.js 20.19+ (recomendado 22).

```sh
npm install
npm run dev
```

Para verificar o código e gerar os arquivos de produção:

```sh
npm run check
npm test
npm run build
```

No Netlify, o `netlify.toml` usa `npm run build` e publica `dist/`. O push para `main` inicia um deploy se o site estiver conectado e a publicação automática estiver habilitada.

## Novidades da V9 — arraste cinemático inverso

- **Arraste inverso pelo modo Testar (V):** puxar um pivô livre, uma extremidade de barra, uma cremalheira, a borda de uma engrenagem ou a alça de abertura do pantógrafo passa a acionar a cadeia inteira, em vez de reposicionar rigidamente todo o desenho.
- **Alvo suave:** a posição do cursor é uma intenção, não uma obrigação que estique peças. Em limites cinemáticos, o ponto permanece na configuração admissível mais próxima; uma linha tracejada mostra a distância até o cursor.
- **Restrições prioritárias:** apoios fixos, comprimento de barras, guias, coincidências, acoplamentos de engrenagens e cremalheiras e geometria de pantógrafos usam o mesmo resolvedor V8, com meta de movimento de menor prioridade.
- **Motor desacoplado do gesto:** o editor pausa a animação durante o teste; ao soltar a engrenagem sua nova fase torna-se a referência de repouso.
- **Movimentação de projeto separada:** use **G** para mover uma montagem rigidamente, **R** para alterar a orientação de componentes, e **V** para testar a cinemática.
- **Testes automatizados adicionais:** posição livre, barra com apoio, limite inalcançável, circuito de quatro-barras, engrenagem com duas cremalheiras, manivela excêntrica e abertura de pantógrafo.

## Validação

`npm run check` e `npm test` foram executados localmente, com 22 testes aprovados. O ambiente local bloqueia downloads npm e a navegação gráfica, portanto o build Vite e a verificação visual ficam para o pipeline GitHub/Netlify. Não há cálculo de forças, colisões, tensões, atrito nem resistência estrutural.

## Interpretação responsável do diagnóstico

O jacobiano é avaliado **na configuração atual** do mecanismo. A mobilidade calculada pode mudar perto de singularidades, e vínculos redundantes não são necessariamente defeitos. A V7 **não substitui o motor de simulação por um solver universal**; ela oferece a base de análise e identifica problemas antes de novas classes de juntas serem introduzidas. Não calcula forças, torque, contato de dentes, atrito, deformação, resistência estrutural ou colisões 3D.

O analisador limita-se a 260 variáveis por acionamento para preservar a responsividade. Esta é uma ferramenta exploratória de cinemática, não uma verificação de segurança de equipamentos físicos.

## Controles

- V testar, G mover, R rotacionar, J unir pontos.
- Shift+clique para dois objetos no alinhamento X/Y.
- Clique ◇ Analisar no cabeçalho para ver as restrições e graus de liberdade.
- Arraste engrenagens pela borda para girá-las; arraste cremalheiras ao longo das guias.
- Use Criar pantógrafo para inserir um novo módulo sem substituir o projeto atual.
- Salve o projeto como JSON para compartilhar ou manter backup; o autosave permanece apenas no navegador.