import type { Metadata } from "next";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Croniu coleta, usa e protege dados pessoais.",
  robots: { index: true, follow: true },
};

/**
 * Dados da empresa (seção 1) preenchidos a partir do CNPJ 31.892.140/0001-45
 * (consulta pública na Receita Federal, 19/08/2026). O cadastro não tem
 * logradouro/número — só bairro, cidade, UF e CEP — por isso o endereço usa
 * só esses campos. Revisar se o CNPJ for atualizado com endereço completo.
 */
export default function PrivacyPolicyPage() {
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
            Política de Privacidade
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Última atualização: 19 de agosto de 2026.
          </p>
        </div>

        <Section title="1. Quem somos">
          <p>
            O Croniu é um produto de <strong>31.892.140 Pedro Alex Xavier Pequeno</strong> (MEI),
            inscrito no CNPJ <strong>31.892.140/0001-45</strong>, com sede no bairro Pestana, em{" "}
            <strong>Osasco/SP</strong>, CEP 06180-810{" "}(&quot;Croniu&quot;, &quot;nós&quot;). Esta
            política explica quais dados pessoais tratamos, para quê, com quem compartilhamos e
            quais direitos você tem sobre eles, nos termos da Lei Geral de Proteção de Dados
            (Lei nº 13.709/2018 — LGPD).
          </p>
        </Section>

        <Section title="2. Dois papéis diferentes">
          <p>
            O Croniu é usado por <strong>profissionais autônomos</strong> (personal trainers e
            categorias semelhantes) para organizar seus próprios <strong>clientes</strong>. Isso
            significa que tratamos dados em dois papéis distintos:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Somos <strong>controladores</strong> dos dados da conta do profissional (cadastro,
              cobrança, uso da plataforma) e de finalidades próprias, como segurança e o
              funcionamento do assistente de IA.
            </li>
            <li>
              Somos <strong>operadores</strong> dos dados que o profissional cadastra sobre os
              próprios clientes dele — o profissional é o controlador desses dados e é
              responsável por ter base legal para coletá-los e tratá-los.
            </li>
          </ul>
        </Section>

        <Section title="3. Quais dados coletamos">
          <p>
            <strong>Do profissional (conta paga):</strong> nome, e-mail, senha (armazenada com
            hash — nunca em texto puro), e dados necessários à cobrança quando o plano pago é
            contratado (CPF/CNPJ, telefone, CEP e endereço), enviados ao nosso processador de
            pagamentos.
          </p>
          <p>
            <strong>Dos clientes cadastrados pelo profissional:</strong> nome, telefone, e-mail e
            anotações que o profissional registrar. Quando o cliente preenche o formulário de
            anamnese (histórico de atividade física) pelo link enviado pelo profissional, também
            coletamos respostas sobre objetivos, rotina e, em alguns campos, informações que a
            LGPD classifica como <strong>dado pessoal sensível</strong> (relacionadas à saúde).
            Esses campos são sinalizados no próprio formulário.
          </p>
          <p>
            <strong>Dados técnicos:</strong> endereço IP, identificadores de sessão e registros de
            acesso, coletados automaticamente para segurança e funcionamento do serviço.
          </p>
        </Section>

        <Section title="4. Para que usamos e com qual base legal">
          <ul className="list-disc space-y-1 pl-5">
            <li>Prestar o serviço contratado — execução de contrato (LGPD, art. 7º, V).</li>
            <li>
              Processar a assinatura e emitir cobranças, por meio do nosso processador de
              pagamentos — execução de contrato.
            </li>
            <li>Enviar e-mails transacionais (confirmação de conta, redefinição de senha) — execução de contrato.</li>
            <li>
              Operar o assistente de inteligência artificial, quando habilitado pelo profissional,
              para ajudar na gestão dos próprios clientes — execução de contrato.
            </li>
            <li>
              Tratar dados de saúde informados na anamnese — consentimento específico e destacado
              do titular (ou de um responsável legal, quando o titular for criança ou adolescente)
              — LGPD, art. 11.
            </li>
            <li>Prevenir fraude e manter a segurança da plataforma — legítimo interesse (art. 7º, IX).</li>
          </ul>
        </Section>

        <Section title="5. Com quem compartilhamos dados">
          <p>Compartilhamos dados apenas com fornecedores estritamente necessários à operação do serviço:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Asaas</strong> (Brasil) — processamento de pagamentos e cobrança recorrente.</li>
            <li><strong>Resend</strong> (Estados Unidos) — envio de e-mails transacionais.</li>
            <li>
              <strong>OpenAI</strong> (Estados Unidos) — quando o assistente de IA está habilitado
              na conta do profissional, para responder perguntas e organizar informações a pedido
              dele.
            </li>
          </ul>
          <p>
            Não vendemos dados pessoais a terceiros, nem os usamos para publicidade de terceiros.
          </p>
        </Section>

        <Section title="6. Transferência internacional">
          <p>
            Resend e OpenAI processam dados fora do Brasil. Essas transferências ocorrem com base
            nas salvaguardas contratuais desses fornecedores para tratamento de dados pessoais,
            conforme exigido pelo art. 33 da LGPD. Dados enviados ao assistente de IA não são
            usados pelo fornecedor para treinar outros modelos.
          </p>
        </Section>

        <Section title="7. Por quanto tempo guardamos os dados">
          <p>
            Mantemos os dados enquanto a conta estiver ativa e pelo prazo adicional necessário
            para cumprir obrigações legais, fiscais ou contratuais. Ao encerrar uma conta,
            dependendo do histórico financeiro associado, os dados são excluídos ou tornados
            anônimos — de forma que deixam de identificar uma pessoa, mas o histórico financeiro e
            de auditoria pode ser preservado conforme exigido por lei.
          </p>
        </Section>

        <Section title="8. Como protegemos os dados">
          <ul className="list-disc space-y-1 pl-5">
            <li>Senhas armazenadas com função de hash (Argon2id), nunca em texto puro.</li>
            <li>Sessões protegidas por cookies HttpOnly e conexão criptografada (HTTPS).</li>
            <li>Isolamento técnico entre os dados de diferentes profissionais.</li>
            <li>Dados de cartão de pagamento nunca passam pelos nossos servidores — o pagamento é processado diretamente pelo Asaas.</li>
          </ul>
        </Section>

        <Section title="9. Seus direitos">
          <p>Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer momento:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Confirmação de que tratamos seus dados, e acesso a eles;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;</li>
            <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
            <li>Informação sobre com quem compartilhamos seus dados;</li>
            <li>Revogação do consentimento, quando essa for a base legal do tratamento.</li>
          </ul>
          <p>
            Se você é cliente de um profissional que usa o Croniu (e não tem uma conta própria no
            sistema), seu primeiro contato para exercer esses direitos deve ser o próprio
            profissional, que é o controlador desses dados. Também respondemos pedidos enviados
            diretamente a nós pelo canal abaixo.
          </p>
        </Section>

        <Section title="10. Dados de crianças e adolescentes">
          <p>
            Quando um profissional cadastra um cliente menor de idade, o tratamento de dados
            sensíveis (como as respostas da anamnese) depende do consentimento específico e em
            destaque de ao menos um dos pais ou responsável legal, obtido pelo profissional antes
            do preenchimento do formulário.
          </p>
        </Section>

        <Section title="11. Encarregado de Dados (DPO)">
          <p>
            Nosso Encarregado de Proteção de Dados é <strong>Pedro Xavier</strong>, que pode ser
            contatado pelo e-mail{" "}
            <a href="mailto:appcroniu@gmail.com" className="font-semibold text-[var(--color-primary)] underline underline-offset-2">
              appcroniu@gmail.com
            </a>{" "}
            para qualquer dúvida ou solicitação relacionada a esta política ou ao tratamento dos
            seus dados pessoais.
          </p>
        </Section>

        <Section title="12. Alterações desta política">
          <p>
            Podemos atualizar esta política para refletir mudanças no produto ou na legislação.
            Alterações relevantes serão comunicadas dentro do próprio Croniu ou por e-mail. A data
            no topo desta página sempre indica a versão vigente.
          </p>
        </Section>

        <Section title="13. Contato">
          <p>
            Dúvidas sobre esta política podem ser enviadas para{" "}
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
