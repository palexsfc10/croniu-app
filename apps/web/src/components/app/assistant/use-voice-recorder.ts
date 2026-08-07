"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoicePhase } from "./types";

export type VoiceRecorderControls = {
  phase: VoicePhase;
  error: string | null;
  elapsedSeconds: number;
  supported: boolean;
  levels: number[];
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
  reset: () => void;
};

const PREFERRED_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

const FALLBACK_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: true,
};

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function isDomException(err: unknown): err is DOMException {
  return typeof DOMException !== "undefined" && err instanceof DOMException;
}

function sanitizeMessage(message: string | undefined): string {
  if (!message) return "";
  return message.replace(/[^\w\s.:,()\-]/g, "").slice(0, 120);
}

/** Map getUserMedia / MediaRecorder failures to human copy (no technical details). */
export function mapMediaError(
  err: unknown,
  options: { insecureContext?: boolean } = {},
): string {
  if (options.insecureContext) {
    return "A gravação de voz exige uma conexão segura HTTPS.";
  }
  const name = isDomException(err) ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "O acesso ao microfone foi bloqueado pelo navegador ou pelo sistema.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nenhum microfone foi encontrado neste dispositivo.";
    case "NotReadableError":
    case "TrackStartError":
      return "O microfone está ocupado ou não pôde ser iniciado. Feche outros aplicativos e tente novamente.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Este microfone não é compatível com a configuração solicitada.";
    case "AbortError":
      return "A inicialização do microfone foi interrompida. Tente novamente.";
    case "SecurityError":
      return "O navegador bloqueou o microfone por uma política de segurança.";
    case "TypeError":
      return "A gravação de voz exige uma conexão segura HTTPS.";
    default:
      return "Não foi possível iniciar o microfone. Verifique o dispositivo e tente novamente.";
  }
}

type SanitizedDeviceSummary = {
  count: number;
  kinds: string[];
  labeledCount: number;
};

async function summarizeAudioInputs(): Promise<SanitizedDeviceSummary | null> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audio = devices.filter((d) => d.kind === "audioinput");
    return {
      count: audio.length,
      kinds: ["audioinput"],
      labeledCount: audio.filter((d) => Boolean(d.label)).length,
    };
  } catch {
    return null;
  }
}

async function queryMicPermission(): Promise<string | null> {
  try {
    if (!navigator.permissions?.query) return null;
    // Some browsers reject microphone in Permissions API — ignore.
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

/** Sanitized one-shot diagnostics for ops (never deviceId/groupId/full labels/keys). */
export async function collectVoiceEnvironmentDiag(): Promise<Record<string, unknown>> {
  if (typeof window === "undefined") return { runtime: "ssr" };
  const mimeSupported = pickMimeType() || null;
  const mediaDevices = Boolean(navigator.mediaDevices);
  const getUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const devices = mediaDevices ? await summarizeAudioInputs() : null;
  const permission = mediaDevices ? await queryMicPermission() : null;
  return {
    secureContext: window.isSecureContext,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    mediaDevices,
    getUserMedia,
    mediaRecorder: typeof MediaRecorder !== "undefined",
    permissionState: permission,
    audioInputs: devices,
    preferredMime: mimeSupported,
    inIframe: window.self !== window.top,
  };
}

function logVoiceDiag(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    // Keep production console sparse and sanitized
    console.info(`[croniu.voice] ${event}`, payload);
    return;
  }
  console.info(`[croniu.voice] ${event}`, payload);
}

async function acquireStream(): Promise<{
  stream: MediaStream;
  constraintsUsed: "preferred" | "fallback";
}> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(PREFERRED_AUDIO_CONSTRAINTS);
    return { stream, constraintsUsed: "preferred" };
  } catch (err) {
    const name = isDomException(err) ? err.name : "";
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      const stream = await navigator.mediaDevices.getUserMedia(FALLBACK_AUDIO_CONSTRAINTS);
      return { stream, constraintsUsed: "fallback" };
    }
    throw err;
  }
}

export function useVoiceRecorder(maxSeconds: number): VoiceRecorderControls {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([0.2, 0.35, 0.25, 0.4, 0.3]);
  const [supported, setSupported] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);
  const mimeRef = useRef<string | undefined>(undefined);
  const startedAtRef = useRef<number>(0);
  const startingRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const secure = typeof window !== "undefined" && window.isSecureContext;
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      secure &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setSupported(ok);
    mimeRef.current = pickMimeType();
  }, []);

  const stopAllTracks = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    streamRef.current = null;
  }, []);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    try {
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.ondataavailable = null;
        mediaRef.current.onstop = null;
        mediaRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    mediaRef.current = null;
    stopAllTracks();
  }, [stopAllTracks]);

  const reset = useCallback(() => {
    startingRef.current = false;
    cleanupMedia();
    chunksRef.current = [];
    setElapsedSeconds(0);
    setError(null);
    setPhase("idle");
    setLevels([0.2, 0.35, 0.25, 0.4, 0.3]);
  }, [cleanupMedia]);

  const cancel = useCallback(() => {
    startingRef.current = false;
    try {
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.ondataavailable = null;
        mediaRef.current.onstop = null;
        mediaRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    cleanupMedia();
    chunksRef.current = [];
    setPhase("cancelled");
    setElapsedSeconds(0);
    window.setTimeout(() => setPhase("idle"), 200);
  }, [cleanupMedia]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    if (phaseRef.current === "recording" || phaseRef.current === "requesting_permission") {
      return;
    }

    setError(null);
    const insecure =
      typeof window !== "undefined" && window.isSecureContext === false;

    if (insecure || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError(mapMediaError(new DOMException("", "SecurityError"), { insecureContext: true }));
      window.setTimeout(() => setPhase("idle"), 0);
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setPhase("error");
      setError("Não foi possível iniciar o microfone. Verifique o dispositivo e tente novamente.");
      window.setTimeout(() => setPhase("idle"), 0);
      return;
    }

    startingRef.current = true;
    setPhase("requesting_permission");

    const env = await collectVoiceEnvironmentDiag();
    logVoiceDiag("start_attempt", env);

    try {
      // Permissions API is advisory only — getUserMedia is the source of truth.
      const { stream, constraintsUsed } = await acquireStream();
      if (!startingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const liveTracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
      logVoiceDiag("getUserMedia_ok", {
        constraintsUsed,
        trackCount: stream.getTracks().length,
        liveAudioTracks: liveTracks.length,
        permissionState: env.permissionState,
        audioInputCount: (env.audioInputs as SanitizedDeviceSummary | null)?.count ?? null,
      });

      if (liveTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException("No live audio track", "NotReadableError");
      }

      streamRef.current = stream;
      chunksRef.current = [];
      const mime = mimeRef.current || pickMimeType();
      mimeRef.current = mime;

      let recorder: MediaRecorder;
      try {
        recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
      } catch (recorderErr) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        logVoiceDiag("mediarecorder_failed", {
          name: isDomException(recorderErr) ? recorderErr.name : "unknown",
          message: sanitizeMessage(
            isDomException(recorderErr) ? recorderErr.message : String(recorderErr),
          ),
          mime: mime || null,
        });
        throw recorderErr;
      }

      mediaRef.current = recorder;

      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          analyserRef.current = analyser;
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(data);
            const sample = Array.from(data.slice(0, 5)).map((v) => Math.max(0.12, v / 255));
            setLevels(sample);
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      } catch {
        /* waveform optional */
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob =
          chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type }) : null;
        const resolve = stopResolverRef.current;
        stopResolverRef.current = null;
        cleanupMedia();
        resolve?.(blob);
      };

      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setPhase("recording");
      startingRef.current = false;

      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed >= maxSeconds) {
          setPhase("stopping");
          if (mediaRef.current && mediaRef.current.state !== "inactive") {
            try {
              mediaRef.current.stop();
            } catch {
              /* ignore */
            }
          }
        }
      }, 250);

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      startingRef.current = false;
      cleanupMedia();
      const insecureNow =
        typeof window !== "undefined" && window.isSecureContext === false;
      logVoiceDiag("getUserMedia_failed", {
        name: isDomException(err) ? err.name : typeof err,
        message: sanitizeMessage(isDomException(err) ? err.message : String(err)),
        permissionState: env.permissionState,
        secureContext: !insecureNow,
        audioInputCount: (env.audioInputs as SanitizedDeviceSummary | null)?.count ?? null,
      });
      setPhase("error");
      setError(mapMediaError(err, { insecureContext: insecureNow }));
      window.setTimeout(() => setPhase("idle"), 0);
    }
  }, [cleanupMedia, maxSeconds]);

  const stop = useCallback(async () => {
    startingRef.current = false;
    setPhase("stopping");
    return new Promise<Blob | null>((resolve) => {
      const recorder = mediaRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanupMedia();
        setPhase("idle");
        resolve(null);
        return;
      }
      stopResolverRef.current = (blob) => {
        resolve(blob);
      };
      try {
        recorder.stop();
      } catch {
        cleanupMedia();
        setPhase("error");
        setError("A gravação foi interrompida. Tente novamente.");
        window.setTimeout(() => setPhase("idle"), 0);
        resolve(null);
      }
    });
  }, [cleanupMedia]);

  useEffect(() => () => {
    startingRef.current = false;
    cleanupMedia();
  }, [cleanupMedia]);

  return {
    phase,
    error,
    elapsedSeconds,
    supported,
    levels,
    start,
    stop,
    cancel,
    reset,
  };
}

export function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
