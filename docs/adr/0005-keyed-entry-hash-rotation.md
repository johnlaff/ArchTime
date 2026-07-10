# ADR 0005 — Keyring identificado para HMAC de Sessão

**Data:** 2026-07-10 · **Status:** Aceito

## Contexto

Cada Sessão fechada carrega um HMAC-SHA256 dos seus campos de integridade. O formato anterior,
`hmac-v1:<digest>`, identificava o algoritmo, mas não a chave. Quando a chave foi perdida, a única
forma de restaurar verificabilidade foi recomputar os hashes históricos — uma operação mutante,
arriscada e inadequada como procedimento rotineiro de rotação.

## Decisão

- Novos hashes usam `hmac-v1:<keyId>:<digest>`.
- Hashes históricos sem `keyId` continuam válidos e usam a chave indicada por
  `ENTRY_HASH_LEGACY_KEY_ID`.
- O keyring é configurado por App Service settings: `ENTRY_HASH_KEY_IDS`,
  `ENTRY_HASH_ACTIVE_KEY_ID`, `ENTRY_HASH_LEGACY_KEY_ID` e uma
  `ENTRY_HASH_SECRET_<KEY_ID>` para cada identificador. O formato do identificador é minúsculo
  com segmentos alfanuméricos separados por hífen.
- O bootstrap de produção usa `k2026-07` para representar a chave já existente. A implantação
  mantém `ENTRY_HASH_SECRET` durante a janela de rollback; o novo código lê o keyring depois que
  ele estiver configurado.
- A instrumentação valida o keyring completo no boot. Configuração parcial, chave ausente ou
  segredo fora do formato canônico impede a instância de iniciar.
- `/api/integrity` distingue `malformed` (formato inválido), `mismatches` (evidência de
  adulteração) e `unverifiable` (o hash aponta para uma chave não mais presente no keyring).

## Rotação operacional

1. Adicionar o novo `keyId` e seu segredo ao keyring, mantendo a chave ativa atual.
2. Validar o boot e `/api/integrity` com ambas as chaves disponíveis.
3. Trocar somente `ENTRY_HASH_ACTIVE_KEY_ID` para a nova chave.
4. Reter as chaves antigas enquanto existirem hashes associados a elas; nunca re-hashar históricos
   apenas para uma rotação.

## Consequências

- A próxima rotação não altera `clock_entries`, `updated_at` nem a trilha de auditoria.
- Uma chave removida cedo aparece como indisponível, em vez de ser confundida com adulteração.
- O formato legado é mantido para compatibilidade até que a política de retenção permita sua
  remoção explícita.
- Azure Key Vault com Managed Identity é o destino de hardening recomendado para segredos, mas
  fica fora desta entrega: o App Service atual já usa settings de runtime e introduzir infraestrutura
  nova junto da migração de formato aumentaria o risco operacional. As variáveis por chave permitem
  migrar para referências de Key Vault sem mudar o código.
