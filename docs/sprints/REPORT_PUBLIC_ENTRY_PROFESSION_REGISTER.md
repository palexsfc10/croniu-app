# Relatório — tela pública, cadastro profissional e multinicho

## Motivo da omissão

1. **Tela pública:** a modernização já existia no PR (`PublicEntryHero`, commit `248abb0`) e foi implantada em HML no SHA `03ec032`. A evidência antiga (“Sua rotina. Seus ciclos…”, CTA “Começar”, serifa) corresponde a **layout ainda centrado verticalmente** (espaço vazio + conteúdo baixo), **cards demonstrativos com “aluno/anamnese”**, e possível **cache de `/`**. Não era ausência total de commit.
2. **Cadastro:** backend (`RegisterRequest`, `register_owner`, migration `0020`) e Perfil profissional **já existiam**. A Web **não enviava** `profession_code` no `/register` — implementação incompleta da etapa 2, não falta de schema.

## Diagnóstico (12 perguntas)

1. Modernização da entrada implementada? **Sim** (`public-entry-hero.tsx`).
2. No PR #12? **Sim**.
3. Implantada em HML? **Sim** (web `03ec032`); copy nova já estava no bundle. Ajuste desta correção: âncora no topo, `Cache-Control: no-store` em `/`, cards genéricos.
4. Profissão no backend? **Sim** (`organizations.profession_*`, `use_cases`).
5. Profissão na Web no cadastro? **Não estava**; agora sim, 2 etapas.
6. Admin? Label já existia; agora especialidade, onboarding e form recomendado.
7. Migration? **`0020_prof_accomp_ux`** (head permanece **`0022_form_template_pin`**). Sem migration nova.
8. Resolvedor central? **Sim** (`nomenclature.ts` + `profession.py`).
9. Formulários usam profissão? **Agora** na criação de link (recomendação; links existentes preservados).
10. Rotinas? Enums estáveis; labels de sugestão ainda genéricas no quadro (não bloqueiam tipos).
11. IA? Bloco de nomenclatura no system prompt (sem descrição livre).
12. Legado? `profession_code` nulo → `generic`; nudge “Completar agora / Fazer depois”; Perfil em Mais.

Códigos **reutilizados** (sem duplicar): `private_tutor`, `sports_teacher`, `aesthetics`, `other`, `appointments_agenda`. Aliases aceitos: `private_teacher`, `sports_instructor`, `beauty_professional`, `other_self_employed`.

## O que mudou nesta correção

- Hero: conteúdo no topo da dobra; fluxo visível no mobile; preview “Novo cliente / Formulário concluído”.
- Register: etapa 1 dados, etapa 2 área + especialidade condicional + casos de uso + resumo.
- Link novo usa `recommended_form_kind` (consultor/professor **não** recebem anamnese física por padrão).
- Sports: questionário esportivo, salvo especialidade física (ex. musculação).
- Nudge legado na tela Hoje; Admin com mais metadados seguros.

## HML / CI

Sem migration. Backup no deploy padrão. Recriar api+web+admin. Preservar db/cloudflared.

Pendências humanas: prints, smoke personal/professor/consultor/legado, agrupamento fino de rotinas por profissão.
