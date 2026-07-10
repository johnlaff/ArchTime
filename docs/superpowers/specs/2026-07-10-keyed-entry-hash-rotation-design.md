# Especificação — rotação de HMAC por keyId

## Problem Statement

O hash de integridade de uma Sessão identifica o algoritmo, mas não a chave HMAC que o assinou. Quando uma chave é rotacionada ou perdida, o sistema não consegue saber qual segredo verifica cada registro histórico. Reescrever hashes para resolver isso altera dados reais e cria risco desnecessário.

## Solution

Acrescentar um `keyId` aos hashes novos e operar um keyring com chave ativa e chave legada. O formato histórico continua verificável por uma chave de legado configurada; a troca de chave passa a ser uma alteração de configuração, não uma mutação em `clock_entries`.

## User Stories

1. Como mantenedor, quero que cada nova Sessão fechada registre qual chave assinou seu HMAC para que futuras rotações não exijam re-hash.
2. Como usuária, quero que minhas Sessões históricas continuem íntegras depois de uma atualização de segurança para que meu Histórico não seja alterado.
3. Como mantenedor, quero manter mais de uma chave de verificação durante uma transição para que registros antigos e novos sejam validados simultaneamente.
4. Como mantenedor, quero escolher uma única chave ativa para assinaturas novas para que a rotação seja previsível.
5. Como mantenedor, quero que uma configuração de keyring parcial impeça o boot para que a falha seja percebida no deploy, não no primeiro clock-out.
6. Como mantenedor, quero que a verificação de integridade diferencie adulteração de uma chave removida para que a resposta operacional seja correta.
7. Como mantenedor, quero preservar o formato legado temporariamente para que o rollout seja reversível.
8. Como auditora, quero que a rotação não reescreva timestamps, Sessões ou AuditLogs para que a evidência histórica permaneça íntegra.
9. Como equipe de operação, quero um runbook de rotação com retenção de chaves antigas para que não haja perda acidental de verificabilidade.
10. Como usuária, quero que o clock-out continue funcionando durante a migração de formato para que a segurança não interrompa o controle de horas.

## Implementation Decisions

- Hashes novos usam algoritmo `hmac-v1`, `keyId` e digest; hashes sem `keyId` permanecem no formato legado.
- O keyring é composto por uma lista de IDs, uma chave ativa, uma chave de legado e um segredo por ID, todos em configuração de runtime.
- A chave de legado é obrigatória quando o keyring está ativo, pois há dados históricos sem identificador.
- O segredo existente é bootstrapado como `k2026-07`; a primeira entrega não troca o material secreto nem altera dados de produção.
- A verificação retorna estado distinto para chave desconhecida, hash malformado e hash divergente.
- O banco não recebe coluna, migration ou backfill: o identificador faz parte do valor já persistido do hash.
- Azure Key Vault é compatível como origem futura das mesmas settings, mas não é provisionado nesta entrega.

## Testing Decisions

- O seam criptográfico verifica geração com a chave ativa, validação de hashes legados e coexistência de duas chaves.
- O seam de rota verifica a resposta autenticada de integridade para hash válido, adulterado, nulo e com `keyId` indisponível.
- O E2E autenticado verifica que a produção, após a configuração do keyring, responde sem mismatch nem chave indisponível para as Sessões da conta de teste.
- O boot de desenvolvimento e produção é exercitado por testes de configuração e pelo build/preview da imagem.

## Out of Scope

- Re-hash ou atualização em massa de Sessões históricas.
- Alteração da tabela `clock_entries`.
- Exposição do `keyId` ou do hash na interface da usuária.
- Provisionamento de Azure Key Vault, Managed Identity ou uma política de descarte de chaves.

## Further Notes

O `keyId` resolve identificação e coexistência de chaves; ele não recupera uma chave já perdida. A retenção do segredo antigo continua sendo um requisito operacional para a cadeia histórica.
