# Croniu Web

Aplicação dos profissionais (PWA mobile-first).

```bash
cd apps/web
npm ci
npm run dev
```

http://localhost:3000

Variável principal: `API_PROXY_TARGET` (ex.: `http://127.0.0.1:8010`) — o browser chama `/api` no mesmo host (rewrite), o que evita CORS e funciona no celular via IP da rede.

Documentação geral na raiz do monorepo e em `docs/`.
