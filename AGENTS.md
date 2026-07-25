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

## Sprint autorizada (baseline 2A.1)

Após Sprint 2A entregue e 2A.1 documental: **nenhuma sprint de feature autorizada**.  
`SPRINT_2B_DRAFT` = **NÃO AUTORIZADA**.

## Commits / PR

Só quando a tarefa pedir explicitamente.

## Fonte oficial

`docs/PRODUCT_SPEC.md` — uma regra, uma fonte. Não duplicar PRD inteiro em regras Cursor.
