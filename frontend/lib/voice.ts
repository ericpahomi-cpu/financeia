// ── Voice types ───────────────────────────────────────────────────────────────
export type VoiceLanguage = 'fr' | 'en' | 'es' | 'ru' | 'ro';

export const SPEECH_LANG_CODES: Record<VoiceLanguage, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  ru: 'ru-RU',
  ro: 'ro-RO',
};

// ── Support detection (safe to call server-side) ──────────────────────────────
export function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
    'speechSynthesis' in window
  );
}

// ── VoiceManager ──────────────────────────────────────────────────────────────
export class VoiceManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private synthesis:   any;
  private currentLanguage: VoiceLanguage;

  // Listening state
  private _isListening:       boolean = false;
  private silenceTimer:       ReturnType<typeof setTimeout> | null = null;
  private SILENCE_MS          = 2000;

  // Speaking / queue state
  private _isSpeaking:        boolean = false;
  private isProcessingQueue:  boolean = false;
  private speakQueue:         string[] = [];
  private streamBuffer:       string = '';

  // Public callbacks
  public onTranscript?:       (text: string, isFinal: boolean) => void;
  public onListeningChange?:  (isListening: boolean) => void;
  public onSpeakingChange?:   (isSpeaking: boolean) => void;
  public onError?:            (error: string) => void;

  constructor(language: VoiceLanguage = 'fr') {
    this.synthesis       = window.speechSynthesis;
    this.currentLanguage = language;
    this.initRecognition();

    // Pre-load voices (Chrome loads asynchronously on first call)
    if (this.synthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {}, { once: true });
    }
  }

  // ── Recognition setup ───────────────────────────────────────────────────────
  private initRecognition(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const API = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!API) return;

    this.recognition               = new API();
    this.recognition.continuous    = true;
    this.recognition.interimResults = true;
    this.recognition.lang          = SPEECH_LANG_CODES[this.currentLanguage];
    this.recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onresult = (event: any) => {
      // Barge-in: user speaks while agent is talking → interrupt agent
      if (this._isSpeaking) {
        this.stopSpeaking();
      }

      // Reset silence timer
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        if (this._isListening) this.stopListening();
      }, this.SILENCE_MS);

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result  = event.results[i];
        const text    = result[0].transcript;
        const isFinal = result.isFinal;
        this.onTranscript?.(text, isFinal);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onerror = (event: any) => {
      this._isListening = false;
      this.onListeningChange?.(false);

      if (event.error === 'no-speech') return; // Normal timeout, ignore

      const msg =
        event.error === 'not-allowed'
          ? 'Autorisation du microphone refusée. Activez-la dans les paramètres de votre navigateur.'
          : event.error === 'network'
          ? 'Erreur réseau — vérifiez votre connexion.'
          : `Erreur microphone : ${event.error}`;
      this.onError?.(msg);
    };

    this.recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening (e.g. continuous mode)
      if (this._isListening) {
        try { this.recognition?.start(); } catch { /* ignore */ }
      }
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  setLanguage(lang: VoiceLanguage): void {
    if (lang === this.currentLanguage) return;
    const wasListening   = this._isListening;
    if (wasListening) this.stopListening();
    this.currentLanguage = lang;
    if (this.recognition) {
      this.recognition.lang = SPEECH_LANG_CODES[lang];
    }
    if (wasListening) this.startListening();
  }

  startListening(): void {
    if (!this.recognition) {
      this.onError?.(
        'Le mode vocal n\'est pas supporté par votre navigateur. Utilisez Chrome ou Edge.'
      );
      return;
    }
    if (this._isListening) return;
    this._isListening = true;
    this.onListeningChange?.(true);
    try {
      this.recognition.start();
    } catch {
      this._isListening = false;
      this.onListeningChange?.(false);
    }
  }

  stopListening(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    this._isListening = false;
    this.onListeningChange?.(false);
    try { this.recognition?.stop(); } catch { /* ignore */ }
  }

  async speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.synthesis.cancel();
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
      };
      utterance.onend = () => {
        this._isSpeaking = false;
        this.onSpeakingChange?.(false);
        resolve();
      };
      utterance.onerror = () => {
        this._isSpeaking = false;
        this.onSpeakingChange?.(false);
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    this.speakQueue        = [];
    this.streamBuffer      = '';
    this.isProcessingQueue = false;
    this.synthesis.cancel();
    this._isSpeaking = false;
    this.onSpeakingChange?.(false);
  }

  /** Feed streaming text deltas — auto-detects sentence boundaries and speaks in real-time. */
  speakStreaming(textDelta: string): void {
    // Strip [CHART:X] tags — not meant to be spoken
    const clean = textDelta.replace(/\[CHART:[A-Z0-9.\-]+\]/gi, '');
    this.streamBuffer += clean;

    // Extract complete sentences (ending with . ! ?)
    const sentenceRe = /[^.!?]*[.!?]+(?:\s|$)/g;
    let lastIndex    = 0;
    let match: RegExpExecArray | null;

    while ((match = sentenceRe.exec(this.streamBuffer)) !== null) {
      const sentence = match[0].trim();
      if (sentence.length > 3) {
        this.speakQueue.push(sentence);
      }
      lastIndex = match.index + match[0].length;
    }

    this.streamBuffer = this.streamBuffer.slice(lastIndex);
    this.processSpeakQueue();
  }

  /** Call this after streaming ends to speak any remaining buffered text. */
  flushStreamBuffer(): void {
    const remaining = this.streamBuffer.trim();
    if (remaining.length > 2) {
      this.speakQueue.push(remaining);
      this.streamBuffer = '';
      this.processSpeakQueue();
    }
  }

  dispose(): void {
    this.stopListening();
    this.stopSpeaking();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────
  private processSpeakQueue(): void {
    if (this.isProcessingQueue || this.speakQueue.length === 0) return;
    this.isProcessingQueue = true;
    const sentence = this.speakQueue.shift()!;
    this.speak(sentence).then(() => {
      this.isProcessingQueue = false;
      this.processSpeakQueue();
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getBestVoice(): any | null {
    const voices    = this.synthesis.getVoices();
    const langCode  = SPEECH_LANG_CODES[this.currentLanguage];
    const langPrefix = this.currentLanguage;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matching = voices.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.lang === langCode || v.lang.startsWith(langPrefix)
    );
    if (matching.length === 0) return null;

    // Prefer well-known quality voices
    const preferredNames = [
      'google', 'female', 'femme', 'woman',
      'hortense', 'amélie', 'paulina', 'monica', // fr/es
      'milena', 'irina',                          // ru
      'ioana',                                    // ro
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quality = matching.find((v: any) =>
      preferredNames.some((k) => v.name.toLowerCase().includes(k))
    );
    if (quality) return quality;

    // Prefer local (device-installed) voices
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const local = matching.find((v: any) => v.localService);
    if (local) return local;

    return matching[0];
  }
}
