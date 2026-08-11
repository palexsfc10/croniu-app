# Croniu — Workflow oficial

Processo obrigatório para evolução do produto. Roadmap **não** autoriza implementação.

## Etapas

1. **Amadurecimento da ideia** — problema, valor, riscos  
2. **Atualização da especificação** — `PRODUCT_SPEC.md` e docs afetados  
3. **Criação da sprint** — `docs/sprints/` a partir do `TEMPLATE.md`  
4. **Autorização explícita** — responsável/CTO marca sprint `AUTORIZADA`  
5. **Preflight** — branch, HEAD, working tree, migrations, docs  
6. **Implementação** — somente escopo autorizado  
7. **Gates** — lint, typecheck, testes, builds; E2E se aplicável  
8. **Relatório** — evidências e limitações honestas  
9. **Revisão CTO** — consistência código ↔ docs ↔ regras  
10. **Homologação manual** — produto/UX quando exigido  
11. **HML** — somente quando disponível **e** autorizado  
12. **Decisão da próxima etapa** — nova sprint ou pausa  

## Regras duras

| Regra | Significado |
|-------|-------------|
| Nenhuma sprint inicia automaticamente | Precisa `AUTORIZADA` |
| Roadmap ≠ autorização | `ROADMAP.md` é intenção |
| Relatório ≠ homologação | Entrega técnica ≠ aceite de produto |
| Teste automatizado ≠ teste manual | Especialmente identidade e fluxos críticos |
| Código não muda regra silenciosamente | Divergência → registrar, não “consertar escondido” |
| Documentação não esconde divergência | Preferir status `PARCIAL` / pendência |
| Produção exige autorização explícita | Sem deploy oportunista |
| Sem Jarvis/HML/DNS/Cloudflare | Sem autorização por escrito na tarefa |

## Ordem de leitura (agentes)

Ver [`README.md`](./README.md) e [`../AGENTS.md`](../AGENTS.md).

## Template

Usar [`sprints/TEMPLATE.md`](./sprints/TEMPLATE.md) para cada nova sprint.
