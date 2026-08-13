# Sprint — Jornada de intake do cliente (anamnese + protocolo)

## Identificação

- Nome / ID: `CLIENT_INTAKE_JOURNEY`
- Branch: `feature/client-intake-journey`
- Autor: CTO executor (autorização explícita na tarefa)
- Data de criação: 2026-08-13
- SHA-base: `4a7ee03` (main pós-RC2.9 / PR #11)

## Estado

- [x] AUTORIZADA  
- [ ] EM_ANDAMENTO  
- [ ] ENTREGUE  

> Sem `AUTORIZADA`, agentes **não** implementam. Esta sprint está **AUTORIZADA**.

## Objetivo

Implementar a jornada operacional do aluno: link permanente de cadastro da organização, submissão pública com anamnese e consentimentos, fila de revisão profissional, decisões de avaliação/protocolo, protocolos versionados, rotinas recorrentes e contadores no Hoje — sem diagnosticar, sem expor PII em logs e sem confiar em `organization_id` do cliente.

## Contexto

Baseada na main atual (`4a7ee03`). Reutiliza portal `client_public_accesses` (hash SHA-256), avaliações existentes e `build_home_summary`. Não altera Asaas, OpenAI, DNS, Cloudflare, Promote ou PRD.

## Escopo

### Backend (esta entrega)

- Migration `0019_client_intake_journey`
- Modelos: links de intake, jornadas, submissões, anamnese, consentimentos, protocolos, rotinas
- Máquina de estados da jornada + template padrão de anamnese
- APIs autenticadas (link, fila, decisões, protocolos, rotinas)
- APIs públicas (contexto, submit, status do portal pré/pós aprovação)
- Extensão do HomeSummary com contadores de intake
- Agregados mínimos de platform (sem respostas de saúde)
- Testes backend

### Frontend / HML

- Fora do escopo **desta** entrega de backend; HML-only deploy autorizado pelo operador **após** validação da API.

## Fora do escopo

- OpenAI / agente LLM para anamnese  
- Asaas / billing / DNS / Cloudflare / Promote / PRD  
- Produção (deploy PRD)  
- Fluxo de menor com responsável legal  
- UI web completa (entrega separada)  
- Gateway WhatsApp API / GCal  

## Migrations

- [x] Sim — id: `0019_client_intake_journey`  
  Justificativa: novas tabelas de domínio (intake, jornada, anamnese, consentimento, protocolo, rotinas).

## Segurança

- Token de intake e portal: raw só na criação/rotação/submit; DB guarda hash  
- Tenant resolvido **somente** pelo token (público) ou sessão (profissional)  
- Respostas de saúde: nunca em logs; platform só agregados  
- Rate limit nas rotas públicas  
- Bloqueio de menor de 18 no MVP  
- Mensagens de atenção sem linguagem de diagnóstico  

## Testes

- Backend: `backend/tests/test_intake_journey.py`  
- Gates: pytest no arquivo novo + regressão HomeSummary se aplicável  

## Critérios de aceite

- [ ] Link create/rotate/disable; token antigo inválido  
- [ ] Submit idempotente; bloqueio &lt;18; alerta de duplicata same-org  
- [ ] Cross-tenant: org id no payload ignorado  
- [ ] Approve/reject e portal status safe  
- [ ] Protocol publish versionado; portal sem private_notes  
- [ ] Hash-only no DB; erro genérico para token inválido  

## Rollback

- `alembic downgrade -1` (drop das tabelas 0019)  
- Remover routers novos de `main.py` se necessário  

## Relatório

Path previsto: `docs/sprints/REPORT_CLIENT_INTAKE_JOURNEY.md` (após entrega).

## Autorização

| Campo | Valor |
|-------|-------|
| Autorizado por | Operador / CTO (tarefa explícita 2026-08-13) |
| Data | 2026-08-13 |
| Deploy HML | **Autorizado somente HML** após gates verdes; **proibido** Promote/PRD nesta sprint |
| Notas | Branch isolada `feature/client-intake-journey`. Não misturar com PRs de RC abertos. |
