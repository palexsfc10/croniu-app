"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconMic, IconSend, IconStop, IconX } from "@/components/ui/icons";
import { formatElapsed } from "./use-voice-recorder";
import type { AssistantConversation } from "./use-assistant-conversation";

/** The composer footer — recording UI, textarea + voice/send, mic options
 * menu, and the voice-availability/limit notices below it. Identical
 * across the full page, desktop panel, and mobile overlay. */
export function Composer({ conversation }: { conversation: AssistantConversation }) {
  const {
    textareaRef,
    micMenuRef,
    micLongPressRef,
    input,
    setInput,
    fromVoice,
    setFromVoice,
    busy,
    disabled,
    recording,
    voice,
    voiceUiPhase,
    voiceAvailable,
    voiceNotice,
    setVoiceNotice,
    voicePrivacyAck,
    voiceAutoSend,
    setAutoSendPreference,
    micMenuOpen,
    setMicMenuOpen,
    setThreadsOpen,
    status,
    statusLoaded,
    phase,
    ackVoicePrivacy,
    handleMicClick,
    cancelRecording,
    finishRecording,
    onComposerKeyDown,
    onSubmit,
  } = conversation;

  return (
    <div className="shrink-0 border-t border-[var(--color-border)]/70 bg-[var(--color-surface)]/98 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-[720px]">
        {voiceNotice ? (
          <div className="mb-2 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-ai-subtle)] px-3 py-2 text-xs text-[var(--color-ink)]">
            <p className="flex-1">{voiceNotice}</p>
            {!voicePrivacyAck ? (
              <Button
                type="button"
                className="min-h-9 px-3 text-xs"
                onClick={() => {
                  ackVoicePrivacy();
                  setVoiceNotice(null);
                  void voice.start();
                }}
              >
                Entendi
              </Button>
            ) : (
              <button
                type="button"
                className="min-h-9 min-w-9 text-[var(--color-ink-muted)]"
                aria-label="Fechar aviso"
                onClick={() => setVoiceNotice(null)}
              >
                <IconX className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : null}

        {recording ? (
          <div
            className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-danger)]/20 bg-[var(--color-surface)] px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:gap-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className="assistant-rec-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-danger)] motion-reduce:animate-none"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {voiceUiPhase === "transcribing" || voiceUiPhase === "uploading"
                    ? "Transcrevendo…"
                    : voice.phase === "requesting_permission"
                      ? "Solicitando microfone…"
                      : "Gravando"}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {voiceUiPhase === "transcribing" || voiceUiPhase === "uploading"
                    ? "Aguarde um momento"
                    : formatElapsed(voice.elapsedSeconds)}
                </p>
              </div>
              {voiceUiPhase !== "transcribing" && voiceUiPhase !== "uploading" ? (
                <div className="flex h-5 items-end gap-0.5" aria-hidden>
                  {voice.levels.map((level, i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-[var(--color-danger)]/70 motion-reduce:transition-none"
                      style={{ height: `${Math.max(20, Math.round(level * 100))}%` }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            {voiceUiPhase === "transcribing" || voiceUiPhase === "uploading" ? null : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 flex-1 px-3 sm:flex-none"
                  aria-label="Cancelar gravação"
                  onClick={() => cancelRecording()}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="min-h-11 flex-1 px-3 sm:flex-none"
                  aria-label="Finalizar gravação"
                  onClick={() => void finishRecording()}
                >
                  <IconStop className="mr-1.5 h-4 w-4" aria-hidden />
                  Finalizar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <label className="sr-only" htmlFor="assistant-input">
              Pergunte ou peça algo
            </label>
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                id="assistant-input"
                name="message"
                rows={1}
                value={input}
                disabled={disabled || busy}
                placeholder="Pergunte ou peça algo…"
                onChange={(e) => {
                  setInput(e.target.value);
                  if (fromVoice && e.target.value !== input) setFromVoice(true);
                }}
                onKeyDown={onComposerKeyDown}
                className="max-h-[7.5rem] min-h-11 w-full resize-none rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 pr-11 text-sm text-[var(--color-ink)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-60"
              />
              {fromVoice ? (
                <span className="pointer-events-none absolute -top-2 right-3 rounded-full bg-[var(--color-ai-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ai-hover)]">
                  Da voz
                </span>
              ) : null}
            </div>
            {input.trim() ? (
              <Button
                type="submit"
                disabled={disabled || busy}
                className="min-h-11 min-w-11 shrink-0 border-transparent px-2 text-white"
                style={{ background: "var(--gradient-ai-vivid)", boxShadow: "var(--shadow-glow-ai)" }}
                aria-label="Enviar mensagem"
              >
                <IconSend />
              </Button>
            ) : voiceAvailable ? (
              <div className="relative shrink-0" ref={micMenuRef}>
                <Button
                  type="button"
                  variant="ai"
                  disabled={
                    disabled ||
                    busy ||
                    voice.phase === "requesting_permission" ||
                    voice.phase === "stopping"
                  }
                  className="min-h-11 min-w-11 px-2"
                  aria-label={
                    voice.phase === "requesting_permission"
                      ? "Solicitando acesso ao microfone"
                      : "Gravar mensagem de voz"
                  }
                  aria-busy={voice.phase === "requesting_permission"}
                  aria-haspopup="menu"
                  onClick={() => void handleMicClick()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setThreadsOpen(false);
                    setMicMenuOpen(!micMenuOpen);
                  }}
                  onTouchStart={() => {
                    if (micLongPressRef.current) {
                      window.clearTimeout(micLongPressRef.current);
                    }
                    micLongPressRef.current = window.setTimeout(() => {
                      setThreadsOpen(false);
                      setMicMenuOpen(true);
                    }, 550);
                  }}
                  onTouchEnd={() => {
                    if (micLongPressRef.current) {
                      window.clearTimeout(micLongPressRef.current);
                      micLongPressRef.current = null;
                    }
                  }}
                  onTouchCancel={() => {
                    if (micLongPressRef.current) {
                      window.clearTimeout(micLongPressRef.current);
                      micLongPressRef.current = null;
                    }
                  }}
                >
                  <IconMic />
                </Button>
                {micMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="Opções de voz"
                    className="absolute bottom-full right-0 z-20 mb-2 w-56 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-md"
                  >
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={voiceAutoSend}
                      className="flex w-full min-h-11 items-center rounded-[var(--radius-md)] px-2.5 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]"
                      onClick={() => {
                        setAutoSendPreference(!voiceAutoSend);
                        setMicMenuOpen(false);
                      }}
                    >
                      Enviar voz automaticamente
                      <span className="ml-auto text-xs text-[var(--color-ink-muted)]">
                        {voiceAutoSend ? "Ligado" : "Desligado"}
                      </span>
                    </button>
                    <Link
                      href="/app/settings/workspace"
                      role="menuitem"
                      className="flex min-h-11 items-center rounded-[var(--radius-md)] px-2.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]"
                      onClick={() => setMicMenuOpen(false)}
                    >
                      Preferências
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <Button type="submit" disabled className="min-h-11 min-w-11 shrink-0 px-2" aria-label="Enviar mensagem">
                <IconSend />
              </Button>
            )}
          </form>
        )}
        {voice.error ? (
          <p className="mt-2 text-xs text-[var(--color-danger)]" role="alert">
            {voice.error}
          </p>
        ) : null}
        {!voiceAvailable && status?.enabled && statusLoaded ? (
          <p className="mt-1 text-[11px] text-[var(--color-ink-subtle)]">
            {status.voice_enabled === false
              ? "Entrada por voz desativada neste ambiente."
              : voice.supported
                ? null
                : "Gravação de voz não disponível neste navegador."}
          </p>
        ) : null}
        {phase && busy ? (
          <p className="sr-only" role="status">
            {phase}
          </p>
        ) : null}
      </div>
    </div>
  );
}
