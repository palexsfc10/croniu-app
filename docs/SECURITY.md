# Croniu — Segurança

Documenta **o que existe** e lacunas. Não afirmar segurança sem evidência.  
Produto: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md).

## Classificação de controles

| Controle | Classificação | Evidência / nota |
|----------|---------------|------------------|
| Autenticação org (register/login/logout/me) | implementado | API + testes |
| Hash de senha Argon2id | implementado | `pwdlib` |
| Sessão opaca em DB + cookie HttpOnly | implementado | `sessions` / `platform_sessions` |
| Cookie `Secure` em HTTPS | parcial | depende de env/deploy |
| SameSite | parcial | Lax; cross-site TBD |
| CSRF dual-token | planejado | SameSite mitiga same-site |
| CORS configurável | implementado | settings |
| Headers segurança frontend (CSP completa) | parcial / planejado | básico |
| Rate limiting login / links | planejado | — |
| Logs sem secrets/PII sensível | parcial | política documentada |
| Secrets via env; `.env` fora do Git | implementado (política) | `.env.example` |
| Isolamento multi-tenant | implementado | testes cruzados |
| Invariantes financeiras de ciclo (pago / snapshot) | implementado | política compartilhada em `cycle_intelligence`; rotas `/intelligent` e `/financial` |
| Autorização admin plataforma | implementado | `platform_membership` |
| Bootstrap admin só CLI | implementado | `create_platform_admin` |
| Mutações admin | bloqueadas / parcial | leitura only |
| MFA admin | planejado | antes de produção |
| Links públicos Meu Ciclo | planejado | — |
| Google OAuth tokens | planejado | criptografar; sem log |
| WhatsApp | N/A envio | só URL `wa.me` gerada no client |
| LGPD minimização | parcial | princípios; link público futuro |

## Autenticação (detalhe)

Ver ADR-004. Mensagens genéricas em login. Sem `localStorage` para sessão.

## Multi-tenant

Organização da sessão; filtro em queries; proibido confiar em `organization_id` do cliente.  
Locais e compromissos: UUID conhecido de outro tenant → 404/403; cliente/ciclo/local cruzados recusados.

## Observações internas

Notas de local/compromisso só na área profissional; admin global não lista detalhes individuais de agenda.

## Links públicos (planejado)

Token alta entropia; hash no banco; rate limit; `no-store`; `noindex`; revogação; logs sem token integral.

## Rede

CORS restritivo por ambiente. PostgreSQL não expor publicamente em HML. Segredos só ambiente.

## Ameaças (STRIDE resumido)

| Ameaça | Mitigação atual |
|--------|-----------------|
| Credential stuffing | Argon2id; rate limit **planejado** |
| Session theft | HttpOnly; TTL |
| IDOR cross-tenant | Filtro + testes |
| XSS | React escape; CSP futura |
| CSRF | SameSite; dual-token se cross-site |
| Elevação admin | Membership separado; CLI bootstrap |

## HML / produção

Não implantados nesta linha. Nomes `croniu-hml-*` quando houver. Sem prune em hosts compartilhados.
