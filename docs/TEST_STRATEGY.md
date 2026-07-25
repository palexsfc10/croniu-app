# Croniu — Estratégia de testes

Alinhada ao código pós-Sprint 2A. Matriz detalhada de requisitos: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) §9.

## Pirâmide

```mermaid
flowchart TB
  E2E[E2E Playwright - fluxos críticos]
  INT[pytest API - domínio e tenant]
  UNIT[Vitest - componentes e forms]
  UNIT --> INT --> E2E
```

1. **Unitário/UI** — Vitest + Testing Library (web/admin)  
2. **API/integração** — pytest (auth, platform, domínio 2A)  
3. **E2E** — Playwright (auth + Sprint 2A)  
4. **Visual/manual** — artefatos + homologação de identidade  
5. **HML smokes** — quando HML existir e for autorizada  

## Backend (pytest) — o que os ~21 testes cobrem

Arquivos: `test_auth.py`, `test_platform.py`, `test_domain_sprint2a.py`.

| Área | Regras cobertas (exemplos) |
|------|----------------------------|
| Auth | register, login, logout, me, sessão inválida, e-mail duplicado |
| Platform | anônimo/org owner negados; admin overview; mascaramento; elevação recusada; auditoria login |
| Domínio 2A | clientes/serviços/ciclos/recebíveis; isolamento cross-tenant; mark-paid; WhatsApp prep; confirm-contact; home summary |

**“21 passed” sozinho não prova o produto** — mapear sempre aos IDs `FR-*` / `NFR-*`.

## Frontend web (Vitest)

Componentes, formulários auth, empty states, a11y básica. **11 testes** na auditoria 2A.1.

## Frontend admin (Vitest)

Login / acesso negado. **4 testes** na auditoria 2A.1.

## E2E

- Fundação: cadastro → painel; logout; anônimo bloqueado  
- Sprint 2A: fluxo domínio + artefatos em `apps/web/e2e/artifacts/sprint2a/`  
- Admin E2E: especificado; executar quando ambiente disponível  

## Multi-tenancy

Obrigatório em toda sprint que toque dados de negócio.

## Migrations

Validar head Alembic nos gates; testes usam DB de teste conforme `conftest`.

## Visual / acessibilidade / PWA

- Visual: screenshots E2E + homologação manual do wordmark  
- A11y: checks básicos; auditoria profunda futura  
- PWA: manifest nos E2E; offline rico futuro  

## Integração futura / HML

Google Calendar, Meu Ciclo, smokes HML — só após sprint autorizada e ambiente.

## O que não testar agora

UI cosmético 100%; carga; módulos `PLANEJADO` (agenda, GCal); mutações admin bloqueadas.
