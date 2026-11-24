# KINÉTIKA — Mechanical Atelier V12

Laboratório de mecanismos planos com engenharia cinemática interativa e interface responsiva. Barras, pivôs, apoios fixos, guias, engrenagens, cremalheiras, polias e pantógrafos podem ser adicionados à mesma montagem, reposicionados, rotacionados e conectados por juntas.

## V12 · Juntas de todos os vértices e cotas de barras seguras

- A ferramenta **J / Unir pontos** aceita **qualquer extremidade ou pivô central de um pantógrafo** como porta de conexão com outro pivô ou com as portas da cremalheira.
- A união cria restrições persistentes entre os pontos; não funde os nós dos pantógrafos nem altera os ângulos escolhidos. O editor translada inicialmente o módulo não ancorado para coincidir pontos, preservando a direção no plano.
- É possível ligar um vértice ao apoio fixo e outro à cremalheira para transmitir a mudança de abertura sob restrições geométricas. Conexões incompatíveis são recusadas; um único vértice conectado apenas define a posição, não define automaticamente uma única abertura.
- As barras novas e importadas ficam em **🔒 Travada**, com comprimento que não muda durante o movimento. Use o botão **✎ Liberar para dimensionar** para ajustar temporariamente a dimensão. O botão **🔒 Fixar dimensão atual** registra a medida resultante e reativa a restrição rígida.
- Ao ultrapassar uma configuração admissível, a simulação interrompe o movimento e restaura a última pose consistente para evitar representar uma barra rígida como se fosse de borracha.
- Arquivos V11 são aceitos; o novo JSON inclui `nodeLinks` e `dimensionMode`. O núcleo matemático continua sendo apenas **cinemático 2D**, sem rigidez elástica, esforços ou resistência mecânica.

## V11 · Varredura de percurso e folga geométrica

Clique em **⤳ Percurso** no cabeçalho (ou **Geometria → Analisar percurso completo**) e execute uma varredura de **41, 81 ou 161 quadros**, escolhendo a duração de 0,25–90 segundos. Se existir um motor ou uma mola idealizada, o simulador percorre seu acionamento no tempo. Sem motor, o editor pode gerar **um ensaio virtual** sobre a rotação de uma roda, o curso de um cursor, a abertura de um pantógrafo ou o giro de uma barra apoiada, **sem modificar o projeto**. Nesse caso, os segundos são apenas uma escala de referência e não representam velocidade física.

A varredura apresenta:

- **Mapa temporal** das interferências geométricas (vermelho), alinhamentos críticos (âmbar), proximidades (azul) e posições não resolvidas (cinza).
- **Prévia dinâmica selecionável** do mecanismo em qualquer uma das posições amostradas, com navegação por slider e clique nos eventos.
- **Curva da folga mínima** entre peças não identificadas como um par de contato intencional, destacando valores negativos de penetração de envelopes.
- **Lista de intervalos** de início e fim de cada colisão ou condição crítica, com os elementos envolvidos e a penetração máxima estimada.
- **Exportação CSV** com uma linha por amostra, incluindo tempo, ocorrências, menor folga e erro residual.
- **Progresso e interrupção** de varreduras longas; processamento em pequenos lotes, cedendo tempo à UI.

Os cálculos de percurso ocorrem **sobre uma cópia do modelo**. O projeto, o estado do editor e o autosave não são modificados pela inspeção. Amostras com erro de resolução elevado são assinaladas como inconclusivas.

## Instalação e publicação

Requer **Node.js 20.19+** (recomendado 22).

```bash
npm install
npm run dev
npm run check
npm test
npm run build
```

Vite publica a pasta `dist`. O `netlify.toml` inclui comando de build e diretório de saída. Se o Netlify estiver conectado à branch `main` com auto-deploy habilitado, um push dispara uma nova compilação. O GitHub Actions também executa os testes e o build.

## Ferramentas do editor

**V** testa o movimento por arraste inverso, **G** reposiciona montagens, **R** rotaciona, **J** conecta pontos compatíveis. Shift+clique seleciona dois objetos para alinhamento dos centros X/Y. O construtor de pantógrafos adiciona um novo mecanismo ao desenho, preservando o projeto atual. Os projetos podem ser exportados e importados em JSON, com histórico de desfazer/refazer e autosave local.

## Limitações e interpretação

A inspeção usa **amostragem temporal discreta** e perfis **2D aproximados**: barras como cápsulas, cremalheiras como segmentos espessos e rodas como círculos pelo raio primitivo. Contatos intencionais de engrenagens e articulações são filtrados. Uma interferência pode ser evitada em planos Z diferentes; e uma análise sem colisões nas amostras **não prova passagem livre entre os quadros**. Diminuir o intervalo de amostragem melhora a detecção, mas não a torna contínua. As singularidades são indícios geométricos e não comprovação de travamento. Não são calculados contato real de dentes, forças, torques, atrito, flambagem, resistência, espessura real nem tolerâncias de fabricação. Não substitui CAD/CAE e ensaio de protótipo para validação de segurança.
