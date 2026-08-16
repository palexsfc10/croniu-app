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

**Sprint — Rotinas na operação, ciclos no cliente, adaptação profissional** autorizada na branch `feature/client-intake-journey`.  
Spec: `docs/sprints/SPRINT_ROUTINES_NAV_CYCLES.md`. Diagnóstico: `docs/sprints/DIAGNOSIS_ROUTINES_AGENDA_CYCLES.md`.  
A sprint de intake permanece entregue em HML. Sem Promote / merge / PRD implantada.  
SHA-base: `4a7ee0351860dadf196ebdcef798013fbac4d412` (main com RC2.9 / PR #11).  

Deploy autorizado **somente em HML**. Não Promote, não PRD, não merge em `main` sem nova autorização do operador.

Sprint de avaliações/agente permanece entregue. Não iniciar gateway, GCal, WhatsApp API, Kyvora ou produção sem nova autorização.

## Commits / PR

Só quando a tarefa pedir explicitamente.

## Fonte oficial

`docs/PRODUCT_SPEC.md` — uma regra, uma fonte. Não duplicar PRD inteiro em regras Cursor.
