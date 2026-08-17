# Sprint — Portal do cliente com acesso estável (rebase na main atual)

## Identificação

- Nome / ID: Client portal stable access (current main)
- Branch: `fix/client-portal-stable-access-current-main`
- SHA-base: `487b35e7a598988e437ef62a230cff95ca6d5bac` (`origin/main`)
- Data: 2026-08-17

## Estado

- [x] AUTORIZADA
- [ ] ENTREGUE

Correção operacional autorizada nesta tarefa. Não mergear `main`. Não promover PRD.

## Objetivo

Um acesso ativo ao portal do cliente deve ter URL estável e copiável após reload, logout/login e outra sessão, sem gravar o bearer em plaintext. Copiar e WhatsApp não rotacionam o link.

## Escopo

- Token HMAC versionado `v1.{access_id}.{mac}` reconstruído no GET
- Compatibilidade com `token_hash` legado
- Card moderno, copiar com fallback, WhatsApp com URL, abrir portal
- Rotação explícita e revogação
- `CLIENT_PORTAL_SIGNING_KEY` documental em `.env.example`; obrigatória em HML/PRD
- Testes e relatório

## Fora do escopo

- Merge em `main`
- Promote / PRD
- Migrations novas
- Gateway, GCal, WhatsApp API
- Reintroduzir arquivos da branch antiga (`feature/billing-asaas-hosted`)

## Relatório

[`../reports/REPORT_CLIENT_PORTAL_STABLE_ACCESS_CURRENT_MAIN.md`](../reports/REPORT_CLIENT_PORTAL_STABLE_ACCESS_CURRENT_MAIN.md)
