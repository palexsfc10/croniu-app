# Croniu — Decisões (ADRs e produto)

Cada decisão: contexto · decisão · consequência · status · data (se conhecida) · evidência.

---

## ADR-001 — Next.js em vez de Vite SPA

| | |
|--|--|
| Status | Aceito |
| Contexto | App mobile-first, PWA, páginas públicas futuras |
| Decisão | Next.js App Router |
| Consequência | Domínio permanece no FastAPI; sem Route Handlers como 2º backend |
| Evidência | `apps/web`, `apps/admin` |

## ADR-002 — PWA em vez de app nativo

| | |
|--|--|
| Status | Aceito |
| Decisão | PWA instalável |
| Consequência | Push/capabilities nativas = evolução |

## ADR-003 — FastAPI como fonte de regras

| | |
|--|--|
| Status | Aceito |
| Decisão | FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL |
| Consequência | Dois runtimes no monorepo |

## ADR-004 — Autenticação por sessão cookie

| | |
|--|--|
| Status | Aceito |
| Decisão | Argon2id + sessão opaca + HttpOnly; sem localStorage |
| Pendência | CSRF dual-token; rate limit |
| Data | Fundação |

## ADR-005 — Multi-tenant por organização

| | |
|--|--|
| Status | Aceito |
| Decisão | `organization_id` da sessão; testes cruzados |
| Consequência | Disciplina em todo serviço |

## ADR-006 — Link público Meu Ciclo

| | |
|--|--|
| Status | Aceito · **implementado** (Sprint 2D) |
| Decisão | Token alta entropia (urlsafe ≥256 bits) + SHA-256; um ativo por cliente; revogação/rotação; rate limit in-process; `no-store`/`noindex` |
| Evidência | `client_public_accesses`; `/c/{token}`; `0007_sprint2d_my_cycle` |

## ADR-027 — Renovação via Meu Ciclo = interesse apenas

| | |
|--|--|
| Status | Aceito |
| Data | 2026-07-24 |
| Decisão | `renewal_requests` com status requested/acknowledged/resolved/dismissed; não cria ciclo/recebimento/compromisso; “Preparar renovação” só pré-preenche o fluxo existente |

## ADR-028 — Informe de pagamento separado do recebimento

| | |
|--|--|
| Status | Aceito |
| Data | 2026-07-24 |
| Decisão | `payment_reports` (pending_review/confirmed/rejected); “Já paguei” não marca receivable; confirmação profissional marca `received` na mesma transação |

## ADR-029 — Comprovante opcional com storage abstrato

| | |
|--|--|
| Status | Aceito |
| Data | 2026-07-24 |
| Decisão | JPEG/PNG/WebP ≤5MB; validação por assinatura; chave aleatória; download autenticado `Content-Disposition: attachment`; local `PROOF_STORAGE_DIR` (não versionado) |

## ADR-030 — Aulas previstas restantes

| | |
|--|--|
| Status | **Supersedido** por ADR-031 |
| Data | 2026-07-24 |
| Decisão | Contagem de datas enumeradas do ciclo com `date >= hoje_org` em `[starts_on, ends_on)`; sem usar presença/cancelamento de compromissos |

## ADR-031 — Aulas realizadas / restantes por presença

| | |
|--|--|
| Status | Aceito |
| Data | 2026-07-25 |
| Decisão | Compromisso `completed` ou `no_show` encerra a aula e consome 1 do saldo do ciclo (`lessons_completed` / `lessons_remaining = lesson_count − completed`). `cancelled` não consome. Se o compromisso não tiver `cycle_id`, vincula ao único ciclo ativo do cliente na data da aula. |

## ADR-007 — Monorepositório

| | |
|--|--|
| Status | Aceito |
| Decisão | Monorepo simples sem Nx nesta fase |

## ADR-008 — HML antes de produção

| | |
|--|--|
| Status | Aceito |
| Decisão | Artefatos `deploy/hml`; Jarvis separado; produção fora até autorização |
| Nota | Domínio pendente; HML não implantada na linha 2A/2A.1 |

## ADR-009 — React Hook Form + Zod

| | |
|--|--|
| Status | Aceito |

## ADR-010 — Vitest + Playwright

| | |
|--|--|
| Status | Aceito |

## ADR-011 — Identidade admin da plataforma

| | |
|--|--|
| Status | Aceito |
| Decisão | `platform_memberships` + cookie admin separado + CLI bootstrap |
| Rejeitado | `users.is_admin` |

## ADR-012 — App admin separado

| | |
|--|--|
| Status | Aceito |
| Decisão | `apps/admin` deploy distinto |
| Host planejado | `admin.croniu.com.br` (não confirmado) |

## ADR-013 — Wordmark BrandWordmark

| | |
|--|--|
| Status | Aceito + **homologado** (produto) |
| Decisão | `Cron` negrito + `iu` primária |
| Consequência | Não redesenhar sem nova homologação |

## ADR-014 — Produto independente do Kyvora

| | |
|--|--|
| Status | Aceito |
| Decisão | Zero acoplamento de código/runtime |

## ADR-015 — Nomenclatura de domínio neutra

| | |
|--|--|
| Status | Aceito |
| Decisão | `Client`/`Cycle`/…; rótulos UI adaptáveis depois |

## ADR-016 — Ciclo separado de recebimento e renovação

| | |
|--|--|
| Status | Aceito |
| Evidência | Modelos e serviços 2A |

## ADR-017 — WhatsApp manual no MVP

| | |
|--|--|
| Status | Aceito |
| Decisão | `wa.me` + confirmação manual; sem API oficial |
| Consequência | Envio automático `FORA_DO_ESCOPO` |

## ADR-018 — Google Calendar opcional

| | |
|--|--|
| Status | Aceito (planejado) |
| Decisão | 1ª versão somente leitura; Croniu funciona sem integração |

## ADR-019 — Domínio público pendente

| | |
|--|--|
| Status | `PENDENTE_DE_DECISAO` |
| Decisão | Não afirmar aquisição; hosts só planejamento |

## ADR-020 — Timezone da organização

| | |
|--|--|
| Status | Aceito · implementado (Sprint 2B) |
| Data | 2026-07-24 |
| Contexto | Datas de ciclos/agenda precisam de fuso explícito |
| Decisão | Cada organização terá timezone IANA; default `America/Sao_Paulo`; instantes em UTC; UI no fuso da org |
| Consequência | `organizations.timezone` em `0005_sprint2b_agenda`; preferências em Mais |

## ADR-021 — Vocabulário de recebimentos

| | |
|--|--|
| Status | Aceito (alvo; código ainda diverge) |
| Data | 2026-07-24 |
| Decisão | Persistidos: `pending`, `paid`, `cancelled`; `overdue` calculado; “expected” não compete com `pending` |
| Divergência atual | Código usa `received` e referencia `expected` em queries — **não normalizado na 2B** (mantido registrado) |

## ADR-022 — Escopo da Sprint 2B

| | |
|--|--|
| Status | Aceito · **AUTORIZADA** · entregue local |
| Data | 2026-07-24 |
| Decisão | Locais, compromisso único, Agenda, timezone org, conflitos básicos, integração Hoje/nav |
| Fora | Recorrência, Google Calendar, Meu Ciclo, sync, WhatsApp automático |
| Evidência | `docs/sprints/SPRINT_2B.md`; `docs/reports/SPRINT_2B_REPORT.md` |

## ADR-024 — Edição de ciclo sem sync de agenda (Sprint 2C)

| | |
|--|--|
| Status | Aceito (MVP 2C) · UI financeira 2C.1 |
| Data | 2026-07-24 |
| Contexto | Recalcular aulas pode divergir de compromissos já criados/realizados |
| Decisão | Edição inteligente/financeira atualiza contrato/financeiro e recebimento `pending`; **não** altera compromissos existentes |
| Consequência | Sync futura de agenda = sprint autorizada; UI avisa (“Agenda permanecerá igual”) |

## ADR-026 — Edição financeira na UI e bloqueio se pago (Sprint 2C.1)

| | |
|--|--|
| Status | Aceito · reforçado (auditoria de bypass entre rotas) |
| Data | 2026-07-24 |
| Decisão | Fluxo dedicado `PATCH /cycles/{id}/financial` + página “Editar valores”; desconto XOR valor final; snapshot unitário imutável; se recebimento `received`/`paid` → 409 `payment_confirmed` com mensagem clara; sem auto-criar recebimento ausente |
| Reforço | Política compartilhada `_guard_financial_outcome_mutation` / `_reject_snapshot_mutation` / `_apply_financial_composition` / `_sync_pending_receivable` — cobre também recálculo estrutural via `PATCH /intelligent` (antes: bypass se pago + `starts_on`/`weekdays` sem ajuste/final). Schemas de update com `extra="forbid"`. |
| Evidência | `docs/sprints/SPRINT_2C_1_FINANCIAL_EDIT.md`; `docs/reports/SPRINT_2C_1_REPORT.md`; `test_cycle_financial_invariants.py` |

## ADR-025 — `calendar_months` ≠ `fixed_days`

| | |
|--|--|
| Status | Aceito |
| Data | 2026-07-24 |
| Decisão | Renovação por meses de calendário (dia clampado) é distinta de N dias corridos; UI usa “1 mês” vs “30 dias” |

## ADR-023 — Conflito de horário: bloqueio sem override

| | |
|--|--|
| Status | Aceito (MVP) · override = `PENDENTE_DE_DECISAO` |
| Data | 2026-07-24 |
| Contexto | Sobreposição de compromissos ativos na mesma organização |
| Decisão | Backend bloqueia com HTTP 409 `appointment_conflict` + detalhes estruturados; frontend exibe e força correção |
| Não fazer | Override silencioso; confirmação de força sem registro documental |
| Intervalo | Half-open `[starts_at, ends_at)`; consecutivos permitidos |

## ADR-032 — Avaliações de evolução do cliente

| | |
|--|--|
| Status | Aceito · implementado |
| Data | 2026-08-02 |
| Decisão | Entidades relacionais `client_evaluations` + `client_evaluation_criteria`; status `draft`/`published`/`archived`; `private_notes` nunca serializado em endpoints públicos; portal Meu Ciclo lista só publicadas; sem média automática no portal; sem timeline paralela improvisada (ponto de extensão futuro) |
| Evidência | migration `0008_client_evaluations`; `/api/v1/clients/{id}/evaluations*`; seção no detalhe do cliente e em `/c/{token}` |

## ADR-033 — Fundação do agente LLM

| | |
|--|--|
| Status | Aceito · fundação |
| Data | 2026-08-02 |
| Decisão | Agente atrás de `AI_ENABLED=false` por padrão; abstração de provedor (`fake` / `openai_compatible` via HTTP); ferramentas allowlisted chamando serviços de aplicação; mutações via `agent_pending_actions` com confirmação explícita, expiração e anti-replay; auditoria em `agent_audit_logs`; tenant sempre da sessão |
| Não fazer nesta fundação | SQL pela LLM; pagamentos; publicar avaliação; exclusões; voz; billing completo |
| Evidência | `backend/app/agent/*`; migration `0009_agent_foundation`; UI `/app/assistant` |
