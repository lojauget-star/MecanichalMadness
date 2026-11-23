# KINÉTIKA — Mechanical Atelier

Laboratório de cinemática 2D em Vite, com interface responsiva de inspiração editorial japonesa/coreana. Evolução do KINÉTIKA V4, preservando o motor cinemático existente e acrescentando **pontos magnéticos e juntas de coincidência** (V5).

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
