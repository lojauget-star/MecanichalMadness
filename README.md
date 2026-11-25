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

## V13 · Juntas reversíveis, guias móveis e assistente de projetos

- **U — Desunir:** selecionar um ponto de conexão libera uma junta; no inspetor do pantógrafo aparecem todas as juntas e controles individuais para desfazê-las.
- **Guia linear:** selecione o trilho (não o cursor) e arraste para reposicioná-lo. A origem X/Y, rotação e curso também aparecem no inspetor. No modo G a montagem conectada acompanha a guia para preservar vínculos.
- **✦ Projetar:** propostas locais explicativas e inserção da transmissão em cruz, com quatro cremalheiras e engrenagem central. A montagem **é adicionada** ao projeto atual; não substitui as peças existentes. Há um template de pantógrafo e sugestões textuais para biela-manivela.
- **IA online opcional:** função Netlify `/.netlify/functions/mechanical-advisor` usando a API Responses. Para habilitar em Site configuration → Environment variables, configure **OPENAI_API_KEY** e **KINETIKA_ASSISTANT_ACCESS_CODE** (código privado de acesso ao recurso). Opcional: **OPENAI_MODEL**. Nenhuma chave aparece no navegador ou no GitHub. Se não estiver configurada, o assistente avisa que usa somente regras locais. **A API da OpenAI tem custos próprios; o ChatGPT Plus não inclui créditos de API.** A função exige código de acesso; configure proteção adicional/limites de taxa antes de disponibilizar a terceiros.
- **Cautela:** a transmissão em cruz é uma aproximação cinemática 2D. Quatro cremalheiras tangenciais podem ter interferências entre si no mesmo plano físico; a montagem real poderá exigir diferentes alturas, espaçadores, mancais e guias. A proposta não é validação estrutural.

## V14 · Gemini por padrão com biblioteca local gratuita

A função segura de Netlify `/.netlify/functions/mechanical-advisor` oferece respostas estruturadas por **Gemini** como provedor preferencial, sem chave exposta ao navegador. Não existe chave universal gratuita e ilimitada: o nível gratuito da API depende de uma chave vinculada ao projeto do Google AI Studio e da elegibilidade/quota desse projeto.

Em **Netlify → Site configuration → Environment variables**, configure:

- `GEMINI_API_KEY` = chave existente do seu projeto Google AI Studio (não coloque no GitHub ou em variáveis `VITE_*`).
- `KINETIKA_ASSISTANT_ACCESS_CODE` = senha longa privada, exigida de quem solicitar IA online. Não distribua o código em sites públicos.
- Opcional: `GEMINI_MODEL` = `gemini-3.5-flash-lite` (padrão; altere de acordo com modelos habilitados para seu projeto).
- Opcional: `KINETIKA_AI_PROVIDER` = `gemini` ou `openai`; sem ela, Gemini tem preferência sempre que configurado. A OpenAI **não é acionada automaticamente** se o Gemini esgotar a cota.
- Opcional: `OPENAI_API_KEY` e `OPENAI_MODEL` apenas para usar OpenAI deliberadamente.

Depois de definir variáveis, faça novo deploy para aplicá-las. O endpoint GET indica somente disponibilidade e provedor, sem revelar nenhum segredo. Se faltar chave/código, se a cota acabar ou se houver erro de permissão, o botão mantém as propostas **locais gratuitas e sem IA online**; nenhuma API paga é acionada automaticamente.

**Atenção para divulgação pública:** um código compartilhado simples não fornece autenticação por usuário nem limites de consumo robustos. Antes de abrir o serviço a terceiros, implemente login, limitação de taxa distribuída, observabilidade e teto de uso. A franquia gratuita depende da elegibilidade do projeto e pode variar.


## V15 · Propostas generativas (correção de repetição dos exemplos)

**Causa corrigida:** nas versões anteriores o endpoint de IA forçava `cross_racks`, `scissor` ou `none`; a interface só inseria dois exemplos, e o classificador local ativava `cross_racks` até para objetivos vagos como "expandir". Essa limitação foi removida.

- **Gerar com IA:** usa o Gemini no servidor Netlify para propor um **grafo original** de pivôs, apoios, guias, barras rígidas, engrenagens e cremalheiras, com posições iniciais e conexões declarativas. As chaves não são transmitidas ao navegador.
- **Biblioteca local:** é um botão separado, explicitamente identificado como exemplo sem IA. Biela–manivela pode ser inserida diretamente; expansão em cruz só aparece quando o texto pede claramente cruz/quatro braços/quatro direções. Uma ideia genérica não é transformada automaticamente em cruz.
- **Inserção controlada:** o grafo de saída é validado quanto a limites de quantidade, referências, faixas dimensionais, tipos de peças e incompatibilidades óbvias. As entidades são adicionadas ao projeto atual apenas após confirmação; erro de resolução cancela a operação e preserva o projeto anterior.
- **Sem substituição silenciosa:** falhas do Gemini, falta de credenciais ou código inválido geram mensagem específica, e não uma resposta de aparência generativa com o template local. Nunca há ativação automática da OpenAI paga; `KINETIKA_AI_PROVIDER=openai` é necessário para habilitá-la.
- **Configuração:** Netlify → Environment variables → `GEMINI_API_KEY`, `KINETIKA_ASSISTANT_ACCESS_CODE` e, se necessário, `GEMINI_MODEL` com ID disponível para o seu projeto. Após configurar, faça um novo deploy. A rota GET `/.netlify/functions/mechanical-advisor` indica `available:true` quando há configuração suficiente, mas **não prova** que a chave/modelo têm acesso válido antes de uma consulta real.
- **Limites explícitos:** a montagem gerada é um **rascunho cinemático 2D**; solver local não valida resistência, fabricação, colisões tridimensionais ou curso completo. O conjunto de componentes geráveis é limitado aos tipos atualmente suportados; propostas complexas podem ser rejeitadas em vez de deformadas para caber no exemplo.

Rode `npm run check && npm test && npm run build` na CI. Testes V15 incluem diferenças topológicas, transmissão, rejeição de modelos malformados e API Gemini simulada com novo `assembly` declarativo.


## V16 · Diagnóstico de ativação da IA no Netlify

A função `GET /.netlify/functions/mechanical-advisor` informa um `diagnostic` sem revelar segredos:

- `ready`: chave do provedor e `KINETIKA_ASSISTANT_ACCESS_CODE` disponíveis na função publicada; **não comprova** que a API externa aceitou a chave.
- `missing_access_code`: Gemini identificado, mas falta o código de acesso na função de produção.
- `missing_provider_key`: função publicada, mas chave do provedor selecionado não encontrada no ambiente Functions. Se `KINETIKA_AI_PROVIDER=openai`, troque para `gemini` ou remova a variável.

O painel apresenta o diagnóstico real. Se GET retornar 404, verifique Functions e o deploy; se a API do Google retornar 404 em POST, verifique o `GEMINI_MODEL`.

A configuração do Netlify deve incluir o escopo **Functions**, o contexto **Production** e um novo deploy; editar variáveis sem redeploy não basta. Não exponha `GEMINI_API_KEY` em `VITE_*` nem no GitHub.

## V17 · Correção HTTP 400 Gemini

O GET `diagnostic:ready` apenas confirma que as variáveis foram reconhecidas; não testa a API do Google. A função agora usa `generationConfig.responseJsonSchema`, que aceita JSON Schema, em vez de `responseSchema`, que usa o dialeto Gemini mais restrito. Em HTTP 400 (exceto chave explicitamente inválida), há uma segunda tentativa com `responseMimeType: application/json` sem esquema, validada integralmente no servidor antes de inserir qualquer peça. Falhas devolvem `diagnostic` e `providerStatus` sem divulgar API keys, prompts, respostas ou erros crus do provedor. HTTP 429/5xx não acionam OpenAI paga nem inserem automaticamente templates locais. Depois de publicar, atualize a página e tente novamente com o mesmo código de acesso.
