# Relatório — persistência da preparação e consistência de estado

**SHA:** a ser preenchido no commit desta rodada.  
**PR:** #12 `feature/client-intake-journey`  
**Migration:** nenhuma.

## Diagnóstico

| Etapa | Persistido antes | UI | Defeito |
|---|---|---|---|
| Anamnese | approve gravava `done` | badge Concluído **e** “Marcar como analisada” sempre visível | ação não depende do status |
| Avaliação / plano / rotina | **somente React** `setChecklist` | “Não se aplica” some no reload | sem PATCH |
| Ciclo | entidade em `cycles` | preparação lia só o JSON local default `todo` | pedia criar de novo |
| Agenda | aulas no banco | checklist `todo` | não consultava appointments |
| Próxima ação | `prepare_accompaniment` estático no approve | ficha não recalcula | duas fontes |

Causa raiz única: **o checklist da tela Preparar não era fonte de verdade no banco**. `mark()` só mutava estado local. A ficha lia ciclos reais; a preparação não.

## Correção

- `PATCH /clients/{id}/journey/accompaniment-step` persiste `todo|done|later|na`.
- `GET /journey` devolve checklist **resolvido**: ciclo/agenda/avaliações/planos reais sobrescrevem `todo`; `na`/`later` explícitos sobrevivem.
- Anamnese: botão só se pendente; `anamnesis_reviewed_at` idempotente.
- Approve deixa de marcar anamnese como concluída automaticamente.
- Próxima ação derivada da primeira etapa `todo` (depois `later`).
- UX: lista compacta; uma ação primária; sheet para N/A e adiar.
- Ciclos: segmented Em andamento / Próximos / Encerrados; período em painel; CTA numa linha.
- Abas da ficha: colunas 1 / 1.25 / 1, pill encaixada.

## Revisão do PATCH (esta rodada)

- Auth: `get_current_auth`; `organization_id` só da sessão.
- Payload: `AccompanimentStepIn` com `extra=forbid` (`step`, `status`).
- Etapas e estados validados no serviço; 422 `invalid_step` / `invalid_status`.
- Cliente de outro tenant: 404 (mesmo contrato de GET cliente).
- Sem auth: 401/403.
- Idempotência anamnese: `anamnesis_reviewed_at` só na primeira conclusão; sem evento de timeline extra.
- JSONB: `flag_modified`; persistência só da decisão do PATCH (GET resolve entidades).
- Sem logs no resolvedor (sem PII).

Precedência: entidade real > `na` > `later` > `done` explícito > `todo`.

Atomicidade: conflito `SCHEDULE_CONFLICT` 409 sem ciclo/recebível/aulas; mesma key continua retryable.

Não implantado nesta mensagem. Exige CI verde, backup, recreate api+web. Sem merge/PRD/Promote.

## Veredito pretendido (após smoke HML)

STATE PERSISTENCE RESTORED — DATABASE AND API AS SINGLE SOURCE OF TRUTH — NO COMPLETED STEP REAPPEARS — NOT APPLICABLE AND DEFERRED DECISIONS SURVIVE RELOAD — EXISTING CYCLE RECOGNIZED EVERYWHERE — NEXT ACTION CONSISTENT — PREPARATION UX SIMPLIFIED — CYCLES SCREEN REDESIGNED
