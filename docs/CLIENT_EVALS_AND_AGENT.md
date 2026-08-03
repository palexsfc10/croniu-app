# Avaliações do cliente e fundação do agente

## Avaliações / evolução

Funcionalidade genérica de acompanhamento (não específica de academia): o profissional registra avaliações periódicas com título, período, resumo, conquistas, pontos de atenção, próximos objetivos, mensagem ao cliente, notas privadas e critérios opcionais (escala configurável, tipicamente 1–5).

### Visibilidade

| Campo | Profissional | Portal do cliente |
|-------|--------------|-------------------|
| Conteúdo público (título, resumo, critérios, conquistas, atenção, objetivos, mensagem) | sim | só se `published` |
| `private_notes` | sim | **nunca** |
| ids internos / admin | sim | não |
| rascunhos | sim | não |

Publicação registra `published_at`. Voltar a rascunho remove do portal. Arquivamento remove do histórico ativo (soft).

### API (autenticada)

- `GET/POST /api/v1/clients/{client_id}/evaluations`
- `GET/PATCH /api/v1/evaluations/{id}`
- `POST /api/v1/evaluations/{id}/publish|unpublish|archive`

Portal: avaliações publicadas embutidas em `GET /api/v1/public/my-cycle/{token}` → `evaluations[]` (schema público).

### Migration

- `0008_client_evaluations` (reversível)

### Extensão timeline

Não há entidade de marcos consolidada. Avaliações ficam como seção própria; futura timeline pode referenciar `client_evaluations.id` sem duplicar domínio.

## Agente LLM (fundação)

Fluxo: usuário autenticado → `/api/v1/agent/chat` → orquestrador → provedor LLM → ferramentas allowlisted → serviços de aplicação → resposta (e `pending_action` se escrita).

### Variáveis

Ver `.env.example`: `AI_ENABLED`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_API_BASE`, timeouts, limites, custos estimados.

### Ferramentas iniciais

**Leitura:** `list_today_appointments`, `list_ending_cycles`, `list_pending_receivables`, `find_client`, `list_recent_published_evaluations`.

**Escrita (confirmação obrigatória):** `propose_create_evaluation_draft` → pending → confirm/cancel.

### Segurança

- Tenant só da sessão; allowlist; sem SQL/shell/URL arbitrária; argumentos validados; conteúdo de cliente tratado como dado.
- Testes usam `FakeLLMProvider` — sem créditos reais.

### Limitações atuais

IA off por padrão; uma mutação controlada; sem voz (contrato `input_modality` preparado); sem notificações; métricas mínimas in-process.

### Próximos passos

Voz (transcrição → mesmo chat); mais tools com confirmação forte; notificações; timeline; rate limit distribuído.

## Testes

```bash
cd backend
.venv/Scripts/python.exe -m pytest tests/test_client_evaluations.py tests/test_agent_foundation.py -q

cd ../apps/web
npm test -- --run src/components/app/evaluation-editor.test.tsx src/components/app/client-evaluations-section.test.tsx src/app/c/[token]/page.test.tsx
```
