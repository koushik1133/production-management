export interface VoiceNotePayload {
  duration: number; // in seconds
  audio: string; // base64 data URL
}

export function parseVoiceNote(body: string): VoiceNotePayload | null {
  if (!body || typeof body !== 'string' || !body.startsWith('[VOICE_NOTE]:')) {
    return null;
  }
  try {
    const jsonStr = body.replace('[VOICE_NOTE]:', '');
    return JSON.parse(jsonStr) as VoiceNotePayload;
  } catch (err) {
    return null;
  }
}

export function formatVoiceNoteBody(audioBase64: string, durationSeconds: number): string {
  return `[VOICE_NOTE]:${JSON.stringify({
    duration: Math.round(durationSeconds),
    audio: audioBase64,
  })}`;
}
