"use client";

import { useState, type ReactNode } from "react";
import { useIsHmlOrDevEnvironment } from "@/lib/environment";
import { PageTitle } from "@/components/ui/page-title";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/text-area";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/ui/block-error";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/ui/list-card";
import { TableShell, Th, Tr, Td } from "@/components/ui/table-shell";
import { ToastStack, useToasts } from "@/components/ui/toast";
import {
  IconActivity,
  IconAlertCircle,
  IconBanknote,
  IconCalendarDays,
  IconCheck,
  IconHome,
  IconRefreshCw,
  IconSparkles,
  IconUsersRound,
} from "@/components/ui/icons";

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] border border-black/5"
        style={{ background: `var(${varName})` }}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[var(--color-ink)]">{name}</p>
        <p className="truncate font-mono text-[10px] text-[var(--color-ink-muted)]">{varName}</p>
      </div>
    </div>
  );
}

function Block({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="space-y-3 border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const BADGE_TONES: BadgeTone[] = ["primary", "success", "warning", "danger", "info", "neutral", "progress", "ai"];

const ICON_TILE_TONES = ["primary", "ai", "success", "warning", "danger", "info", "progress", "neutral"] as const;

export default function DesignSystemPageClient() {
  const allowed = useIsHmlOrDevEnvironment();
  const { toasts, push } = useToasts();
  const [switchOn, setSwitchOn] = useState(true);
  const [segment, setSegment] = useState<"a" | "b" | "c">("a");

  if (!allowed) {
    return (
      <div className="animate-fade-up">
        <EmptyState
          title="Não disponível"
          description="A referência do Design System só existe em desenvolvimento e HML."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-8 pb-16">
      <header className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <Badge tone="warning">Somente dev/HML — nunca exposta em PRD</Badge>
          <Badge tone="ai">Piloto: direção mais viva — Início, Cliente 360°, Cronia</Badge>
        </div>
        <PageTitle>Design System Croniu</PageTitle>
        <p className="max-w-2xl text-sm text-[var(--color-ink-muted)]">
          A gramática visual oficial do produto: tokens semânticos, componentes compartilhados e as
          regras que os unem. Esta página é a fonte de verdade para validar qualquer tela nova antes
          de propagar — se algo aqui parecer errado, o token/componente é o lugar certo para corrigir,
          nunca a tela individual. Itens marcados &ldquo;piloto&rdquo; abaixo são a direção aprovada
          em avaliação em três superfícies antes de propagar ao resto do produto.
        </p>
      </header>

      <Block
        title="Paleta"
        description="Primitivos alimentam papéis semânticos — nenhuma tela referencia um primitivo diretamente."
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Swatch name="Primary" varName="--color-primary" />
          <Swatch name="Primary hover" varName="--color-primary-hover" />
          <Swatch name="Primary subtle" varName="--color-primary-subtle" />
          <Swatch name="Accent" varName="--color-accent" />
          <Swatch name="IA" varName="--color-ai" />
          <Swatch name="IA subtle" varName="--color-ai-subtle" />
          <Swatch name="Progresso" varName="--color-progress" />
          <Swatch name="Sucesso" varName="--color-success" />
          <Swatch name="Atenção" varName="--color-warning" />
          <Swatch name="Erro" varName="--color-danger" />
          <Swatch name="Informação" varName="--color-info" />
          <Swatch name="Neutro" varName="--color-neutral" />
          <Swatch name="Financeiro · positivo" varName="--color-financial-positive" />
          <Swatch name="Financeiro · vencido" varName="--color-financial-overdue" />
          <Swatch name="Renovação · atrasada" varName="--color-renewal-overdue" />
          <Swatch name="Renovação · resolvida" varName="--color-renewal-resolved" />
          <Swatch name="Superfície" varName="--color-surface" />
          <Swatch name="Superfície elevada" varName="--color-surface-elevated" />
          <Swatch name="Fundo" varName="--color-bg" />
          <Swatch name="Borda" varName="--color-border" />
          <Swatch name="Elétrico (piloto)" varName="--color-electric" />
          <Swatch name="Elétrico deep (piloto)" varName="--color-electric-deep" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="h-16 rounded-[var(--radius-lg)]" style={{ background: "var(--gradient-ai)" }} />
            <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">
              <code className="font-mono">--gradient-ai</code> — fundo de painel da Cronia (deliberadamente pálido, para não competir com texto por cima). Nunca em nada fora dela.
            </p>
          </div>
          <div>
            <div className="h-16 rounded-[var(--radius-lg)]" style={{ background: "var(--gradient-ai-vivid)" }} />
            <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">
              <code className="font-mono">--gradient-ai-vivid</code> — orbe, glow e ícones-herói da Cronia. O ciano é um acento de apoio só aqui; nunca vira cor estrutural.
            </p>
          </div>
        </div>
      </Block>

      <Block title="Tipografia" description="Uma escala, um peso de destaque por nível.">
        <div className="space-y-2.5">
          <PageTitle>Título de página (H1)</PageTitle>
          <h2 className="h-display text-xl font-semibold text-[var(--color-ink)]">Título de seção (H2)</h2>
          <h3 className="text-base font-semibold text-[var(--color-ink)]">Subtítulo (H3)</h3>
          <p className="text-sm text-[var(--color-ink)]">
            Corpo de texto padrão — <code className="font-mono text-xs">text-sm</code>, usado em ~800
            lugares no app. É o tamanho de leitura confortável, não o menor disponível.
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">Corpo secundário/muted — mesma altura, cor reduzida.</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Legenda/rótulo auxiliar — <code className="font-mono">text-xs</code>. Reservar para
            metadados curtos (datas, contagens), nunca para o conteúdo principal de uma linha.
          </p>
        </div>
        <div className="border-t border-[var(--color-border)] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]">
            Número-herói (<code className="font-mono normal-case">.text-number-hero</code>) — piloto
          </p>
          <p className="mt-1 text-4xl text-[var(--color-ink)] text-number-hero">32</p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Estático — nunca conta/anima. Reservado ao único número mais importante de uma tela
            (o KPI de destaque em Início, por exemplo). Legível de imediato, sem competir com o
            texto ao redor.
          </p>
        </div>
      </Block>

      <Block title="Cabeçalho de seção" description="Ícone tonal + título + descrição + ação — a fileira que toda página repetia à mão.">
        <SectionHeader
          icon={<IconActivity className="h-5 w-5" />}
          tone="progress"
          title="Evolução do cliente"
          description="Últimas 4 avaliações registradas"
          action={
            <Button size="sm" variant="ghost">
              Ver tudo
            </Button>
          }
        />
      </Block>

      <Block title="Ícones" description="Uma única família (stroke, 1.75px, 20px base) — nunca misturar com outra biblioteca.">
        <div className="flex flex-wrap gap-4">
          {[IconHome, IconCalendarDays, IconUsersRound, IconBanknote, IconRefreshCw, IconSparkles, IconActivity, IconAlertCircle, IconCheck].map(
            (Icon, i) => (
              <Icon key={i} className="h-5 w-5 text-[var(--color-ink-muted)]" />
            ),
          )}
        </div>
        <p className="text-sm font-medium text-[var(--color-ink)]">Fundo tonal (`.icon-tile`)</p>
        <div className="flex flex-wrap gap-3">
          {ICON_TILE_TONES.map((tone) => (
            <span key={tone} className={`icon-tile icon-tile-${tone} h-10 w-10`}>
              <IconSparkles className="h-5 w-5" />
            </span>
          ))}
        </div>
        <p className="text-sm font-medium text-[var(--color-ink)]">
          Ícone-herói (`.icon-tile-hero`) — piloto
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="icon-tile icon-tile-hero h-10 w-10">
            <IconSparkles className="h-5 w-5" />
          </span>
          <p className="max-w-md text-xs text-[var(--color-ink-muted)]">
            Gradiente vívido + glow colorido — reservado a um único ícone por tela: a Cronia, ou o
            KPI de destaque. Todo o resto ao redor continua no tile tonal plano de sempre.
          </p>
        </div>
      </Block>

      <Block title="Botões">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="outline-danger">Outline danger</Button>
          <Button variant="success">Success</Button>
          <Button variant="ai">
            <IconSparkles className="h-4 w-4" />
            IA
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Pequeno</Button>
          <Button size="md">Padrão</Button>
          <Button loading>Carregando</Button>
          <Button disabled>Desabilitado</Button>
          <IconButton icon={<IconAlertCircle className="h-5 w-5" />} aria-label="Alerta" variant="outline" />
          <IconButton icon={<IconCheck className="h-5 w-5" />} aria-label="Confirmar" variant="primary" />
        </div>
      </Block>

      <Block title="Campos">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome" placeholder="Ana Souza" />
          <TextField label="Com erro" defaultValue="valor inválido" error="Esse campo é obrigatório." />
          <Select label="Serviço" hint="Usado em ciclos, agenda e financeiro.">
            <option>Pilates</option>
            <option>Musculação</option>
            <option>Avaliação física</option>
          </Select>
          <TextArea label="Observações" placeholder="Anotações internas…" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Switch checked={switchOn} onCheckedChange={setSwitchOn} label="Notificações" />
          <div className="flex gap-1">
            {(["a", "b", "c"] as const).map((v) => (
              <SegmentedToggle key={v} active={segment === v} onClick={() => setSegment(v)}>
                {v.toUpperCase()}
              </SegmentedToggle>
            ))}
          </div>
        </div>
      </Block>

      <Block title="Badges">
        <div className="flex flex-wrap gap-2">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Avatar initials="AS" size="sm" />
          <Avatar initials="AS" size="md" />
          <Avatar initials="AS" size="lg" />
        </div>
      </Block>

      <Block title="Superfícies" description="Elevação é proporcional ao significado — a maioria das telas fica em bg/surface planos.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
            <p className="text-sm font-medium">surface + shadow-sm</p>
            <p className="text-xs text-[var(--color-ink-muted)]">O card padrão em toda a lista/tabela.</p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
            <p className="text-sm font-medium">surface-elevated</p>
            <p className="text-xs text-[var(--color-ink-muted)]">1–2 blocos por tela, nunca todos.</p>
          </div>
          <div className="surface-ai rounded-[var(--radius-lg)] p-4">
            <p className="text-sm font-medium">surface-ai</p>
            <p className="text-xs text-[var(--color-ink-muted)]">Só entradas/painéis da Cronia.</p>
          </div>
          <div className="card-rail card-rail-warning rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-sm font-medium">card-rail-warning</p>
            <p className="text-xs text-[var(--color-ink-muted)]">Trilho de acento lateral por tom.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-briefing hover-lift rounded-[var(--radius-lg)] p-4 shadow-sm">
            <p className="text-sm font-medium">surface-briefing (dominante) — piloto</p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              O ÚNICO momento visual dominante por tela — Início e Cliente 360°. Sempre brand
              (indigo), nunca AI-violeta: é dado real, não algo que a Cronia analisou.
            </p>
          </div>
          <div className="tap-feedback cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
            <p className="text-sm font-medium">.tap-feedback (toque neste card) — piloto</p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Retorno tátil sutil (scale 0.97) ao toque, coberto por{" "}
              <code className="font-mono">prefers-reduced-motion</code>.
            </p>
          </div>
        </div>
      </Block>

      <Block title="Tabela (desktop) e card (mobile)" description="Um único wrapper de tabela e de card — não uma tabela por tela.">
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Situação</Th>
                <Th>Financeiro</Th>
              </Tr>
            </thead>
            <tbody>
              <Tr>
                <Td className="font-medium text-[var(--color-ink)]">Ana Souza</Td>
                <Td>
                  <Badge tone="success">Em dia</Badge>
                </Td>
                <Td className="tabular-nums">R$ 300,00</Td>
              </Tr>
              <Tr>
                <Td className="font-medium text-[var(--color-ink)]">Beto Lima</Td>
                <Td>
                  <Badge tone="danger">Atrasado</Badge>
                </Td>
                <Td className="tabular-nums text-[var(--color-danger)]">R$ 1.240,00</Td>
              </Tr>
            </tbody>
          </table>
        </TableShell>
        <ListCard className="block px-3.5 py-3">
          <p className="font-semibold text-[var(--color-ink)]">Ana Souza</p>
          <p className="text-sm text-[var(--color-ink-muted)]">Pilates · próxima sessão amanhã</p>
        </ListCard>
      </Block>

      <Block title="Estados — carregando, vazio, erro" description="Nunca texto cru de 'Carregando…' — sempre um destes três.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <EmptyState title="Nada por aqui" description="Quando não há dados reais para mostrar." />
          <BlockError message="Não foi possível carregar." onRetry={() => {}} />
        </div>
      </Block>

      <Block
        title="Cronia"
        description={
          'Assistente do Croniu. Violeta é exclusivo dela — nunca usado fora dela. Nome sempre "Cronia"; "Assistente do Croniu" só como descritor, quando precisa explicar.'
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ai">Sugestão da Cronia</Badge>
          <Button variant="ai">
            <IconSparkles className="h-4 w-4" />
            Perguntar à Cronia
          </Button>
          <span className="icon-tile icon-tile-ai h-10 w-10">
            <IconSparkles className="h-5 w-5" />
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="assistant-orb-glow" aria-hidden />
            <span className="assistant-orb relative z-[1] flex h-14 w-14 items-center justify-center rounded-full">
              <IconSparkles className="h-6 w-6 text-white" aria-hidden />
            </span>
          </div>
          <p className="max-w-md text-xs text-[var(--color-ink-muted)]">
            O orbe — entrada global da Cronia, sempre em{" "}
            <code className="font-mono">--gradient-ai-vivid</code>. O halo respira lentamente e
            para sob <code className="font-mono">prefers-reduced-motion</code>; o ícone em si
            nunca anima, então permanece legível de qualquer forma.
          </p>
        </div>
      </Block>

      <Block title="Motion" description="Sutil e opcional — respeita prefers-reduced-motion em toda a base.">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => push("Alterações salvas.", "success")}>Disparar toast de sucesso</Button>
          <Button variant="outline-danger" onClick={() => push("Não foi possível salvar.", "danger")}>
            Disparar toast de erro
          </Button>
        </div>
        <p className="text-xs text-[var(--color-ink-muted)]">
          `.animate-fade-up` (usado nesta página), `assistant-msg-in`, `assistant-typing`,
          `.hover-lift`, `.tap-feedback` — todos neutralizados sob{" "}
          <code className="font-mono">prefers-reduced-motion: reduce</code>.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-ink-muted)]">
          <li>Números não contam/animam — sempre estáticos, fortes, legíveis de imediato.</li>
          <li>Entrada suave (fade), hover nos poucos cards-herói, abertura da Cronia, confirmação de ações.</li>
          <li>Nada além disso — motion é o tempero, não o prato.</li>
        </ul>
      </Block>

      <ToastStack toasts={toasts} />
    </div>
  );
}
