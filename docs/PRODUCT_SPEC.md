# Croniu — Especificação mestre do produto

**Documento canônico.** Os demais docs aprofundam e devem apontar para aqui.  
**Auditoria de baseline:** Sprint 2A.1 (2026-07-24).  
**Sprint autorizada para implementação de features:** *nenhuma* (após 2A entregue; 2B é rascunho).

Vocabulário de estados: `IMPLEMENTADO` · `PARCIAL` · `PLANEJADO` · `FUTURO` · `FORA_DO_ESCOPO` · `PENDENTE_DE_DECISAO`.

---

## 1. Identidade

| Campo | Valor |
|-------|--------|
| Produto | **Croniu** |
| Empresa | NTWS Labs |
| Posicionamento | Assistente de rotina, ciclos, recebimentos, renovações e agenda para profissionais com clientes recorrentes |
| Proposta de valor | Reduzir carga mental mostrando o que precisa de atenção **hoje**, com ciclos e renovações no núcleo |
| Slogan provisório | “Sua rotina. Seus ciclos. Tudo sob controle.” |
| Referência `Cron` | Tempo, rotina, periodicidade |
| Referência sonora `iu` | Sufixo leve / memorável (não afirma etimologia jurídica) |
| Wordmark homologado | `Cron` em **negrito** + `iu` na cor primária da marca; nome acessível integral; logo à direita nas telas de autenticação |
| Identidade | Moderna, sênior, clean, mobile-first, sem aparência de template |

O nome pode ainda passar por validação jurídica e de domínio. **Não afirmar registro nem disponibilidade.**

---

## 2. Público

### Lançamento inicial

- Personal trainers e profissionais autônomos com clientes recorrentes  
- Faixa de maior valor percebido inicial: ~**15–60** clientes ativos  

### Arquitetura multiprofissional (futura)

Dança, artes marciais, música, idiomas, reforço escolar, pilates, yoga, treinadores esportivos e afins.

**Nomenclatura técnica neutra** no domínio (`Client`, `Service`, `Cycle`, `Receivable`); rótulos de UI podem adaptar-se por segmento no futuro.

---

## 3. Problemas que o produto resolve

1. Agenda fragmentada (planejado cobrir; hoje ausente)  
2. Ciclos esquecidos  
3. Recebimentos atrasados  
4. Renovação tardia  
5. Dependência da memória do profissional  
6. Informação dispersa entre WhatsApp, agenda e planilha  
7. Dificuldade de enxergar prioridades do dia  

---

## 4. Proposta e não-proposta

### Croniu é assistente de

Rotina · ciclos · recebimentos · renovações · agenda.

### Não é (MVP / posicionamento)

Prescritor de treino · biblioteca de exercícios · dietas · marketplace · chat · sistema contábil completo.

---

## 5. Perfis

| Perfil | Descrição | Estado |
|--------|-----------|--------|
| Profissional | Usuário da org; opera clientes/ciclos/recebimentos | `IMPLEMENTADO` (papel `owner`/`admin`/`member` no membership) |
| Administrador da organização | Gestão da org do tenant | `PARCIAL` (mesmo app; papéis existem; UI de gestão limitada) |
| Cliente final | Sem login; Meu Ciclo por link opaco | `IMPLEMENTADO` (2D) |
| Administrador da plataforma | Painel `/admin` separado; memberships platform | `PARCIAL` (leitura + métricas) |
| Equipe futura | Multi-membro operacional rico | `FUTURO` |

**Separar** admin da organização (tenant) de admin da plataforma (NTWS Labs).

---

## 6. Módulos

### M-AUTH — Autenticação (organização)

| | |
|--|--|
| Objetivo | Conta do profissional, sessão cookie, isolamento |
| Estado | `IMPLEMENTADO` |
| Histórias | Registrar; entrar; sair; ver sessão |
| Regras | Argon2id; cookie HttpOnly; org da sessão; mensagens genéricas |
| Aceite | Login/registro funcionam; cookie presente; logout limpa |
| Dependências | DB, migrations 0001+ |
| Evidências | `test_auth.py`; E2E login |
| Futuro | CSRF reforçado; rate limit; MFA |

### M-ORG — Organização / multi-tenancy

| | |
|--|--|
| Objetivo | Tenant por organização + membership |
| Estado | `IMPLEMENTADO` |
| Regras | Nunca confiar em `organization_id` do cliente; filtro server-side |
| Evidências | Testes isolamento em `test_domain_sprint2a.py` |

### M-CLIENT — Clientes

| | |
|--|--|
| Objetivo | Cadastro e listagem de clientes do tenant |
| Estado | `IMPLEMENTADO` (UI edição completa = `PARCIAL`) |
| Aceite | CRUD mínimo; archive; isolamento |
| Evidências | API + páginas web + testes domínio + E2E |

### M-SERVICE — Serviços

| | |
|--|--|
| Objetivo | Catálogo de serviços/valores da org |
| Estado | `PARCIAL` (criar/listar/PATCH API; UI edição limitada) |
| Futuro | Inativação rica; impacto explícito em históricos |

### M-CYCLE — Ciclos

| | |
|--|--|
| Objetivo | Representar período contratado (não é recebimento nem renovação) |
| Estado período | `IMPLEMENTADO` |
| Estado sessões | `PLANEJADO` |
| Estado híbrido | `PLANEJADO` |
| Regras | `mode=period` apenas; status `active`/`ended`/`cancelled` (campo); pausa **não** implementada |
| Evidências | Migration 0003; domain service; E2E |

### M-RECEIVABLE — Recebimentos

| | |
|--|--|
| Objetivo | Cobrança manual vinculada ao ciclo |
| Estado | `IMPLEMENTADO` (manual) |
| Pagamentos parciais | `FUTURO` |
| Regras | pending → received; atraso calculado; mark-paid |

### M-ALERT — Alertas internos

| | |
|--|--|
| Objetivo | Priorizar o que exige atenção no Hoje |
| Estado | `PARCIAL` (cálculo em home/domain; sem entidade Alert persistida dedicada) |
| Futuro | Persistência, dedupe formal, resolução auditável |

### M-RENEWAL — Renovação (prep)

| | |
|--|--|
| Objetivo | Preparar contato de renovação sem automação |
| Estado | `IMPLEMENTADO` (prep + confirm-contact) |
| Regra | Abrir WhatsApp ≠ envio; novo ciclo **não** automático |

### M-WA — WhatsApp manual

| | |
|--|--|
| Objetivo | Gerar `wa.me` com mensagem |
| Estado | `IMPLEMENTADO` |
| Envio automático / API oficial | `FORA_DO_ESCOPO` do MVP atual |

### M-HOME — Central Hoje

| | |
|--|--|
| Objetivo | Painel do dia com dados reais e ação prioritária |
| Estado | `IMPLEMENTADO` |
| Evidências | `/home/summary`, `TodayBoard`, regra [`HOME_PRIORITY.md`](./HOME_PRIORITY.md) |

### M-CTX — Barra contextual

| | |
|--|--|
| Objetivo | Uma ação/contexto prioritário; sem carrossel |
| Estado | `PARCIAL` (componente em detalhes; **não** na home; prioridade única via `priority_action`) |

### M-AGENDA — Agenda interna

Estado: `PLANEJADO` — fora da Sprint 2A.

### M-LOCALE — Locais

Estado: `PLANEJADO`.

### M-GCAL — Google Calendar

Estado: `PLANEJADO` (somente leitura na 1ª versão). Bidirecional: `FUTURO`. Ver §13 e `ARCHITECTURE.md`.

### M-MYCYCLE — Página Meu Ciclo (cliente)

Estado: `PLANEJADO`.

### M-ADMIN — Painel administrativo da plataforma

Estado: `PARCIAL` — métricas reais de leitura; mutações bloqueadas.

### M-PWA — Progressive Web App

Estado: `PARCIAL` — manifest/service worker básicos; aprofundar offline depois.

### M-BILLING — Billing SaaS

Estado: `FUTURO`.

### M-NOTIF — Notificações push/sistema

Estado: `FUTURO`.

---

## 7. Situação consolidada (pós-auditoria)

| Tema | Estado |
|------|--------|
| Clientes | `IMPLEMENTADO` |
| Serviços | `PARCIAL` |
| Ciclo por período | `IMPLEMENTADO` |
| Ciclos por sessões | `PLANEJADO` |
| Ciclos híbridos | `PLANEJADO` |
| Recebimentos manuais | `IMPLEMENTADO` |
| Pagamentos parciais | `FUTURO` |
| Alertas internos | `PARCIAL` |
| WhatsApp manual | `IMPLEMENTADO` |
| Envio automático WA | `FORA_DO_ESCOPO` |
| Meu Ciclo | `IMPLEMENTADO` |
| Agenda interna | `IMPLEMENTADO` (compromisso único; sem recorrência) |
| Locais | `IMPLEMENTADO` |
| Timezone organização | `IMPLEMENTADO` |
| Google Calendar RO | `PLANEJADO` |
| Sync bidirecional GCal | `FUTURO` |
| Admin plataforma | `PARCIAL` |
| HML implantada | `PLANEJADO` (artefatos existem) |
| Produção | `PLANEJADO` |

---

## 8. Google Calendar (planejado — não integrar nesta sprint)

### Primeira versão

- Somente leitura · OAuth · escolha de calendários · agenda unificada · origem identificada  
- Evento Google **não** vira cliente/ciclo/atendimento automaticamente  
- Croniu funciona **sem** a integração  
- Detecção futura de conflito  

### Evoluções

Exportação · sync incremental · push/webhooks · recorrência · bidirecional só após validação.

### Segurança

Menor escopo · consentimento · tokens criptografados · revogação · desconexão · sem tokens em logs · verificação do app Google.

---

## 9. Matriz de rastreabilidade

| ID | Descrição | Estado | Evidência | Teste | Sprint | Pendência |
|----|-----------|--------|-----------|-------|--------|-----------|
| FR-AUTH-01 | Registro de profissional + org | `IMPLEMENTADO` | `auth` API + UI | `test_auth` | Fundação/2A | — |
| FR-AUTH-02 | Login/logout cookie sessão | `IMPLEMENTADO` | `sessions` | `test_auth` | Fundação | CSRF reforçado |
| FR-AUTH-03 | `/me` sessão atual | `IMPLEMENTADO` | auth router | `test_auth` | Fundação | — |
| FR-CLIENT-01 | Criar/listar clientes tenant | `IMPLEMENTADO` | clients API/UI | domain + E2E | 2A | — |
| FR-CLIENT-02 | Arquivar cliente | `IMPLEMENTADO` | PATCH status | domain | 2A | edição completa UI |
| FR-SERVICE-01 | Criar/listar serviços (valor/aula) | `IMPLEMENTADO` | services | domain + 2C | 2C | — |
| FR-SERVICE-02 | Atualizar/arquivar serviço | `IMPLEMENTADO` | PATCH API + UI lista | 2C | — |
| FR-SERVICE-03 | Duração padrão em minutos | `IMPLEMENTADO` | default_duration_minutes | 2C | — |
| FR-CYCLE-01 | Ciclo mode=period | `IMPLEMENTADO` | cycles | domain + E2E | 2A | — |
| FR-CYCLE-02 | Ciclo mode=session_count | `PLANEJADO` | — | — | futuro | decisão sprint |
| FR-CYCLE-03 | Ciclo híbrido | `PLANEJADO` | — | — | futuro | — |
| FR-CYCLE-04 | Pausar ciclo | `PLANEJADO` | — | — | futuro | docs antigos citavam |
| FR-CYCLE-05 | Modelos de ciclo reutilizáveis | `IMPLEMENTADO` | cycle_templates | 2C | — |
| FR-CYCLE-06 | Cálculo exato de aulas + financeiro | `IMPLEMENTADO` | cycle_calc + preview | 2C | — |
| FR-CYCLE-07 | Geração opcional atômica na agenda | `IMPLEMENTADO` | intelligent create | 2C | sync edição pendente |
| FR-CYCLE-08 | Edição financeira (desconto/final) na UI | `IMPLEMENTADO` | `/financial` + PATCH financial | 2C.1 | sync agenda ADR-024 |
| FR-RECEIVABLE-01 | Recebimento + mark-paid | `IMPLEMENTADO` | receivables | domain + E2E | 2A | Alvo vocab: `paid` (hoje `received`); `expected` divergente |
| FR-RECEIVABLE-02 | Pagamento parcial | `FUTURO` | — | — | — | — |
| FR-RECEIVABLE-03 | Vocabulário pending/paid/cancelled + overdue calc | `PLANEJADO` | docs ADR-021 | — | autorizada | Normalizar código |
| FR-ALERT-01 | Prioridades no Hoje | `IMPLEMENTADO` | home summary + HOME_PRIORITY.md | domain home | home-hoje | entidade Alert persistida |
| FR-MYCYCLE-01 | Portal público por token opaco ou HMAC reconstruível | `IMPLEMENTADO` | `/c/{token}` + public API; GET devolve URL estável | 2D | HMAC `v1` + legado `token_hash` |
| FR-MYCYCLE-02 | Solicitação renovação idempotente | `IMPLEMENTADO` | renewal_requests | 2D | — |
| FR-MYCYCLE-03 | Informe pagamento + confirmação pro | `IMPLEMENTADO` | payment_reports | 2D | gateway fora |
| FR-MYCYCLE-04 | Preferências Pix/link https | `IMPLEMENTADO` | payment-settings | 2D | — |
| FR-AGENDA-01 | Agenda interna diária + compromisso único | `IMPLEMENTADO` | agenda API/UI | test_agenda + E2E | 2B | recorrência fora |
| FR-AGENDA-02 | Locais ativo/arquivado | `IMPLEMENTADO` | locations | test_agenda | 2B | — |
| FR-AGENDA-03 | Conflito sobreposição (bloqueio) | `IMPLEMENTADO` | find_conflicts | test_agenda | 2B | override pendente |
| FR-CALENDAR-01 | Google Calendar RO | `PLANEJADO` | — | — | TBD | — |
| NFR-OPS-04 | Timezone org IANA | `IMPLEMENTADO` | org.timezone | test_agenda | 2B | DST doc |
| FR-ADMIN-01 | Overview métricas | `PARCIAL` | platform API | `test_platform` | 2A | mutações |
| FR-ADMIN-02 | Bootstrap admin | `IMPLEMENTADO` | CLI + docs | platform | Fundação | — |
| NFR-SEC-01 | Isolamento multi-tenant | `IMPLEMENTADO` | domain filters | cross-tenant tests | 2A | — |
| NFR-SEC-02 | Não confiar org_id cliente | `IMPLEMENTADO` | deps sessão | testes | contínuo | — |
| NFR-SEC-03 | Rate limit login | `PLANEJADO` | — | — | — | — |
| NFR-UX-01 | Wordmark Cron+iu | `IMPLEMENTADO` | BrandWordmark | visual E2E | 2A | **não alterar** |
| NFR-UX-02 | Nav Hoje/Clientes/Ciclos/Mais | `IMPLEMENTADO` | AppShell | E2E | 2A | Agenda planejada |
| NFR-UX-03 | Barra contextual 1 ação | `PARCIAL` | ContextualBar | E2E parcial | 2A | shell global |
| NFR-OPS-01 | Seed demo isolado | `IMPLEMENTADO` | `seed_demo` | manual | 2A | — |
| NFR-OPS-02 | HML implantada | `PLANEJADO` | `deploy/hml` | — | — | Jarvis |
| NFR-OPS-03 | Domínio público | `PENDENTE_DE_DECISAO` | — | — | — | registro |
| NFR-OPS-04 | Timezone org IANA (default America/Sao_Paulo) | `PLANEJADO` | ADR-020 | — | 2B candidata | Sem migration na baseline |

---

## 10. Regras imutáveis (sem sprint autorizada)

1. Multi-tenancy: org da sessão; nunca `organization_id` do body/query do cliente.  
2. Ciclo ≠ recebimento ≠ renovação.  
3. WhatsApp MVP = manual (`wa.me`); sem envio automático.  
4. Identidade wordmark homologada — não redesenhar.  
5. FastAPI é fonte das regras de negócio.  
6. Roadmap ≠ autorização de sprint.  
7. Sem migration / feature fora da sprint autorizada.  
8. Sem Jarvis / HML / produção / DNS sem autorização explícita.

## 11. Como comprovar entrega

1. Gates da sprint (lint, typecheck, testes, builds)  
2. Relatório em `docs/` ou `docs/reports/`  
3. Evidências E2E/artefatos quando aplicável  
4. Homologação manual do responsável do produto (quando exigida)  
5. Atualização de `PROJECT_STATE.md` + estados neste `PRODUCT_SPEC.md`

Ver [`WORKFLOW.md`](./WORKFLOW.md).
