# AGENTS.md — Croniu

Instruções operacionais para agentes de IA. Detalhes: `docs/`.

## Ordem obrigatória de leitura

1. Este `AGENTS.md`  
2. `docs/README.md`  
3. `docs/PRODUCT_SPEC.md` (**mestre**)  
4. `docs/PROJECT_STATE.md`  
5. Spec da **sprint autorizada** (`docs/sprints/` — só se marcada `AUTORIZADA`)  
6. Docs especializados afetados pela tarefa  

## Regras duras

1. **Não implementar roadmap.** Só sprint `AUTORIZADA`.  
2. **Não mudar** regras aprovadas em `DOMAIN_RULES` / `PRODUCT_SPEC` sem decisão explícita.  
3. **Não alterar** identidade wordmark homologada (`BrandWordmark`).  
4. **Preservar multi-tenancy.** Nunca confiar em `organization_id` do cliente.  
5. **Não criar migration** sem sprint autorizada que a preveja.  
6. **Executar gates** da tarefa; se falhar, **registrar** — não “consertar escondido” fora do escopo.  
7. **Produzir relatório** quando a sprint pedir.  
8. **Não acessar** Jarvis, HML, Cloudflare, DNS, domínio ou produção **sem autorização explícita na tarefa**.  
9. **Parar** diante de divergência material código ↔ docs ↔ regras; registrar em vez de silenciar.  
10. Relatório ≠ homologação; teste automatizado ≠ teste manual.  

## Sprint autorizada

**Sprint 2C — Cycle intelligence** entregue localmente na branch `feature/sprint-2c-cycle-intelligence`.  
Spec: `docs/sprints/SPRINT_2C_CYCLE_INTELLIGENCE.md`. Relatório: `docs/reports/SPRINT_2C_REPORT.md`.  
SHA-base: `b8ef0b980f54571328d716ea0424731449bca92b`. Commit: `9989474`.

Não iniciar Google Calendar, Meu Ciclo, gateway ou itens fora do escopo sem nova autorização.

## Commits / PR

Só quando a tarefa pedir explicitamente.

## Fonte oficial

`docs/PRODUCT_SPEC.md` — uma regra, uma fonte. Não duplicar PRD inteiro em regras Cursor.
