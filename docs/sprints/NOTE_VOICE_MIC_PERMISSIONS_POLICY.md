# Correção — microfone bloqueado por Permissions-Policy (HML)

**Causa raiz:** o Next.js web enviava `Permissions-Policy: microphone=()`, o que desabilita `getUserMedia` mesmo com permissão do site concedida. O browser responde `NotAllowedError` (mensagem típica: Permission denied by Permissions Policy), e a UI mapeava isso como “libere a permissão”.

**Correção:** `microphone=(self)` em `apps/web/next.config.ts` (camera/geo continuam `()`). Fluxo de gravação com constraints + fallback, mapeamento de erros e lifecycle reforçados.

**Secure context HML:** `https://croniu-hml.ntws.cloud` — HTTPS / secure context.
