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

function pickMimeType(): string | undefined {
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

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setSupported(ok);
    mimeRef.current = pickMimeType();
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cleanupMedia();
    chunksRef.current = [];
    setElapsedSeconds(0);
    setError(null);
    setPhase("idle");
    setLevels([0.2, 0.35, 0.25, 0.4, 0.3]);
  }, [cleanupMedia]);

  const cancel = useCallback(() => {
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
    setError(null);
    if (!supported) {
      setPhase("error");
      setError("Seu navegador não permite gravação de áudio neste dispositivo.");
      return;
    }
    setPhase("requesting_permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = mimeRef.current;
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRef.current = recorder;

      try {
        const ctx = new AudioContext();
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
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed >= maxSeconds) {
          void (async () => {
            setPhase("stopping");
            if (mediaRef.current && mediaRef.current.state !== "inactive") {
              mediaRef.current.stop();
            }
          })();
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
      cleanupMedia();
      setPhase("error");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Não conseguimos acessar o microfone. Libere a permissão nas configurações do navegador.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("Nenhum microfone foi encontrado neste dispositivo.");
      } else {
        setError("Não foi possível iniciar a gravação. Tente novamente.");
      }
    }
  }, [cleanupMedia, maxSeconds, supported]);

  const stop = useCallback(async () => {
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
        resolve(null);
      }
    });
  }, [cleanupMedia]);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

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
