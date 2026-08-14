"use client";

import Link from "next/link";
import { BackLink } from "@/components/app/back-link";
import { useAuth } from "@/components/auth/auth-provider";
import { nomenclatureFor } from "@/lib/nomenclature";
import { setupCopyFor } from "@/lib/setup-copy";

type Section = {
  id: string;
  title: string;
  body: string;
  href?: string;
  examples?: { label: string; text: string }[];
};

export default function ManualPage() {
  const { me } = useAuth();
  const terms = nomenclatureFor(me?.organization.profession_code);
  const copy = setupCopyFor(me?.organization.profession_code);
  const code = me?.organization.profession_code || "other";

  const examples = [
    { key: "personal_trainer", label: "Exemplo para personal trainer", service: "Aula individual de 1 hora.", template: "2 aulas por semana — mensal." },
    { key: "private_tutor", label: "Exemplo para professor", service: "Aula de inglês de 1 hora.", template: "2 aulas por semana — mensal." },
    { key: "consultant", label: "Exemplo para consultor", service: "Sessão de consultoria de 1 hora.", template: "Acompanhamento mensal com 4 encontros." },
  ];
  const orderedExamples = [
    ...examples.filter((e) => e.key === code),
    ...examples.filter((e) => e.key !== code),
  ];

  const sections: Section[] = [
    {
      id: "primeiros-passos",
      title: "Primeiros passos",
      body: `Fluxo recomendado: complete o perfil profissional; crie um serviço; crie um modelo de ciclo; gere um link de entrada; receba um cadastro; analise; prepare o ${terms.accompaniment}; crie o ciclo e a agenda; configure ${terms.plan} e rotinas quando fizer sentido. O Croniu não cria dados fictícios por você.`,
    },
    {
      id: "profissao",
      title: "Escolha da profissão",
      body: "A profissão adapta nomes na interface (aluno ou cliente, aula, sessão, plano). Não muda a regra de negócio nem inventa campos. Você pode ajustar depois em Perfil profissional.",
      href: "/app/profile/professional",
    },
    {
      id: "perfil",
      title: "Perfil profissional",
      body: "Área de atuação, especialidade e forma de acompanhamento. Ajuda o Croniu a falar a sua língua, sem alterar serviços ou ciclos já criados.",
      href: "/app/profile/professional",
    },
    {
      id: "servicos",
      title: "Serviços",
      body: "Serviço é o que você oferece: nome, descrição, duração padrão e valor (opcional). Cadastre pelo menos um serviço ativo para criar ciclos. Editar um serviço não altera o valor combinado em ciclos já existentes. Desativar arquiva o serviço — ele deixa de aparecer nas listas ativas, mas ciclos antigos permanecem.",
      href: "/app/services",
      examples: orderedExamples.map((e) => ({ label: e.label, text: e.service })),
    },
    {
      id: "modelos",
      title: "Modelos de ciclo",
      body: "Modelo é uma configuração reutilizável (nome, frequência semanal, período em meses ou dias). Não é o ciclo de um cliente. O serviço é escolhido na criação do ciclo — o modelo atual não guarda serviço nem preço. Alterar um modelo não muda ciclos já gerados.",
      href: "/app/cycle-templates",
      examples: orderedExamples.map((e) => ({ label: e.label, text: e.template })),
    },
    {
      id: "links",
      title: "Links de entrada",
      body: "Em Clientes você gera o link da organização para novos cadastros. O token identifica a organização no servidor; o visitante não escolhe o tenant.",
      href: "/app/clients/intake",
    },
    {
      id: "formularios",
      title: "Formulários",
      body: `O formulário de entrada depende da profissão. Anamnese física automática vale para personal trainer e, em esportes, para musculação. Professor particular usa questionário. Consultor não recebe anamnese de treino. O ${terms.intake_form} não é diagnóstico.`,
    },
    {
      id: "analisar",
      title: "Analisar novos cadastros",
      body: `Novos cadastros aparecem para análise. Você decide o próximo passo do ${terms.accompaniment}. Nada é publicado no portal sem a sua ação.`,
      href: "/app/clients/intake",
    },
    {
      id: "clientes",
      title: `Clientes e ${terms.clients}`,
      body: `Cadastre, abra o detalhe e acompanhe cada ${terms.client}. No detalhe você gera o acesso ao portal, registra avaliações e arquiva quem não atende mais.`,
      href: "/app/clients",
    },
    {
      id: "planos",
      title: "Planos",
      body: `${terms.plan.charAt(0).toUpperCase()}${terms.plan.slice(1)} é o registro do acompanhamento — não um editor de treino ou dieta. Personal e professor: plano de acompanhamento ou estratégia do período. Consultor: plano de ação.`,
    },
    {
      id: "ciclos",
      title: "Ciclos",
      body: "Ciclo continua sendo o período contratado. A visão global ficou em Mais → Ciclos e renovações. Criação e renovação permanecem na ficha do cliente.",
      href: "/app/cycles",
    },
    {
      id: "agenda",
      title: "Agenda",
      body: "A agenda mostra compromissos e, em seção separada, as ações da rotina do dia. Você registra realizada, falta ou cancelada, cria avulsos e resolve conflitos. Gerar o ciclo com agenda evita criar o período sem os compromissos.",
      href: "/app/agenda",
    },
    {
      id: "avaliacoes",
      title: "Avaliações",
      body: "Registros de evolução no detalhe do cliente. Só o que você publicar aparece no portal. Notas privadas não vão para o cliente.",
    },
    {
      id: "rotinas",
      title: "Rotinas",
      body: "Tarefas do profissional: revisões, feedbacks, follow-ups, preparação e itens personalizados. Rotina não é ciclo, não é plano e não é agenda do cliente.",
      href: "/app/routines",
    },
    {
      id: "hoje",
      title: "Tela Hoje",
      body: `Saudação, configuração inicial (enquanto faltar serviço ou modelo), depois a operação do dia: agenda, prioridades e o que precisa de atenção. ${copy.cardDescription}`,
      href: "/app",
    },
    {
      id: "portal",
      title: "Portal",
      body: "O Portal do cliente (acesso por link) mostra o acompanhamento publicado: ciclo, evolução pública e ações como informar pagamento ou pedir renovação. Não se chama mais Meu Ciclo na interface do profissional.",
    },
    {
      id: "ia",
      title: "IA",
      body: "O assistente consulta agenda, ciclos e pendências. Ações de escrita pedem confirmação. Pode estar desativado na organização.",
      href: "/app/assistant",
    },
    {
      id: "assinatura",
      title: "Assinatura",
      body: "Trial e cobrança da plataforma ficam em Mais. Sem acesso ativo, a escrita pode ser bloqueada; a consulta continua conforme a regra de billing.",
    },
    {
      id: "faq",
      title: "Dúvidas frequentes",
      body: "Preciso de modelo para criar ciclo? Na criação inteligente da web, sim. Serviço é obrigatório. Posso explorar o app sem configurar? Sim — só a ação que depende da configuração é bloqueada. Ver depois no card da tela Hoje recolhe o card nesta sessão; a lista completa fica em Mais → Configuração inicial.",
    },
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app/help" label="Ajuda e feedback" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Manual</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Guia do Croniu alinhado ao produto atual. Termos acompanham a sua profissão.
        </p>
      </div>
      <nav aria-label="Capítulos" className="flex flex-wrap gap-2 text-sm">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[var(--color-ink-muted)]"
          >
            {section.title}
          </a>
        ))}
      </nav>
      <ol className="space-y-4">
        {sections.map((section) => (
          <li
            key={section.id}
            id={section.id}
            className="scroll-mt-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          >
            <h2 className="text-base font-semibold text-[var(--color-ink)]">{section.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{section.body}</p>
            {section.examples?.map((ex) => (
              <p key={ex.label} className="mt-2 text-sm text-[var(--color-ink)]">
                <span className="font-medium">{ex.label}: </span>
                <span className="text-[var(--color-ink-muted)]">{ex.text}</span>
              </p>
            ))}
            {section.href ? (
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
