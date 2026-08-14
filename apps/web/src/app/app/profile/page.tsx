"use client";

import { SettingsGroup, SettingsRow } from "@/components/app/settings-list";
import {
  IconBriefcase,
  IconClipboardList,
  IconLayers,
  IconLifeBuoy,
  IconMapPin,
  IconSliders,
} from "@/components/ui/icons";

export default function MorePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-up md:max-w-3xl">
      <header className="space-y-1">
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Mais</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Configure como o Croniu funciona para você.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 md:gap-5">
        <SettingsGroup title="Configurações do trabalho">
          <SettingsRow
            href="/app/profile/professional"
            title="Perfil profissional"
            description="Área de atuação, especialidade e forma de acompanhamento."
            Icon={IconBriefcase}
          />
          <SettingsRow
            href="/app/services"
            title="Serviços"
            description="O que você oferece, duração e valor."
            Icon={IconBriefcase}
          />
          <SettingsRow
            href="/app/cycle-templates"
            title="Modelos de ciclo"
            description="Frequência e período reutilizáveis."
            Icon={IconLayers}
          />
          <SettingsRow
            href="/app/setup"
            title="Configuração inicial"
            description="Serviço e modelo mínimos para começar."
            Icon={IconClipboardList}
          />
          <SettingsRow
            href="/app/manual"
            title="Manual"
            description="Como o Croniu funciona hoje."
            Icon={IconLifeBuoy}
          />
        </SettingsGroup>

        <SettingsGroup title="Preferências">
          <SettingsRow
            href="/app/locations"
            title="Locais de atendimento"
            description="Onde você atende seus clientes."
            Icon={IconMapPin}
          />
          <SettingsRow
            href="/app/preferences"
            title="Preferências gerais"
            description="Fuso horário e pagamentos no portal."
            Icon={IconSliders}
          />
        </SettingsGroup>
      </div>

      <SettingsGroup title="Suporte">
        <SettingsRow
          href="/app/help"
          title="Ajuda e feedback"
          description="Manual rápido e envio de sugestões."
          Icon={IconLifeBuoy}
        />
      </SettingsGroup>
    </div>
  );
}
