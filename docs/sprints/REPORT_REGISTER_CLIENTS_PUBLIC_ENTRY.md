# Relatório — Cadastro por profissão, lista de clientes, entrada pública

Data: 2026-08-14  
Branch: `feature/client-intake-journey`  
Parar em HML. Sem merge, Promote ou PRD.

## 1. Diagnóstico

Três defeitos independentes, todos reproduzíveis no código da branch (não era “HML sem o commit da landing”).

## 2. Causa do cadastro

Na etapa 2 o submit passava pelo `handleSubmit` do Zod **incluindo** `profession_code` já no clique de **Continuar**, e/ou (versão anterior) lia `FormData` da etapa 1 **desmontada**, zerando nome/e-mail/senha.

Efeito: ao escolher qualquer profissão e concluir, a validação falhava em campos invisíveis. A API muitas vezes **nem era chamada**. Payload aparente: `full_name`/`email`/`password` vazios + `profession_code` preenchido, ou nenhum POST.

Enums Web e backend já coincidiam. Migration 0020 presente (head 0022). Não era label no lugar do código no formulário atual.

## 3. Profissões testadas (backend)

Loop em `PROFESSION_OPTIONS` (10 códigos), com especialidade em professor particular e esportes, e descrição em `other`. 201 + `profession_onboarding_done` + `/me` + logout. Label `"Personal trainer"` como código → 422 `invalid_profession`. `other` sem descrição → 422.

## 4. Atomicidade

`IntegrityError` no flush/commit faz rollback e não deixa sessão. Trial no mesmo commit da conta. E-mail de verificação continua opcional e não desfaz o cadastro.

## 5. Autenticação / trial

Fluxo de sessão inalterado quando `email_verification_required` é falso (testes). HML pode exigir verificação de e-mail — conta é criada mesmo assim.

## 6–8. Lista de alunos/clientes

Antes: título + dois botões desalinhados (“Novos cadastros” / “Novo”) + linha só com nome e telefone cru.

Depois: título adaptado; CTA primário **Adicionar aluno/cliente**; secundário **Compartilhar link** (`min-h-11`); indicador de fila; avatar com iniciais; um badge; subtítulo operacional (ciclo / acompanhamento); chevron; linha inteira clicável. Filtros Ativos/Arquivados usam a API existente.

## 9. Nomenclatura

`nomenclatureFor` — alunos vs clientes.

## 10–12. Entrada antiga / PWA

Código da hero moderna já estava no repo. O SW `croniu-static-v3` fazia **cache-first de `/`**, então HTML antigo podia ser servido para sempre se o `sw.js` não mudasse.

Correção: cache `v4`; **network-first** em navegações; `/` fora do precache; `skipWaiting` + `registration.update()`. Wordmark textual sem C; C permanece em favicon/PWA/IA.

## 13–14. Testes / CI local

- Backend: `test_register_professions.py` + `test_auth.py` (21 passed)
- Web: register-form, profession-contract, client-list, PWA v4, public-entry; `tsc` ok
- E2E Playwright completo / Admin / visual / secret scan: não rodados nesta máquina (pendente no pipeline se houver)

## 15–18. HML

- Backup: `/home/palex/ntws/backups/croniu-hml/pre-client-intake_20260814T143150Z.sql.gz`
- SHA256: `a830a676c591a61f08152fa003bb6c0ce0f66421c31d98b150c6e8e02e0cddce`
- **SHA HML:** `7b8e799d9866d09b8fad923cec575cbca827d2c9`
- `/version`: `environment=hml`, `build_time=20260814T143150Z`
- Alembic: `0022_form_template_pin` (head)
- Recreate: api + web + admin. DB e tunnel preservados.
- Smoke API register 201: personal_trainer, private_tutor, consultant, other
- HTML local web: “Organize seus clientes”, “Seu parceiro de rotina”, 0× `croniu-mark.png`
- `sw.js` no host: `croniu-static-v4`

## 19. Evidências humanas

Cadastro das 10 profissões; lista personal vs consultor; entrada anônima e com PWA antigo (deve buscar HTML novo).

## 20. Riscos

- Contas HML com e-mail não verificado continuam 401 no login até confirmar.
- Subtítulo “Ciclo em andamento” não lista horário da próxima aula (exigiria mais um endpoint).
- SW antigo só atualiza após baixar o novo `sw.js`.

## 21. Pendentes

Deploy HML + smoke visual 320–412px + push da branch.
