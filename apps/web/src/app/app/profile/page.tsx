"use client";

import { SettingsGroup, SettingsRow } from "@/components/app/settings-list";
import { InstallCroniuRow } from "@/components/pwa/install-croniu-row";
import {
  IconActivity,
  IconBriefcase,
  IconClipboardList,
  IconLayers,
  IconLifeBuoy,
  IconMapPin,
  IconRefreshCw,
  IconUser,
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

      <SettingsGroup title="Conta e configurações">
        <SettingsRow
          href="/app/settings"
          title="Conta e configurações"
          description="Minha conta, Workspace, plano e assinatura, ajuda e privacidade."
          Icon={IconUser}
        />
      </SettingsGroup>

      <div className="grid gap-6 md:grid-cols-2 md:gap-5">
        <SettingsGroup title="Operação">
          <SettingsRow
            href="/app/services"
            title="Serviços"
            description="O que você oferece, duração e valor."
            Icon={IconBriefcase}
          />
          <SettingsRow
            href="/app/cycles"
            title="Ciclos e renovações"
            description="Visão global de vigências, alertas e decisões de renovação."
            Icon={IconRefreshCw}
          />
          <SettingsRow
            href="/app/routines"
            title="Rotinas"
            description="Atrasadas, hoje, próximas e concluídas."
            Icon={IconClipboardList}
          />
          <SettingsRow
            href="/app/accompaniment"
            title="Acompanhamentos"
            description="Clientes pendentes de evolução e histórico registrado."
            Icon={IconActivity}
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
        </SettingsGroup>
      </div>

      <SettingsGroup title="Aplicativo">
        <InstallCroniuRow />
      </SettingsGroup>
    </div>
  );
}
