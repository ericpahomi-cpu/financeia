// ── Voice types ───────────────────────────────────────────────────────────────
export type VoiceLanguage = 'fr' | 'en' | 'es' | 'ru' | 'ro';

export const SPEECH_LANG_CODES: Record<VoiceLanguage, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  ru: 'ru-RU',
  ro: 'ro-RO',
};

// ── Support detection ────────────────────────────────────────────────────────
// STT: MediaRecorder + getUserMedia (for Groq Whisper)
// TTS: SpeechSynthesis (unchanged)
export function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    'speechSynthesis' in window
  );
}

// ── VoiceManager ──────────────────────────────────────────────────────────────
export class VoiceManager {
  // ── STT: MediaRecorder + AudioContext (Groq Whisper) ─────────────────────
  private mediaRecorder:       MediaRecorder | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private audioContext:        any = null;  // AudioContext — typed as any for compat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private analyser:            any = null;  // AnalyserNode
  private stream:              MediaStream | null = null;
  private chunks:              Blob[] = [];
  private silenceInterval:     ReturnType<typeof setInterval> | null = null;
  private readonly SILENCE_MS  = 1500;   // stop recording after 1.5s of silence
  private readonly MIN_REC_MS  = 400;    // minimum before silence detection engages
  private readonly SILENCE_THR = 8;      // RMS threshold (0–255) for silence
  private recordingStart       = 0;

  // ── TTS: SpeechSynthesis (unchanged) ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private synthesis:           any;
  private speakQueue:          string[] = [];
  private streamBuffer:        string = '';
  private isProcessingQueue:   boolean = false;
  private _isSpeaking:         boolean = false;

  // ── Shared ────────────────────────────────────────────────────────────────
  private currentLanguage:     VoiceLanguage;
  private _isListening:        boolean = false;

  // ── Public callbacks ──────────────────────────────────────────────────────
  public onTranscript?:        (text: string, isFinal: boolean) => void;
  public onListeningChange?:   (isListening: boolean) => void;
  public onSpeakingChange?:    (isSpeaking: boolean) => void;
  /** Fires true while Groq API call is in-flight (audio sent, waiting for text) */
  public onTranscribingChange?: (isTranscribing: boolean) => void;
  public onError?:             (error: string) => void;

  constructor(language: VoiceLanguage = 'fr') {
    this.synthesis       = window.speechSynthesis;
    this.currentLanguage = language;
    // Pre-warm voice list (Chrome loads asynchronously)
    if (this.synthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {}, { once: true });
    }
  }

  // ── Language ──────────────────────────────────────────────────────────────
  setLanguage(lang: VoiceLanguage): void {
    this.currentLanguage = lang;
  }

  // ── STT: start recording ──────────────────────────────────────────────────
  async startListening(): Promise<void> {
    if (this._isListening) return;

    try {
      // Request mic — aggressive voice isolation constraints
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:           true,  // cancel speaker feedback into mic
          noiseSuppression:           true,  // filter background noise
          autoGainControl:            true,  // normalise voice volume
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          suppressLocalAudioPlayback: true,  // prevent TTS/music bleed-back into mic
          channelCount:               1,     // mono — reduces processing overhead
        } as MediaTrackConstraints,
      });

      // AudioContext for real-time silence detection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      this.audioContext = new AC() as AudioContext;
      const source      = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser     = this.audioContext.createAnalyser();
      this.analyser.fftSize              = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);

      // MediaRecorder — prefer webm/opus, fallback to mp4
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm'              :
                                                                  'audio/mp4';
      this.chunks        = [];
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => void this.processAudio();
      this.mediaRecorder.start(100); // collect 100 ms chunks

      this._isListening   = true;
      this.recordingStart = Date.now();
      this.onListeningChange?.(true);
      this.startSilenceDetection();

    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      const msg =
        e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
          ? 'Autorisation du microphone refusée. Activez-la dans les paramètres de votre navigateur.'
          : `Erreur microphone : ${e.message ?? 'inconnue'}`;
      this.onError?.(msg);
    }
  }

  // ── STT: silence detection loop ───────────────────────────────────────────
  private startSilenceDetection(): void {
    const data         = new Uint8Array(this.analyser.frequencyBinCount as number);
    let silenceStart: number | null = null;

    this.silenceInterval = setInterval(() => {
      if (!this.analyser || !this._isListening) return;

      // Don't engage until MIN_REC_MS have passed (avoid cutting off first syllable)
      if (Date.now() - this.recordingStart < this.MIN_REC_MS) return;

      this.analyser.getByteFrequencyData(data);
      const rms = data.reduce((a: number, b: number) => a + b, 0) / data.length;

      if (rms < this.SILENCE_THR) {
        // Silence detected
        if (silenceStart === null) silenceStart = Date.now();
        else if (Date.now() - silenceStart > this.SILENCE_MS) {
          this.stopListening(); // triggers processAudio via onstop
        }
      } else {
        // Sound detected — reset silence counter
        silenceStart = null;
        // Barge-in: user speaks while agent is still talking → interrupt agent
        if (this._isSpeaking) this.stopSpeaking();
      }
    }, 80);
  }

  // ── STT: stop recording ───────────────────────────────────────────────────
  stopListening(): void {
    if (!this._isListening) return;
    this._isListening = false;
    this.onListeningChange?.(false);

    if (this.silenceInterval) {
      clearInterval(this.silenceInterval);
      this.silenceInterval = null;
    }
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop(); // → onstop → processAudio
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close().catch?.(() => {});
    this.audioContext = null;
    this.analyser     = null;
    this.stream       = null;
  }

  // ── STT: send to Groq Whisper ─────────────────────────────────────────────
  private async processAudio(): Promise<void> {
    if (this.chunks.length === 0) return;

    const mimeType = this.mediaRecorder?.mimeType ?? 'audio/webm';
    const blob     = new Blob(this.chunks, { type: mimeType });
    this.chunks    = [];

    // Skip recordings that are too small to contain speech
    if (blob.size < 2_000) {
      console.log('[VoiceManager] Recording too short/empty, skipping transcription');
      return;
    }

    this.onTranscribingChange?.(true);
    console.log(`[VoiceManager] Sending ${blob.size} bytes to Groq Whisper (${this.currentLanguage})`);

    try {
      const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const form = new FormData();
      form.append('audio',    blob,                   `recording.${ext}`);
      form.append('language', this.currentLanguage);

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }

      const data   = await res.json() as { text?: string; error?: string };
      const text   = data.text?.trim() ?? '';

      console.log('[VoiceManager] Whisper transcript:', JSON.stringify(text));

      if (text) {
        this.onTranscript?.(text, true);
      }
    } catch (err) {
      console.error('[VoiceManager] Transcription failed:', err);
      this.onError?.('Erreur de transcription. Vérifiez votre connexion et réessayez.');
    } finally {
      this.onTranscribingChange?.(false);
    }
  }

  // ── TTS: speak a single utterance ────────────────────────────────────────
  async speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance    = new SpeechSynthesisUtterance(text);
      utterance.lang     = SPEECH_LANG_CODES[this.currentLanguage];
      utterance.rate     = 1.0;
      utterance.pitch    = 1.0;
      utterance.volume   = 1.0;

      const voice = this.getBestVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        this._isSpeaking = true;
        this.onSpeakingChange?.(true);
        console.log('[VoiceManager] TTS ▶', text.slice(0, 60));
      };
      utterance.onend = () => {
        this._isSpeaking = false;
        this.onSpeakingChange?.(false);
        resolve();
      };
      utterance.onerror = (e) => {
        console.warn('[VoiceManager] TTS error:', e.error, '| text:', text.slice(0, 40));
        this._isSpeaking = false;
        this.onSpeakingChange?.(false);
        resolve();
      };

      // Chrome bug: synthesis can get stuck after tab is backgrounded → cancel first
      this.synthesis.cancel();
      this.synthesis.speak(utterance);
    });
  }

  // ── TTS: stop all speech ──────────────────────────────────────────────────
  stopSpeaking(): void {
    this.speakQueue        = [];
    this.streamBuffer      = '';
    this.isProcessingQueue = false;
    this.synthesis.cancel();
    this._isSpeaking = false;
    this.onSpeakingChange?.(false);
  }

  // ── TTS: streaming feed — detects sentence boundaries ────────────────────
  speakStreaming(textDelta: string): void {
    // Strip chart tags — not speakable
    const clean = textDelta.replace(/\[CHART:[A-Z0-9.\-]+\]/gi, '');
    this.streamBuffer += clean;

    // Extract complete sentences ending with . ! ?
    const sentenceRe = /[^.!?]*[.!?]+(?:\s|$)/g;
    let lastIndex    = 0;
    let match: RegExpExecArray | null;

    while ((match = sentenceRe.exec(this.streamBuffer)) !== null) {
      const sentence = match[0].trim();
      if (sentence.length > 3) {
        this.speakQueue.push(sentence);
        console.log('[VoiceManager] Queued sentence:', sentence.slice(0, 60));
      }
      lastIndex = match.index + match[0].length;
    }

    this.streamBuffer = this.streamBuffer.slice(lastIndex);
    this.processSpeakQueue();
  }

  // ── TTS: flush remaining buffer after stream ends ─────────────────────────
  flushStreamBuffer(): void {
    const remaining = this.streamBuffer.trim();
    if (remaining.length > 2) {
      this.speakQueue.push(remaining);
      this.streamBuffer = '';
      this.processSpeakQueue();
    }
  }

  // ── TTS: queue processor ──────────────────────────────────────────────────
  private processSpeakQueue(): void {
    if (this.isProcessingQueue || this.speakQueue.length === 0) return;
    this.isProcessingQueue = true;
    const sentence = this.speakQueue.shift()!;
    this.speak(sentence).then(() => {
      this.isProcessingQueue = false;
      this.processSpeakQueue();
    });
  }

  // ── TTS: best voice picker ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getBestVoice(): any | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voices:   any[] = this.synthesis.getVoices();
    const langCode        = SPEECH_LANG_CODES[this.currentLanguage];
    const langPrefix      = this.currentLanguage;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matching = voices.filter((v: any) =>
      v.lang === langCode || v.lang.startsWith(langPrefix)
    );
    if (matching.length === 0) return null;

    const preferredNames = [
      'google', 'female', 'femme', 'woman',
      'hortense', 'amélie', 'paulina', 'monica',
      'milena', 'irina',
      'ioana',
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quality = matching.find((v: any) =>
      preferredNames.some((k) => v.name.toLowerCase().includes(k))
    );
    if (quality) return quality;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const local = matching.find((v: any) => v.localService);
    if (local) return local;

    return matching[0];
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  dispose(): void {
    this.stopListening();
    this.stopSpeaking();
  }
}
