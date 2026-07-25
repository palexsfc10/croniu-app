# Croniu — Visão do Produto

> **Documento histórico.** Fonte oficial atualizada: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) e [`PROJECT_STATE.md`](./PROJECT_STATE.md).  
> A seção “Escopo desta fundação” abaixo **não** descreve mais o estado do código (Sprint 2A entregue).

## Identidade

**Produto:** Croniu  
**Empresa:** NTWS Labs  
**Posicionamento:** Assistente de rotina, ciclos e renovações para profissionais que trabalham com clientes recorrentes.  
**Slogan provisório:** “Sua rotina. Seus ciclos. Tudo sob controle.”

## Problema

Profissionais autônomos controlam clientes, agenda, pacotes e renovações com WhatsApp, agenda do celular, planilhas e memória. Isso gera ciclos encerrados sem percepção, atraso na renovação, perda de receita e carga mental constante.

## Solução

SaaS mobile-first (PWA) que organiza clientes, agenda, locais, ciclos contratados, pagamentos manuais e consultas de renovação — priorizando o que precisa de atenção **hoje**, não dashboards decorativos.

## Público inicial e evolução

- **Lançamento:** personal trainers.
- **Arquitetura:** multiprofissional (dança, artes marciais, música, idiomas, aulas particulares, pilates/yoga, treinadores esportivos e outros com clientes recorrentes).
- **Fora do posicionamento:** prescrição de treinos, exercícios, dietas ou avaliações físicas.

## Princípios de produto

1. Reduzir carga mental do profissional.
2. Mostrar ações prioritárias do dia.
3. Ciclos e renovações como núcleo de valor.
4. Nomenclatura interna neutra; rótulos de UI adaptáveis por segmento.
5. Cliente sem login no MVP; acesso via link seguro “Meu Ciclo”.
6. Multi-tenant desde o dia zero; preparado para equipes no futuro.
7. Independente de outros produtos NTWS Labs (ex.: Kyvora).

## Critério de sucesso da validação

O profissional usar o Croniu durante um ciclo real e declarar que sentiria falta ao voltar para planilha, agenda e WhatsApp — não apenas cadastrar-se.

## Escopo desta fundação

Documentação, arquitetura, autenticação, organização multi-tenant e painel protegido com estados vazios. Módulos de clientes, ciclos, agenda, renovação e financeiro completos ficam para sprints seguintes.
