# Sprint 2A.1 — Relatório de auditoria, baseline e especificação mestre

**Data:** 2026-07-24  
**Tipo:** documentação apenas — sem features, migrations, deploy ou git commit.

---

## Auditoria

| Item | Resultado |
|------|-----------|
| Branch | `master` |
| HEAD | *inexistente* (repositório sem commits) |
| Working tree | Monorepo completo untracked |
| Migration head | `0003_sprint2a_domain` |
| Módulos | Ver `PRODUCT_SPEC` §6–7 |
| Endpoints | auth, home, clients, services, cycles, receivables, platform, health |
| Páginas web | Hoje, clientes, serviços, ciclos, recebíveis, perfil + auth |
| Páginas admin | login, dashboard, orgs, users (leitura) |
| Testes backend | **21 passed** |
| Testes web | **11 passed** |
| Testes admin | **4 passed** |
| Gates 2A.1 | ver seção Gates |

---

## Documentação

### Criados

- `docs/README.md`
- `docs/PRODUCT_SPEC.md` (**fonte oficial**)
- `docs/PROJECT_STATE.md`
- `docs/WORKFLOW.md`
- `docs/sprints/README.md`, `TEMPLATE.md`, `SPRINT_2A.md`, `SPRINT_2B_DRAFT.md`
- `docs/reports/README.md`
- `docs/reports/SPRINT_2A_1_AUDIT.md` (este)
- `AGENTS.md` (raiz)
- `.cursor/rules/croniu-docs.mdc`

### Atualizados

- `DOMAIN_RULES.md`, `ARCHITECTURE.md`, `UX_UI.md`, `SECURITY.md`, `TEST_STRATEGY.md`, `ROADMAP.md`, `DECISIONS.md`
- Banners em `VISION.md`, `PRD.md`

### Preservados

- `docs/SPRINT_2A_REPORT.md` (path histórico)
- `PLATFORM_ADMIN.md`
- Artefatos E2E e código de produto (sem alteração funcional intencional)

### Fonte oficial

**`docs/PRODUCT_SPEC.md`**

---

## Rastreabilidade (resumo)

| Estado | Exemplos |
|--------|----------|
| `IMPLEMENTADO` | Auth, tenant, clientes, ciclo period, recebimento manual, WA prep, Hoje, wordmark |
| `PARCIAL` | Serviços (UI edit), alertas, barra contextual, admin, PWA |
| `PLANEJADO` | Agenda, locais, Meu Ciclo, GCal RO, HML implantada, session/hybrid |
| `FUTURO` | Pagamento parcial, sync bidirecional, billing, push, WA oficial |
| `FORA_DO_ESCOPO` | Envio automático WA no MVP |
| `PENDENTE_DE_DECISAO` | Domínio/DNS; timezone org formal |

IDs: `PRODUCT_SPEC.md` §9.

---

## Divergências registradas

1. **Git:** relatório 2A e estado real — sem commits.  
2. **VISION/PRD:** texto de “só fundação” desatualizado → banners + PRODUCT_SPEC.  
3. **DOMAIN_RULES antigo:** ciclos como “futuro” / pause — corrigido para refletir código.  
4. **Nav:** UX planejava Agenda; real = Hoje/Clientes/Ciclos/Mais.  
5. **Receivable `expected`:** aparece em query; criação usa `pending`.  
6. **Admin:** métricas reais mas mutações bloqueadas (`PARCIAL`).  
7. **CSRF / rate limit:** documentados como planejados, não implementados.  
8. **Warning ESLint** RHF `watch` em `cycles/new` — registrado, não corrigido nesta sprint.

Nenhuma divergência foi “escondida” alterando código de produto.

---

## Regras para agentes

| Artefato | Função |
|----------|--------|
| `AGENTS.md` | Operacional, curto |
| `.cursor/rules/croniu-docs.mdc` | `alwaysApply` → aponta docs |
| Ordem de leitura | AGENTS → docs/README → PRODUCT_SPEC → PROJECT_STATE → sprint autorizada |
| Sprint autorizada | **Nenhuma** de feature; 2B draft = NÃO AUTORIZADA |

---

## Gates (execução na auditoria)

| Comando / suite | Resultado |
|-----------------|-----------|
| `alembic current` | `0003_sprint2a_domain (head)` |
| `ruff check` (backend) | OK |
| `pytest` (backend) | **21 passed**, 1 warning Starlette/httpx |
| `npm run lint` (web) | OK (1 warning RHF) |
| `npm run typecheck` (web) | OK |
| `npm run test` (web) | **11 passed** |
| `npm run lint/typecheck/test` (admin) | OK / **4 passed** |

Builds completos web/admin: executados na entrega 2A; nesta 2A.1 priorizou-se lint/typecheck/test + alembic/ruff/pytest. Reexecução de `build` opcional se necessário — documentação não altera runtime de app.

*Se build não foi reexecutado nesta sessão, registrar como verificação parcial de regressão documental (docs-only).*

---

## Próximas decisões (opções — sem implementar)

1. **Commit inicial** do monorepo (sem `.env`) — sim/não e o que incluir.  
2. **Escopo da 2B:** só agenda interna vs agenda + locais vs GCal em sprint própria.  
3. **Meu Ciclo:** sprint própria antes ou depois da agenda.  
4. **Domínio:** adquirir `croniu.com.br` (ou outro) e hosts.  
5. **Timezone da organização:** campo explícito vs UTC fixo.  
6. **Status `expected` vs `pending`:** unificar no domínio.  
7. **Quando implantar HML** no Jarvis.

---

## Próxima sprint recomendada (não iniciar)

**Sprint 2B enxuta — Agenda interna mínima:** locais + compromisso único + listagem do dia + slot Agenda na nav — **sem** Google Calendar e **sem** Meu Ciclo na mesma entrega.

Marcar `AUTORIZADA` apenas após decisão explícita do responsável.
