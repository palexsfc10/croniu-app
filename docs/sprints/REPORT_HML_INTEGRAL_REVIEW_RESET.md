# Revisão integral HML — identidade, limpeza controlada, multinicho

## Diagnóstico inicial

| Item | Valor |
|---|---|
| Repositório | `palexsfc10/croniu-app` |
| Worktree | `C:\projetos\croniu-intake-journey` |
| Branch | `feature/client-intake-journey` |
| PR | #12 (aberto vs `main`) — **não mergeado** |
| SHA inicial HML | `5e133b2c93d2f28c00ed06850d2e9d60f09bb1db` |
| Alembic | `0022_form_template_pin` |
| Host | `jarvis` / compose `croniu-hml` |
| URLs | `https://croniu-hml.ntws.cloud` |
| PRD / Promote | não tocados |

Persistência, atomicidade de ciclo e `ends_on` exclusivo já estavam aceitos no SHA `efdfd92` / `5e133b2`. Esta rodada não reabre essas correções; cobre identidade visual, nomenclatura e reset.

## Identidade visual

- Entrada pública: **somente** `BrandWordmark` (“Cron” + “iu”). Removido `BrandMark` (C) ao lado do logo.
- Favicon/PWA: ícones `icon-*-v3.png` (símbolo C) preservados.
- IA: `BrandMark` permanece no atalho Assistente / IA do `AppShell`.
- Cadastro/login: wordmark textual (já era).

## Nomenclatura

Resolvedor central: `nomenclature.ts` + `profession.py`.

| Perfil | Cliente | Plano | Sessão | Formulário recomendado |
|---|---|---|---|---|
| Personal | aluno | plano de treino | treino | anamnese física |
| Professor particular | aluno | plano de aulas | aula | questionário de aulas |
| Consultor | cliente | plano de acompanhamento | atendimento | briefing |
| Esportes | aluno | plano de treino | aula | questionário esportivo (anamnese física só se especialidade `musculacao`) |
| Estética / genérico / clínico | cliente | plano de atendimento/acompanhamento | sessão/atendimento | cadastro simples |

## Limpeza HML

Script: `backend/scripts/reset_hml_application_data.py` + `deploy/hml/_ops_reset_hml_application_data.sh`

- Exige `hostname=jarvis`, compose `croniu-hml`, `CRONIU_ENV=hml`, `RESET_HML_CONFIRM=croniu-hml`
- Aborta URL/nome com prd/prod
- Preserva schema, `alembic_version`, catálogo billing, templates globais (`organization_id` nulo), usuários com `platform_memberships`
- Sem `compose down`, sem volumes, sem drop database

## Parar em HML

Sem merge, sem Promote, sem PRD.
