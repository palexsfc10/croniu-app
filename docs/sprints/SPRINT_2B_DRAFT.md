# Sprint 2B — Rascunho (Agenda core)

> # NÃO AUTORIZADA
>
> Este documento é **rascunho**. Roadmap ≠ autorização.  
> Agentes **não** devem implementar este escopo até o estado mudar para `AUTORIZADA` por responsável explícito.
>
> Branch local preparada (sem implementação): `feature/sprint-2b-agenda-core`

**Estado:** RASCUNHO · **NÃO AUTORIZADA**

## Objetivo (candidato)

Permitir ao profissional organizar a rotina do dia com agenda interna (locais + compromisso único), com timezone da organização e conflitos básicos — sem Google nem Meu Ciclo.

## Escopo candidato aprovado conceitualmente

- Locais de atendimento  
- Compromisso **único** (sem recorrência nesta sprint)  
- Agenda (nav + telas)  
- Timezone IANA da organização (default `America/Sao_Paulo`; instantes em UTC)  
- Conflitos básicos de horário  
- Integração da Agenda na navegação e na central Hoje  

## Fora do escopo (explícito)

- Recorrência de compromissos  
- Google Calendar  
- Página Meu Ciclo  
- Sincronização com calendários externos  
- WhatsApp automático  
- Produção / DNS / HML nesta sprint  

## Regras

- Multi-tenancy intacto  
- Sem migration sem autorização da sprint  
- Wordmark homologado protegido  
- Evento externo (futuro) **não** vira cliente/ciclo automaticamente  

## UX

Incluir **Agenda** na nav somente com rotas reais (sem botão morto).

## Migrations

Provável (locations, appointments, organization.timezone) — **somente** se a sprint for autorizada.

## Autorização

| Campo | Valor |
|-------|-------|
| Autorizado por | — |
| Data | — |
| Status | **NÃO AUTORIZADA** |
