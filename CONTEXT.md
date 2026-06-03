# CONTEXT — Glossário de domínio (ArchTime)

Glossário canônico do ArchTime. Só termos de domínio e sua definição precisa — sem detalhes de
implementação. Quando um termo for resolvido/afinado, atualize aqui.

## Termos

- **Sessão (ClockEntry)** — um intervalo de trabalho com entrada (`clockIn`) e, ao fechar, saída
  (`clockOut`). Pode ser dividida em **segmentos** quando cruza a meia-noite (BRT). A sessão é a
  unidade que tem hash de auditoria e tipo de atividade. Não confundir com **segmento**.

- **Segmento** — a fatia de uma Sessão que cai em um único dia local (BRT). O Histórico lista
  segmentos (uma sessão que cruza a meia-noite vira 2 segmentos), não sessões cruas. Totais do mês
  somam segmentos.

- **Atividade (activityType)** — categoria opcional do *trabalho* feito numa Sessão (visita cliente,
  modelagem 3D, prancha, reunião, obra, administrativo, estudo). Uma Sessão tem **no máximo uma**
  atividade; pode ser nula. É distinta do **Projeto**: Projeto = *para quem/o quê* (cliente/obra);
  Atividade = *que tipo de trabalho*. Lista fixa (não customizável pelo usuário nesta fase).

- **Projeto** — o trabalho faturável a que uma Sessão é alocada, via **TimeAllocation**. Uma Sessão
  hoje tem no máximo uma alocação (um projeto). Tem cliente, cor e valor/hora opcionais.

- **Nota (notes)** — texto livre opcional anexado a uma Sessão (ex.: "revisão com o cliente sobre a
  fachada"). Complementa a Atividade (categoria) com detalhe específico.

- **Insight** — leitura derivada e somente-visual sobre as Sessões do usuário: **Tendência**
  (semana atual vs. anterior), **Distribuição** (horas por Projeto no mês), **Heatmap** e **Barras
  semanais**. Insight nunca é fonte de verdade — sempre derivado das Sessões.

- **Heatmap** — visualização estilo GitHub: dias como células, intensidade da cor = horas
  trabalhadas no dia (5 níveis). Mostra padrões ao longo de semanas.

- **Barras semanais** — 7 barras (seg→dom) com horas por dia comparadas à **meta diária**.

- **Meta diária** — minutos previstos de trabalho para um dia da semana específico, derivados de
  `workMinutesByWeekday` do usuário (cada dia pode ter meta diferente; ex.: sábado = 0).

- **Command palette** — sobreposição de busca de ações (`⌘K`/`Ctrl+K`) para bater ponto, navegar e
  ajustar aparência sem o mouse. As **Ações** são contextuais ao estado do clock (mostra "Registrar
  saída" quando há Sessão aberta).

- **Bater ponto** — registrar entrada/saída (clock in/out). É a ação crítica do app; a tecla `B` e a
  palette a disparam. Fora do Ponto, a ação navega ao Ponto e então registra.
