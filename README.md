# KINÉTIKA — Mechanical Atelier

Laboratório de cinemática 2D em Vite, com interface responsiva de inspiração editorial japonesa/coreana. Migração do KINÉTIKA V4 **sem descartar o motor cinemático existente**.

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
- **Salvar / Abrir:** exportar/importar JSON.
- **Exemplos:** modelos prontos substituem a cena atual (o construtor de pantógrafos não substitui).

No celular, a biblioteca de ferramentas fica na faixa horizontal inferior; o inspetor abre pelo botão **☷**. O motor continua sendo uma simulação **cinemática**: não calcula atrito, torque, esforços, contato de dentes nem colisões 3D.

## Arquitetura

- `index.html`: UI legada preservada (IDs críticos mantidos).
- `src/main.js`: motor 2D original da V4 e handlers do editor.
- `src/legacy.css`: estilos funcionais do editor.
- `src/atelier.css`: camada de design responsiva premium, sem alterar o solucionador.
- `vite.config.js`: base `/` no ambiente local e `/MecanichalMadness/` no GitHub Pages.
- `.github/workflows/deploy.yml`: build Vite e deploy automático no Pages ao publicar `main`.

### Publicar GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. O fluxo de deploy será executado em push para `main`, e o endereço esperado será `https://lojauget-star.github.io/MecanichalMadness/` quando a publicação estiver habilitada e concluída. Não confunda código enviado ao repositório com site já publicado.

## Futuro

A estrutura atualmente preserva o motor da V4 monolítico para reduzir riscos. A próxima migração pode isolar modelo de dados, solucionador de restrições e renderizador em módulos e adicionar testes automatizados de regressão cinemática.