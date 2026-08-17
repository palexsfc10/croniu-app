export type CopyResult = { ok: true } | { ok: false; error: string };

function copyWithExecCommand(text: string): CopyResult {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.setAttribute("aria-hidden", "true");
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "-9999px";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  el.setSelectionRange(0, el.value.length);
  try {
    const ok = document.execCommand("copy");
    return ok ? { ok: true } : { ok: false, error: "copy_failed" };
  } finally {
    el.remove();
  }
}

export async function copyTextToClipboard(text: string): Promise<CopyResult> {
  const value = text.trim();
  if (!value) {
    return { ok: false, error: "empty" };
  }

  const canUseClipboard =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.clipboard?.writeText);

  if (canUseClipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return { ok: true };
    } catch {
      // fall through to selection fallback
    }
  }

  try {
    return copyWithExecCommand(value);
  } catch {
    return { ok: false, error: "clipboard_unavailable" };
  }
}
