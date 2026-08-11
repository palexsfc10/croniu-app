/** Shared assistant preference keys (localStorage). */
export const VOICE_PRIVACY_KEY = "croniu.assistant.voicePrivacyAck";
export const VOICE_AUTO_SEND_KEY = "croniu.assistant.voiceAutoSend";

export function readVoiceAutoSend(): boolean {
  try {
    return localStorage.getItem(VOICE_AUTO_SEND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeVoiceAutoSend(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_AUTO_SEND_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}
