import type { Metadata } from "next";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Condições de uso do Croniu.",
  robots: { index: true, follow: true },
};

/**
 * Dados da empresa (seção 1) e comarca do foro (seção 11) preenchidos a
 * partir do CNPJ 31.892.140/0001-45 (consulta pública na Receita Federal,
 * 19/08/2026). O cadastro não tem logradouro/número — só bairro, cidade, UF
 * e CEP — por isso o endereço usa só esses campos. Revisar se o CNPJ for
 * atualizado com endereço completo.
 */
export default function TermsOfUsePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-10">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-ink-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
        >
          Voltar
        </Link>
        <BrandWordmark size="md" surface="light" />
      </header>

      <article className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-[var(--color-ink)] sm:text-3xl">
            Termos de Uso
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Última atualização: 19 de agosto de 2026.
          </p>
        </div>

        <Section title="1. Sobre o Croniu">
          <p>
            O Croniu é um serviço de gestão de rotina, clientes e ciclos de atendimento, oferecido
            por <strong>31.892.140 Pedro Alex Xavier Pequeno</strong> (MEI), CNPJ{" "}
            <strong>31.892.140/0001-45</strong>, com sede no bairro Pestana, em{" "}
            <strong>Osasco/SP</strong>, CEP 06180-810
            {" "}(&quot;Croniu&quot;, &quot;nós&quot;), voltado a profissionais autônomos com clientes
            recorrentes. Ao criar uma conta, você concorda com estes Termos e com a nossa{" "}
            <Link href="/privacidade" className="font-semibold text-[var(--color-primary)] underline underline-offset-2">
              Política de Privacidade
            </Link>
            .
          </p>
        </Section>

        <Section title="2. Cadastro e responsabilidades do profissional">
          <p>
            Você é responsável por manter seus dados de cadastro corretos e atualizados, e por
            proteger sua senha. Ao cadastrar clientes no Croniu, você atua como controlador desses
            dados perante a LGPD — ou seja, é sua responsabilidade ter base legal para coletar e
            tratar os dados dos seus próprios clientes (nome, contato, respostas de anamnese e
            demais informações que você registrar).
          </p>
        </Section>

        <Section title="3. Período de teste e cobrança">
          <p>
            Novas contas começam com um período de teste gratuito de 7 dias. A primeira cobrança
            só ocorre ao final desse período, e você será avisado da data exata dentro do próprio
            Croniu antes que isso aconteça. Após o teste, a assinatura é cobrada mensalmente pelo
            valor vigente no momento da contratação, processada pelo nosso parceiro de pagamentos
            (Asaas).
          </p>
          <p>
            Quando um desconto de indicação é aplicado no cadastro, ele permanece vinculado à
            conta enquanto a assinatura estiver ativa ou for reativada após um cancelamento. Esse
            desconto é uma condição comercial da sua conta — não é uma garantia de que o preço
            base do plano, ou o próprio produto, permanecerão inalterados para sempre.
          </p>
        </Section>

        <Section title="4. Cancelamento">
          <p>
            Você pode cancelar sua assinatura a qualquer momento entrando em contato pelo e-mail{" "}
            <a href="mailto:appcroniu@gmail.com" className="font-semibold text-[var(--color-primary)] underline underline-offset-2">
              appcroniu@gmail.com
            </a>{" "}
            ou pelo WhatsApp (11) 98450-8374. Ao cancelar, seu acesso
            permanece disponível até o fim do período já pago, e seus dados são mantidos conforme
            descrito na nossa Política de Privacidade.
          </p>
        </Section>

        <Section title="5. Uso aceitável">
          <p>
            Você concorda em usar o Croniu apenas para fins lícitos, e em não inserir no sistema
            dados que você não tenha o direito de tratar. Não é permitido tentar acessar dados de
            outras contas, sobrecarregar a plataforma deliberadamente, ou usar o assistente de IA
            para gerar conteúdo ilegal ou prejudicial a terceiros.
          </p>
        </Section>

        <Section title="6. Natureza do serviço — não substitui julgamento profissional">
          <p>
            O Croniu é uma ferramenta de organização e gestão. Ele não prescreve treinos,
            exercícios, dietas ou avaliações físicas, e as sugestões do assistente de IA não
            substituem o julgamento técnico do profissional responsável pelo atendimento. Cabe a
            você, profissional, cumprir as normas do seu conselho de classe (quando aplicável) na
            condução do seu trabalho.
          </p>
        </Section>

        <Section title="7. Propriedade intelectual">
          <p>
            O Croniu, sua marca e seu software são de propriedade de{" "}
            <strong>Pedro Alex Xavier Pequeno</strong>. Você mantém a propriedade sobre os dados
            que insere no sistema.
          </p>
        </Section>

        <Section title="8. Disponibilidade e suporte">
          <p>
            Fazemos esforços razoáveis para manter o serviço disponível, mas não garantimos
            operação ininterrupta. Manutenções programadas e eventuais indisponibilidades serão
            comunicadas quando possível.
          </p>
        </Section>

        <Section title="9. Limitação de responsabilidade">
          <p>
            O Croniu não se responsabiliza por decisões profissionais tomadas com base nas
            informações organizadas na plataforma, nem por prejuízos decorrentes do uso indevido
            do serviço por terceiros com acesso não autorizado à sua conta.
          </p>
        </Section>

        <Section title="10. Alterações destes termos">
          <p>
            Podemos atualizar estes Termos para refletir mudanças no produto ou na legislação.
            Alterações relevantes serão comunicadas dentro do próprio Croniu ou por e-mail antes
            de entrarem em vigor.
          </p>
        </Section>

        <Section title="11. Lei aplicável e foro">
          <p>
            Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de{" "}
            <strong>Osasco/SP</strong> para dirimir eventuais controvérsias, com renúncia a
            qualquer outro, por mais privilegiado que seja.
          </p>
        </Section>

        <Section title="12. Contato">
          <p>
            Dúvidas sobre estes Termos podem ser enviadas para{" "}
            <a href="mailto:appcroniu@gmail.com" className="font-semibold text-[var(--color-primary)] underline underline-offset-2">
              appcroniu@gmail.com
            </a>{" "}
            ou pelo telefone/WhatsApp (11) 98450-8374.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        {children}
      </div>
    </section>
  );
}
