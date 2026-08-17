# Croniu — Estratégia de testes

Alinhada ao código pós-Sprint 2C.1. Matriz: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) §9.

## Pirâmide

```mermaid
flowchart TB
  E2E[E2E Playwright - fluxos críticos]
  INT[pytest API - domínio e tenant]
  UNIT[Vitest - componentes e forms]
  UNIT --> INT --> E2E
```

1. **Unitário/UI** — Vitest + Testing Library (web/admin)  
2. **API/integração** — pytest (auth, platform, domínio 2A + agenda 2B + ciclo 2C/2C.1)  
3. **E2E** — Playwright (auth + Sprint 2A + 2B + 2C + 2C.1)  
4. **Visual/manual** — artefatos + homologação de identidade  
5. **HML smokes** — quando HML existir e for autorizada  

## Backend (pytest)

Arquivos: … `test_cycle_financial_invariants.py`, `test_my_cycle_sprint2d.py`.

| Área | Regras cobertas (exemplos) |
|------|----------------------------|
| Meu Ciclo 2D | token hash legado + HMAC `v1`; revogação; portal mínimo; renovação idempotente; Pix https; informe; comprovante; confirmação; tenant |

Mapear sempre aos IDs `FR-*` / `NFR-*`.

## Frontend web (Vitest)

Componentes, formulários auth, empty states, nav 5 itens, a11y básica.

## Frontend admin (Vitest)

Login / acesso negado.

## E2E

- Fundação: cadastro → painel; logout; anônimo bloqueado  
- Sprint 2A: fluxo domínio + artefatos em `apps/web/e2e/artifacts/sprint2a/`  
- Sprint 2C: serviço → modelo → ciclo inteligente + desconto (`e2e/sprint2c.spec.ts`)  
- Sprint 2C.1: edição financeira UI + bloqueio pago + isolamento (`e2e/sprint2c1.spec.ts`, 3 cenários)  
- Sprint 2D: link Meu Ciclo + renovação/pagamento + rotação (`e2e/sprint2d.spec.ts`, 3 cenários)
- Portal estável: GET reconstrói URL; copiar/WhatsApp; rotacionar/revogar (`e2e/client-portal-access.spec.ts`)  
- Admin E2E: especificado; executar quando ambiente disponível  

## Multi-tenancy

Obrigatório em toda sprint que toque dados de negócio (locais e compromissos inclusos).

## Migrations

Validar head Alembic (`0005_sprint2b_agenda`) nos gates; testes usam DB de teste conforme `conftest`.

## Visual / acessibilidade / PWA

- Visual: screenshots E2E + homologação manual do wordmark  
- A11y: checks básicos; auditoria profunda futura  
- PWA: manifest nos E2E; offline rico futuro  

## Integração futura / HML

Google Calendar, Meu Ciclo, smokes HML — só após sprint autorizada e ambiente.

## O que não testar agora

UI cosmético 100%; carga; módulos ainda `PLANEJADO` (GCal, recorrência, Meu Ciclo); mutações admin de agenda bloqueadas.
