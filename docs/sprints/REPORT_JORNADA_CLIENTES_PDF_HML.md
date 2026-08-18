# Relatório: correções do PDF "JORNADA CLIENTES" — HML

Origem: PDF de 12 páginas (`JORNADA CLIENTES.pdf`) anotado pelo owner sobre
capturas de tela do fluxo de Clientes, pedindo revisão como UX + QA, com o
app tratado como premium e sem gaps de funcionalidade.

## Achados do PDF e resolução

| Página | Achado do owner | Resolução |
|---|---|---|
| 2 | "Compartilhar link" na lista de Alunos deveria compartilhar o convite direto | Botão agora abre um popover com "Copiar link"/"WhatsApp" sem navegação extra |
| 3 | Tabs do perfil (Resumo/Acompanhamento/Dados) "quero algo premium" | Segmented control com borda, sombra e estado selecionado animado |
| 4 | "Próximo passo" deveria dizer o que falta fazer | Card agora lista "Falta: ..." com os itens pendentes do checklist |
| 5–6 | Badge "Concluído" desalinhado (segue o texto do título, varia por linha) | Badge/status agora alinhado à direita, fixo em toda linha |
| 6 | "Anamnese feita não dá para consultar mais" | Filtro `client_id` em `GET /intake-submissions` + link "Ver respostas" no perfil e no checklist |
| 7 | "Mais opções" (portal do cliente) em destaque demais | Trigger de disclosure discreto (sem caixa/fundo), continua recolhido por padrão |
| 8 | "Ver plano" abre em branco mesmo com plano existente | Corrigido typo `tab=accompaniment` → `tab=acompanhamento` (segunda ocorrência, a primeira já fora corrigida em rodada anterior) |
| 10 | Flag de rotina abre modal fora de posição, precisa rolar para achar | Causa raiz: `.animate-fade-up` definia `transform`, o que torna o ancestro um *containing block* para `position: fixed` enquanto a animação mantém o frame final — todo modal `fixed inset-0` da árvore ficava deslocado. Removido o `transform` do keyframe (mantido só opacidade); corrige as 5 telas afetadas de uma vez. |
| 11 | "Suas rotinas" deveria recolher ou ocultar; confirmar presença na Agenda | Lista agora é um disclosure colapsável; confirmado que rotinas ativas já aparecem em Agenda → "Ações da rotina" (`AgendaRoutines`) — sem gap de dado, só duplicação visual resolvida pelo collapse |

## Testes

- Backend: 406 passed (suíte completa local).
- Frontend: build, typecheck e lint sem erros; Vitest 195 passed.
- Playwright E2E completo local: 40/52 passed nesta rodada; os 12 restantes
  são o artefato conhecido de `rate_limited` no registro ao rodar a suíte
  inteira sem pausa (todos falham na primeira chamada `apiRegister`, antes
  de qualquer rota alterada por este branch).
- CI da PR: vermelho na primeira tentativa por um teste pré-existente e
  não relacionado (`test_tampered_mac_rejected`, flip do último caractere
  base64 de um token HMAC — o bit alterado às vezes cai em padding não
  usado, então o token tampered decodifica para os mesmos bytes e a
  assinatura ainda bate; falha não-determinística, não toca nada deste
  diff). Rerun ficou verde.
- Durante a primeira tentativa de rodar o E2E completo local, uma falha em
  `cycle-integrity.spec.ts` (anamnese não resolvia para "não se aplica")
  foi rastreada até um processo de backend obsoleto na porta 8010, de pé
  desde o dia anterior — antecedia até o fix de anamnese já mesclado neste
  branch. Matando o processo e subindo um servidor limpo, o teste passou.

## Deploy HML

- Versão: `v1.0.0-ux-flow-review.3` (sha `9264abd`).
- Pipeline: `Build release images` → `Package deploy bundle` →
  `deploy/release/deploy.sh --environment hml` no Jarvis, a partir do
  checkout persistente `/home/palex/ntws/croniu-hml` (preserva
  `.env.hml`; scripts do bundle sincronizados por cima).
- `Release completed: 9264abde09b8868715382917b895b6285ef114a2`, smoke
  público (api/web/admin) passou.

## Evidência ao vivo (organização sintética, removida ao final)

- "Compartilhar link" abre popover sem navegar (`button`, não mais `link`
  para `/clients/intake`).
- Card "Próximo passo" mostrou: *"Continue a preparação de Aluno. Falta:
  avaliação, plano de acompanhamento, ciclo, agenda, rotina."*
- Checklist "Preparar acompanhamento": anamnese resolvida para "Não se
  aplica" (cliente cadastrado manualmente); badges de status com a borda
  direita alinhada em ~1171.7px em todas as linhas, independente do
  tamanho do título (verificado via `getBoundingClientRect`).
- "Mais opções" no portal do cliente: `<details open=false>`, sem
  caixa/fundo no trigger recolhido.
- Modal "Pedir feedback" (toggle de rotina): `position: fixed` computado
  com `inset: 0` — ancorado no viewport, não em um ancestro deslocado.
- "Suas rotinas": estado vazio inalterado (sem rotina ativa não mostra o
  disclosure, como esperado); dados sintéticos removidos depois.

Dados sintéticos criados e removidos nesta rodada: 2 organizações
("UX Smoke Org", "CSS Bug Check Org" — a segunda era resíduo de uma
verificação anterior nesta mesma sessão) + 2 usuários. Contagens
confirmadas de volta ao valor anterior (245 orgs / 249 usuários).
