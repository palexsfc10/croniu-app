# Sprint 2D — Relatório de entrega

**Data:** 2026-07-24  
**Branch:** `feature/sprint-2d-my-cycle-renewal`  
**SHA-base:** `3ee9248cdfd8c577aa7453c90ade250f8509c32b`

## Preflight

| Item | Valor |
|------|--------|
| Branch origem | `feature/sprint-2c1-cycle-financial-edit` @ `3ee9248` |
| Working tree | limpa |
| Migration anterior | `0006_sprint2c_cycle_intelligence` |
| Remoto | ausente |

## Decisões de domínio

| Tema | Decisão |
|------|---------|
| Acesso | Token opaco CSPRNG (≥256 bits); só hash no banco; um ativo por cliente |
| Renovação | Interesse apenas; sem ciclo/recebimento/compromisso automático |
| Pagamento | Pix/link https manual; “Já paguei” cria informe; profissional confirma |
| Comprovante | JPEG/PNG/WebP ≤5MB; storage local abstrato; download autenticado |
| Aulas restantes | Datas previstas futuras no TZ da org; sem presença |
| Prioridade Hoje | Após ciclo encerrando: renovação solicitada → pagamento informado |

## Threat model (resumo)

Bearer link = segredo compartilhável. Mitigações: hash, revogação, rotação, `no-store`/`noindex`, rate limit in-process, erros uniformes 404, prova sem URL pública, Pix só se habilitado pelo profissional. Residuais: rate limit não distribuído; link em logs de proxy/referrer se mal compartilhado; storage local sem backup de produção.

## Models / migration

`0007_sprint2d_my_cycle`: `client_public_accesses`, `organization_payment_settings`, `renewal_requests`, `payment_reports`, `payment_proofs`.

## Endpoints

**Auth:** public-access CRUD/rotate; payment-settings; renewal-requests (+acknowledge/resolve/dismiss/prepare); payment-reports (+confirm/reject/proof).

**Público:** `GET/POST /api/v1/public/my-cycle/{token}` (+renewal, +payment-report multipart).

## Gates

| Gate | Resultado |
|------|-----------|
| Ruff | OK |
| Pytest | **79 passed** |
| Migration up/down/re-up | OK → `0007` |
| Web lint/typecheck/vitest/build | OK (**20** testes) |
| Admin lint/typecheck/vitest/build | OK |
| E2E `sprint2d.spec.ts` | **3 passed** |
| Secrets / proofs gitignored | OK |

### E2E cenários

1. Criar link + abrir portal (estado vazio seguro).  
2. Renovação idempotente + já paguei + confirmação profissional + portal “confirmado”.  
3. Rotação invalida token anterior.

## Pendências

Gateway · WhatsApp API · object storage produção · rate limit distribuído · login do cliente · métricas admin detalhadas (não essenciais).
