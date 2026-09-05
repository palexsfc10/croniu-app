"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@/components/ui/icons";

export function CopyableId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — value is still visible and selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-6 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
      aria-label={`Copiar ${label ?? "identificador"}: ${value}`}
      title={value}
    >
      {copied ? <IconCheck className="h-3 w-3" /> : <IconCopy className="h-3 w-3" />}
      <span className="max-w-[9rem] truncate">{value}</span>
    </button>
  );
}
