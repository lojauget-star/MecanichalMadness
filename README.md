# KINÉTIKA Mechanical Atelier V7

A bancada de montagem cinemática 2D agora inclui **Analisar montagem**, histórico **Desfazer/Refazer** e recuperação automática do projeto no navegador.

```sh
npm install
npm run dev
npm run check
npm test
npm run build
```

A ferramenta ◇ Analisar estima graus de liberdade pelo posto do jacobiano na configuração atual. Inclui barras, apoios, guias, transmissões e pantógrafos paramétricos. Restrições redundantes são informativas, não necessariamente erros. Não é ainda um solucionador universal de novas classes de juntas e não verifica forças, rigidez, colisões ou segurança estrutural.

Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Shift+Z refaz. Até 80 estados. Dados guardados somente no navegador; use Salvar para exportar JSON.

Netlify: `npm run build` → `dist/`, com `netlify.toml` mantido. GitHub Actions verifica o código, executa os testes e compila no push para `main`.
