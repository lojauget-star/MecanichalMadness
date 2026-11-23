# KINÉTIKA — Mechanical Atelier

Laboratório de cinemática 2D em Vite, com interface responsiva de inspiração editorial japonesa/coreana. Evolução do KINÉTIKA V5, acrescentando **juntas por portas mecânicas tipadas, ancoragens múltiplas de cremalheira e ligações de pivôs com eixos** (V6).

## Executar localmente

Requer Node.js 20.19+ (recomendado 22).

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Para produção:

```bash
npm run check
npm run build
npm run preview
```

## Novidades da V6

- **J — Unir pontos:** selecione duas portas (pivôs, eixo de engrenagem, ponta/centro/âncora da cremalheira, pivô do pantógrafo). O editor identifica compatibilidade e recusa uniões geométricas inválidas.
- **Pivô ↔ cremalheira:** uma extremidade livre de barra pode ficar vinculada à cremalheira. Sua posição acompanha o trilho; o pivô conectado pode acionar o deslocamento da cremalheira com arraste.
- **Pivô ↔ eixo ou pivô:** os nós são fundidos em uma junta revoluta, respeitando os apoios existentes.
- **Cremalheira ↔ pantógrafo:** transmite abertura pela guia, com limite de curso; vínculo já existente preservado.
- **Desfazer:** links pivô–cremalheira podem ser desconectados no inspetor. Uniões nó–nó, por serem fusões de topologia, requerem desfazer via edição do projeto; o histórico universal de undo/redo é uma evolução planejada.
- **JSON versão 6:** importa projetos antigos V1–V5 e mantém `pointLinks[]` e `pinLinks[]`.
- **Netlify:** configuração em `netlify.toml` para publicar `dist` ao receber push do GitHub.

## Controles principais

- **V — Testar:** arrastar cremalheiras, girar rodas pela borda e movimentar pantógrafos.
- **G — Mover:** reposicionar conjuntos ligados sem alterar comprimentos.
- **R — Rotacionar:** orientar peças e módulos no plano.
- **Shift+clique:** selecionar dois objetos para alinhamento X/Y.
- **Criar pantógrafo:** adicionar novos módulos ao projeto atual.
- **Ponto dourado na cremalheira:** arrastar ao longo dos dentes, ou escolher Início / Centro / Fim / cota em mm pelo inspetor.
- **Encaixar por sobreposição:** aproximar o ponto dourado da cremalheira ao ponto ↕ do pantógrafo até aparecer o halo verde; soltar cria uma junta persistente.
- **Articulação coincidente:** a guia da cremalheira passa a acionar a abertura do pantógrafo; o movimento é bidirecional e limitado pela geometria (a base do pantógrafo fica fixa na ligação).
- **Pivôs livres coincidentes:** arrastar um pivô livre sobre outro compatível os funde em um único nó se as barras puderem preservar o comprimento.
- **Desfazer união:** botão no inspetor da cremalheira ou do pantógrafo.
- **Exemplo pronto:** «Encaixe: cremalheira + pantógrafo» na biblioteca.
- **Salvar / Abrir:** exportar/importar JSON, incluindo posição das âncoras e juntas.
- **Exemplos:** modelos prontos substituem a cena atual (o construtor de pantógrafos não substitui).

No celular, a biblioteca de ferramentas fica na faixa horizontal inferior; o inspetor abre pelo botão **☷**. O motor continua sendo uma simulação **cinemática**: não calcula atrito, torque, esforços, contato de dentes nem colisões 3D.

## Arquitetura

- `index.html`: UI legada preservada (IDs críticos mantidos).
- `src/main.js`: solucionador 2D da V4 estendido com juntas V5 (`pinLinks`), limites cinemáticos de acionamento e âncoras locais nas cremalheiras.
- `src/legacy.css`: estilos funcionais do editor.
- `src/atelier.css`: camada de design responsiva premium, sem alterar o solucionador.
- `vite.config.js`: base `/` no ambiente local e `/MecanichalMadness/` no GitHub Pages.
- `.github/workflows/deploy.yml`: build Vite e deploy automático no Pages ao publicar `main`.

### Publicar GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. O fluxo de deploy será executado em push para `main`, e o endereço esperado será `https://lojauget-star.github.io/MecanichalMadness/` quando a publicação estiver habilitada e concluída. Não confunda código enviado ao repositório com site já publicado.

## Futuro

A estrutura preserva o motor monolítico por compatibilidade com os projetos anteriores. A próxima migração pode isolar modelo de dados, solucionador de restrições e renderizador em módulos e adicionar testes automatizados de regressão cinemática.

## Limites técnicos do encaixe V5

- A união cremalheira–pantógrafo implementa **um par cinemático deslizante acionando um pantógrafo guiado**: o eixo transversal do X se alinha automaticamente à guia da cremalheira, e a primeira articulação superior serve de referência fixa. Não são geradas automaticamente juntas arbitrárias com mobilidades inconsistentes.
- A peça pode ser deslocada e sua âncora pode mudar de posição; a posição do suporte do pantógrafo é reconfigurada na edição. Não simula força, deformação nem colisão.
- As âncoras da cremalheira são locais ao corpo dentado, não ao solo. Os dados ficam salvos em `racks[].anchorX` e `pinLinks[]` no projeto JSON v5.
- Se uma união faria um conjunto livre ultrapassar a faixa admitida, o solucionador limita o curso em vez de alongar artificialmente as barras.

## Limitações da V6

O motor 2D ainda não implementa todas as famílias de juntas (junta prismática entre dois corpos rígidos, contatos 3D, engrenamentos físicos e solver dinâmico). Os acoplamentos implementados são vinculados à geometria; não declare continuidade física para tipos rejeitados. O indicador de erro informa resíduo geométrico, mas não certifica resistência nem ausência de singularidade.
