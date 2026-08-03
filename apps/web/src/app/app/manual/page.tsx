"use client";

import Link from "next/link";
import { BackLink } from "@/components/app/back-link";

const sections = [
  {
    title: "Hoje",
    body: "Sua tela inicial. Mostra aulas do dia, ciclos encerrando, pedidos de renovação e pagamentos informados pelos clientes. Use as prioridades para agir no que mais importa agora.",
  },
  {
    title: "Agenda",
    body: "Compromissos do dia. Crie aulas avulsas, veja conflitos de horário e atualize status (realizada, falta, cancelada).",
  },
  {
    title: "Clientes",
    body: "Cadastre e abra o detalhe de cada cliente. No detalhe você gera o link do Meu Ciclo, registra avaliações de evolução (rascunho/publicação no portal) e pode arquivar quem não atende mais.",
  },
  {
    title: "Serviços",
    body: "O que você oferece e o valor por aula. Toque em um serviço para editar. Excluir arquiva o serviço — ciclos já criados mantêm o valor combinado.",
    href: "/app/services",
  },
  {
    title: "Ciclos",
    body: "Contrato de aulas com um cliente: datas, dias da semana, quantidade e valor. Crie a partir de cliente + serviço + modelo. No detalhe você edita, ajusta valores, prepara WhatsApp de renovação ou exclui (cancela) o ciclo.",
    href: "/app/cycles",
  },
  {
    title: "Modelos de ciclo",
    body: "Em Mais → Modelos. Definem frequência semanal e duração (ex.: 1 mês, 2× por semana) para acelerar a criação de ciclos.",
  },
  {
    title: "Meu Ciclo (aluno)",
    body: "Link secreto do cliente. Nele o aluno vê o ciclo, a seção Sua evolução (só avaliações publicadas — nunca notas privadas), pede renovação e informa “Já paguei”. Você confirma ou rejeita em Pagamentos / Hoje.",
  },
  {
    title: "Assistente",
    body: "Em Mais → Assistente. Consultas em linguagem natural sobre agenda, ciclos, recebimentos e avaliações. Ações de escrita pedem confirmação explícita. Pode estar desativado (AI_ENABLED).",
    href: "/app/assistant",
  },
  {
    title: "Pagamentos e Pix",
    body: "Em Mais → Preferências de pagamento configure Pix ou link https. Informes do cliente aparecem para revisão. Confirmar pagamento marca o recebimento; não há gateway automático no MVP.",
  },
  {
    title: "Recebimentos",
    body: "Valores a receber ligados a ciclos. Marque como pago quando o dinheiro entrar. Ao excluir um ciclo, recebimentos em aberto são cancelados; pagos permanecem no histórico.",
  },
] as const;

export default function ManualPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app" label="Hoje" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Manual</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Guia rápido do Croniu para o dia a dia do profissional.
        </p>
      </div>
      <ol className="space-y-4">
        {sections.map((section) => (
          <li
            key={section.title}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          >
            <h2 className="text-base font-semibold text-[var(--color-ink)]">{section.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{section.body}</p>
            {"href" in section && section.href ? (
              <Link
                href={section.href}
                className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)]"
              >
                Abrir
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
