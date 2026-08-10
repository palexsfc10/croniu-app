# Assistente Croniu — UX premium

## Diagnóstico visual anterior (pré-sprint)

A tela `/app/assistant` era um formulário vertical:

- cabeçalho serifado grande (“Assistente”) + parágrafo permanente de explicação;
- área de mensagens em caixa com borda única;
- bolhas genéricas sem hierarquia de conversa (assistente também “cardificado”);
- composer embutido no card, sem tratamento claro de teclado/safe-area;
- propostas de ação renderizadas como bloco interno da bolha;
- auto-scroll sempre forçado.

## Decisões de UX

1. **Cabeçalho compacto** — voltar, avatar Croniu, título, subtítulo contextual, nova conversa.
2. **Estado vazio** — saudação + valor + chips; a frase de confirmação aparece só aqui.
3. **Chat real** — usuário à direita (≤82% mobile), assistente à esquerda (≤88%), desktop centrado ~720–860px.
4. **Propostas** — componente próprio (`ProposalCard`) com badge de estado e botões só em `pending`.
5. **Composer fixo** — acima da bottom nav, `100dvh`/`h-dvh`, `safe-area-inset-bottom`, textarea auto-grow (~5 linhas).
6. **Scroll inteligente** — stick-to-bottom só se o usuário estiver perto do fim; botão “Ir para o final”.
7. **Motion** — entrada leve, typing dots, pulso de gravação; `prefers-reduced-motion` respeitado.
8. **Voz** — microfone só com texto vazio; gravação tap-to-start/stop; transcrição revisável; sem auto-envio.

## Estados de proposta (UI)

| Status | Badge |
|--------|--------|
| pending | Aguardando sua confirmação |
| executing | Concluindo… |
| executed / confirmed path | Ação concluída |
| cancelled | Cancelada |
| expired | Proposta expirada |
| failed | Não foi possível concluir |

## Acessibilidade

- alvos ≥ 44×44;
- labels em microfone/enviar/parar/cancelar;
- `aria-live` para erros e status de gravação;
- waveform não é a única indicação (texto + cronômetro + ponto vermelho).
