# Croniu — Product Requirements Document (PRD)

> **Documento histórico da fundação.** Fonte oficial: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md).  
> Estados de módulo e rastreabilidade vivem no PRODUCT_SPEC — não atualizar este PRD como segunda fonte.

## 1. Objetivo

Entregar um SaaS mobile-first (PWA) que ajude profissionais autônomos a organizar clientes, agenda, locais, ciclos contratados, pagamentos manuais e renovações, com foco em ações do dia e retenção de receita.

## 2. Público

### Primário (MVP)

Personal trainers autônomos que atendem clientes recorrentes por pacotes/períodos.

### Secundário (evolução)

Profissionais de dança, artes marciais, música, idiomas, aulas particulares, pilates/yoga, treinadores esportivos e similares.

### Não-usuário autenticado no MVP

Cliente/aluno: acessa apenas a página pública “Meu Ciclo” por link exclusivo.

## 3. Problemas

| Problema | Impacto |
|----------|---------|
| Ciclos encerrados sem percepção | Perda de receita |
| Demora para perguntar sobre renovação | Churn evitável |
| Confusão de horários e locais | Retrabalho e falhas |
| Pagamentos pendentes esquecidos | Fluxo de caixa irregular |
| Conversas de renovação perdidas no WhatsApp | Falta de follow-up |
| Fragmentação (WhatsApp + agenda + planilha) | Carga mental |

## 4. Proposta de valor

“Assistente de rotina, ciclos e renovações” — o profissional abre o app e sabe o que fazer hoje: atendimentos, ciclos acabando, renovações pendentes e pagamentos em atraso.

## 5. Escopo do MVP (produto completo planejado)

### 5.1 Autenticação e organização

Cadastro, login, logout, recuperação de acesso (planejada), perfil, organização multi-tenant, preparação para confirmação de e-mail, sessão segura, isolamento entre organizações.

### 5.2 Clientes

Cadastro, edição, ativação/arquivamento, telefone e e-mail opcionais, observações internas, situação atual, histórico de ciclos e renovação, link “Meu Ciclo”.

### 5.3 Serviços e planos

Cadastro do que o profissional oferece (mensal, pacote de N sessões, aula avulsa, trimestral, etc.), sem regras exclusivas de personal trainer.

Tipos de ciclo (arquitetura):

- por período;
- por quantidade de sessões;
- híbrido (período + quantidade).

Implementação começa pelo modelo mais simples definido nas regras de domínio.

### 5.4 Ciclos

Período/pacote contratado com datas, sessões opcionais, valor, pagamento, renovação, pausa, encerramento e histórico imutável (não sobrescrever).

Status: planejado, ativo, próximo do encerramento (pode ser calculado), encerrado, pausado, cancelado.

Próximo ciclo só após confirmação do profissional.

### 5.5 Agenda e locais

Compromissos únicos e recorrentes; horários; cliente; serviço; local; mapa opcional; alerta de conflito; status opcional (agendado, realizado, falta, cancelado, reagendado). Presença não é obrigatória.

### 5.6 Central de ações (home)

Responder: atendimentos de hoje, horários, locais, ciclos terminando, quem renovar, quem não respondeu, pagamentos pendentes, clientes sem próximo ciclo, retornos de pausa. Priorizar tarefas, não gráficos.

### 5.7 Renovação

Fluxo click-to-chat WhatsApp com mensagem personalizada + link “Meu Ciclo”; respostas do cliente; profissional confirma antes de criar próximo ciclo.

### 5.8 Mensagens

Sem API oficial do WhatsApp no MVP. Apenas mensagem pronta + abertura do WhatsApp do profissional.

### 5.9 Financeiro simples

Valor, vencimento, status, data, forma opcional, observação; esperado/recebido/pendente. Registro manual; sem gateway.

### 5.10 Página pública “Meu Ciclo”

Link seguro, sem login; dados mínimos; botões de resposta e WhatsApp; segurança reforçada (token de alta entropia, rate limit, noindex, etc.).

## 6. Fora de escopo (MVP e esta entrega)

Aplicativo nativo; prescrição de treinos/exercícios/dietas/avaliação física; marketplace; chat interno; IA; cobrança automática; API WhatsApp oficial; equipes multi-profissional ativas; login de cliente; lojas de app; relatórios contábeis complexos; gamificação; presença completa; deploy de produção.

**Esta sprint (fundação):** auth, organização multi-tenant, shell do painel com empty states, e painel administrativo da plataforma (leitura). Não implementar clientes, ciclos, agenda, renovação ou financeiro completos.

## 7. Jornadas

### J1 — Profissional se cadastra e entra

1. Acessa o app → cadastra e-mail/senha/nome → organização criada → entra no painel “Hoje” com estados vazios.

### J2 — Rotina diária (futuro)

Abre “Hoje” → vê atendimentos e alertas → age (renovar, registrar pagamento, abrir WhatsApp).

### J3 — Renovação (futuro)

Abre cliente/ciclo → “Perguntar sobre renovação” → WhatsApp → cliente responde em “Meu Ciclo” → profissional confirma e cria próximo ciclo.

### J4 — Cliente acessa “Meu Ciclo” (futuro)

Abre link → vê ciclo, próxima aula, pagamento resumido → responde renovação ou conversa no WhatsApp.

## 8. Histórias de usuário (fundação + MVP)

### Fundação (esta entrega)

- Como profissional, quero me cadastrar para começar a usar o Croniu.
- Como profissional, quero fazer login e logout com sessão segura.
- Como profissional, quero acessar um painel protegido mesmo sem dados ainda cadastrados.
- Como sistema, quero isolar dados por organização para que uma conta não veja outra.
- Como operador da plataforma, quero autenticar no admin separado e ver métricas/organizações/usuários sem acessar dados operacionais detalhados indevidos.

### MVP futuro (registradas, não implementadas agora)

- Como profissional, quero cadastrar clientes e planos neutros.
- Como profissional, quero criar ciclos com datas e valor.
- Como profissional, quero ver a agenda do dia e conflitos.
- Como profissional, quero iniciar renovação via WhatsApp.
- Como cliente, quero ver meu ciclo e responder renovação pelo link.
- Como profissional, quero marcar pagamento como recebido manualmente.

## 9. Regras funcionais (resumo)

Ver `DOMAIN_RULES.md` para o detalhamento. Destaques:

- Nomenclatura interna neutra (`client`, `cycle`, `appointment`, …).
- `organization_id` sempre derivado da sessão, nunca do body do cliente.
- Próximo ciclo só com confirmação profissional.
- Status “próximo do encerramento” pode ser calculado.
- Cliente MVP não autentica.

## 10. Critérios de aceite — Fundação

- [ ] Documentação obrigatória criada e consistente.
- [ ] Cadastro cria usuário + organização + membership em transação.
- [ ] Login/logout funcionam; sessão inválida bloqueia rotas protegidas.
- [ ] Isolamento multi-tenant coberto por testes.
- [ ] Painel autenticado com estados vazios reais (sem botões mortos).
- [ ] Health check API + banco.
- [ ] Compose local reproduzível; sem secrets no Git.
- [ ] Gates locais verdes (lint, typecheck, testes, build).
- [ ] HML no Jarvis preparada/implantada conforme proteção de serviços compartilhados.

## 11. Métricas iniciais (registrar; analytics completo depois)

- Profissionais cadastrados
- Profissionais ativos semanalmente
- Clientes ativos por profissional
- Ciclos criados / próximos do fim
- Consultas de renovação iniciadas / respostas / concluídas
- Tempo entre alerta e resposta
- Pagamentos marcados como recebidos
- Retenção após um ciclo completo

**Validação qualitativa principal:** uso em ciclo real e declaração de “sentiria falta”.

## 12. Riscos

| Risco | Mitigação |
|-------|-----------|
| Escopo expandir para “sistema de treino” | Escopo explícito fora do MVP |
| WhatsApp não oficial | Apenas click-to-chat manual |
| Vazamento multi-tenant | Filtros + testes de isolamento |
| Link público enumerável | Token alta entropia + rate limit |
| Jarvis compartilhado | Preflight, nomes exclusivos, sem prune |
| Baixa adoção se só “cadastro” | Foco em ciclo real na validação |

## 13. Hipóteses a validar

1. Personal trainers aceitam PWA em vez de app nativo.
2. Click-to-chat WhatsApp é suficiente no início.
3. Central de ações reduz esquecimento de renovações.
4. Cliente responde renovação sem login.
5. Modelo de ciclo por período cobre o caso mais comum inicial.
6. Um profissional por organização é suficiente no lançamento.

## 14. Pendências comerciais / operacionais (não decididas silenciosamente)

- Preço e plano de cobrança do SaaS Croniu.
- Domínios definitivos de HML/produção (`hml.croniu.com`, `api-hml.croniu.com` sugeridos).
- Política de retenção de dados e termos LGPD finais.
- Segmento de rótulos padrão no primeiro onboarding (aluno vs cliente).
