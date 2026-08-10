# ADR-040 — Billing SaaS via Asaas (padrão Kyvora)

## Contexto

O Croniu precisa de assinatura recorrente. O Kyvora já homologou Asaas (checkout hospedado, trial, webhooks, entitlement, checkout abandonado).

## Decisão

Portar o **padrão** do módulo `billing` do Kyvora para o Croniu, adaptando tenant/auth/UI/deploy, com secrets e conta Asaas independentes.

## Consequências

- Migrations novas a partir de `0012` (não reutilizar 018–021 do Kyvora).  
- Pix do portal do aluno permanece separado.  
- Cartão gated por `BILLING_CARD_ENABLED`.  
- Portal público `/c/{token}` não exige entitlement SaaS do profissional.
