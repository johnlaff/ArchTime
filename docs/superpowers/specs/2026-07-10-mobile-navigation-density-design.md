# Especificação — navegação e densidade mobile

## Problem Statement

Na visão mobile do ArchTime, o conteúdo do dashboard fica muito próximo da borda da tela, escondendo a malha arquitetônica de fundo. Os cartões de resumo de Hoje, Semana e Mês ocupam toda a largura e carregam espaçamento vertical herdado que deixa uma área vazia desproporcional ao conteúdo. O novo menu de navegação também parece lento ao abrir, mesmo sem travar funcionalmente.

## Solution

Em telas mobile, aumentar o recuo lateral do conteúdo de 16 px para 32 px, mantendo os breakpoints maiores inalterados. Compactar somente os três cartões de resumo para que tenham largura intrínseca e removam o padding/gap estrutural excedente no mobile. Acelerar exclusivamente a animação do drawer de navegação mobile, preservando a composição e a acessibilidade do Sheet existente.

## User Stories

1. Como arquiteta usando o PWA em um celular, quero mais área visível da malha atrás do conteúdo para que a tela não pareça colada na borda.
2. Como usuária mobile, quero que o recuo lateral continue consistente ao rolar entre as páginas autenticadas para que a navegação não pareça saltar.
3. Como usuária, quero que o cartão de Hoje tenha apenas o espaço necessário para seus dados para que eu identifique o resumo sem uma grande área vazia.
4. Como usuária, quero que os cartões de Semana e Mês sigam a mesma densidade do cartão de Hoje para que o resumo tenha ritmo visual coerente.
5. Como usuária, quero que os valores e rótulos completos continuem legíveis mesmo quando um saldo for maior que o habitual.
6. Como usuária com tema claro ou escuro, quero que os cartões compactos preservem contraste e os tokens de aparência para que a compactação não crie regressão visual.
7. Como usuária, quero que o menu hamburguer apareça rapidamente após o toque para que a navegação pareça responsiva.
8. Como usuária que navega por teclado ou leitor de tela, quero que o menu continue usando dialog, foco, rótulos e fechamento existentes para que a melhora visual não reduza acessibilidade.
9. Como usuária em tela desktop ou tablet, quero que a grade de resumo e os espaçamentos existentes não mudem para que a correção permaneça estritamente mobile.
10. Como mantenedora, quero E2E cobrindo a abertura do menu e a geometria mobile para que o feedback não regrida em mudanças futuras.

## Implementation Decisions

- O breakpoint mobile é o único alvo de mudança de layout; os breakpoints a partir de `sm` mantêm os valores atuais.
- O recuo lateral mobile passa a usar o próximo múltiplo de 4 px que dobra o valor atual: 32 px.
- Os cartões de resumo usam largura intrínseca e removem, somente no mobile, o padding e o gap estrutural herdados do componente Card. Seus filhos continuam responsáveis pelo espaçamento interno e preservam conteúdo completo.
- O menu permanece um Sheet do Radix/shadcn. A animação continua composta por transform e opacidade, com entrada de 200 ms e saída de 150 ms, em vez dos 500/300 ms herdados. O drawer usa `will-change: transform` somente enquanto está montado, para ajudar a composição em aparelhos menos potentes.
- Quando o sistema pede redução de movimento, o drawer e seu overlay abrem sem animação. A mudança é opt-in por preferência de acessibilidade e não altera a experiência normal em desktop ou mobile.
- A alteração não cria uma nova navegação, não muda as opções do menu e não altera tokens de cor ou o comportamento de tema.

## Testing Decisions

- O seam principal é o caminho do usuário no navegador mobile autenticado: abrir o menu, navegar por uma opção e confirmar a página de destino.
- O E2E verifica recuo lateral computado, ausência de overflow horizontal e que cada cartão de resumo mobile cabe no contêiner, sem rolagem interna nem padding estrutural vazio.
- O E2E cobre 390 px, 320 px e o breakpoint `sm`, para garantir que a correção continua estritamente mobile; em 320 px, também injeta saldos excepcionalmente longos para validar quebra de linha sem corte.
- O E2E verifica que a animação aberta do Sheet usa duração de no máximo 200 ms e que a preferência `prefers-reduced-motion` zera a animação do drawer e do overlay. A métrica de FPS não é estável em browser headless; composição e duração são a fronteira verificável.
- A suíte existente de visualização autenticada é usada como referência para os temas e a viewport de 390 px.

## Out of Scope

- Alterações de layout em desktop ou tablet.
- Novos itens, rotas ou estado para o menu.
- Troca de biblioteca de drawer, alterações de tema, ou redesenho do ActivityPanel.
- Alterações de dados de Sessão, fila offline ou API.

## Further Notes

O feedback da usuária é específico de tela pequena. A compactação é deliberada para os três resumos, que são métricas de leitura rápida, e não deve ser aplicada por padrão a todos os Cards do produto.
