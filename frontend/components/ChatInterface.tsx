'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/language-context';
import { toTVSymbol } from '@/lib/tv-symbol';
import { VoiceManager, VoiceLanguage, isVoiceSupported } from '@/lib/voice';

const TradingViewWidget = dynamic(() => import('@/components/TradingViewWidget'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Tool display labels ───────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  get_stock_price:                '📈 Prix en temps réel',
  get_user_portfolio:             '💼 Portefeuille',
  get_user_favorites:             '⭐ Favoris',
  get_user_predictions:           '🔮 Pronostics',
  get_agent_memory:               '🧠 Mémoire agent',
  get_recent_news:                '📰 Actualités',
  calculate_portfolio_performance:'📊 Performance',
  save_client_insight:            '💾 Sauvegarde',
  get_client_profile:             '👤 Profil',
  get_conversation_history:       '💬 Historique',
  detect_user_mood:               '🎭 Analyse',
  compare_to_similar_clients:     '🔄 Comparaison',
  simulate_scenario:              '🔮 Simulation',
  web_search:                     '🔍 Recherche web',
};

// ── Markdown stripper ─────────────────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/\*([\s\S]+?)\*/g, '$1')
    .replace(/_{2}([\s\S]+?)_{2}/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^-{3,}\s*$/gm, '')
    .replace(/^={3,}\s*$/gm, '')
    .replace(/```[\s\S]*?```/g, (m) =>
      m.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, ''))
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Chart tag parser ──────────────────────────────────────────────────────────
type Segment = { type: 'text'; text: string } | { type: 'chart'; symbol: string };

function parseSegments(content: string): Segment[] {
  const CHART_RE = /\[CHART:([A-Z0-9.\-]+)\]/gi;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHART_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'chart', symbol: match[1].toUpperCase() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }
  return segments;
}

function BubbleText({ content }: { content: string }) {
  const clean    = stripMarkdown(content);
  const segments = parseSegments(clean);
  const textOnly = segments
    .filter((s): s is { type: 'text'; text: string } => s.type === 'text')
    .map((s) => s.text)
    .join('');
  return <span style={{ whiteSpace: 'pre-wrap' }}>{textOnly}</span>;
}

function InlineChart({ symbol }: { symbol: string }) {
  const isCrypto = symbol.includes('-') ||
    /^(BTC|ETH|SOL|BNB|ADA|XRP|DOGE|DOT|AVAX|MATIC|LINK|UNI|ATOM|LTC|SUI|APT|INJ|SEI|TIA|NEAR|TON|SHIB|TRX|PEPE)$/i.test(symbol);
  const tvSymbol = toTVSymbol(symbol, isCrypto ? 'crypto' : 'stock');
  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-[#f3f4f6]">
        <span className="font-semibold text-sm text-[#1a1a1a]">{symbol}</span>
        <span className="text-[#9ca3af] text-xs">{tvSymbol}</span>
      </div>
      <div style={{ height: 420, width: '100%' }}>
        <TradingViewWidget tvSymbol={tvSymbol} height={420} />
      </div>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] animate-pulse" style={{ height: 60 }}>
      <div className="px-4 py-4 flex items-center gap-2 text-[#9ca3af] text-sm">
        <span>📊</span><span>Chargement du graphique…</span>
      </div>
    </div>
  );
}

function getChartSymbols(content: string): string[] {
  const clean    = stripMarkdown(content);
  const segments = parseSegments(clean);
  return segments
    .filter((s): s is { type: 'chart'; symbol: string } => s.type === 'chart')
    .map((s) => s.symbol);
}

// ── MicButton ─────────────────────────────────────────────────────────────────
function MicButton({ isListening, onClick, disabled }: {
  isListening: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isListening ? 'Arrêter l\'écoute' : 'Démarrer l\'écoute vocale'}
      className={`relative flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
        isListening
          ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
          : 'bg-[#f3f4f6] hover:bg-indigo-100 text-[#6b7280] hover:text-indigo-600'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {/* Pulse ring when listening */}
      {isListening && (
        <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-50" />
      )}
      <span className="relative text-lg">{isListening ? '🔴' : '🎤'}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatInterface() {
  const { t } = useLanguage();

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [activeTools, setActiveTools]     = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // ── Voice state ─────────────────────────────────────────────────────────────
  const [voiceSupported, setVoiceSupported]       = useState(false);
  const [voiceEnabled, setVoiceEnabled]           = useState(false);
  const [autoSpeak, setAutoSpeak]                 = useState(true);
  const [isListening, setIsListening]             = useState(false);
  const [isSpeaking, setIsSpeaking]               = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError]               = useState('');
  const [noVoiceMsg, setNoVoiceMsg]               = useState('');
  const voiceManagerRef = useRef<VoiceManager | null>(null);

  // Ref mirrors so closures always see latest values
  const autoSpeakRef    = useRef(autoSpeak);
  const sendMessageRef  = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);

  // ── Scroll to bottom ─────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── History ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((data) => {
        const history: Message[] = (data.messages || []).map(
          (m: { role: string; content: string }) => ({
            role:    m.role as 'user' | 'assistant',
            content: m.content,
          })
        );
        if (history.length === 0) {
          setMessages([]);
          triggerOnboarding();
        } else {
          setMessages(history);
        }
        setHistoryLoaded(true);
      })
      .catch(() => { setHistoryLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── VoiceManager init ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVoiceSupported()) {
      setVoiceSupported(false);
      return;
    }
    setVoiceSupported(true);

    let vm: VoiceManager;
    const initVoice = async () => {
      let lang: VoiceLanguage = 'fr';
      try {
        const res = await fetch('/api/user-settings');
        if (res.ok) {
          const data = await res.json();
          if (data.language && ['fr','en','es','ru','ro'].includes(data.language)) {
            lang = data.language as VoiceLanguage;
          }
        }
      } catch { /* use default */ }

      vm = new VoiceManager(lang);

      vm.onTranscript = (text, isFinal) => {
        setInterimTranscript(isFinal ? '' : text);
        if (isFinal && text.trim()) {
          vm.stopListening();
          setInterimTranscript('');
          sendMessageRef.current(text.trim());
        }
      };
      vm.onListeningChange = setIsListening;
      vm.onSpeakingChange  = setIsSpeaking;
      vm.onError = (err) => {
        setVoiceError(err);
        setTimeout(() => setVoiceError(''), 6000);
      };
      voiceManagerRef.current = vm;
    };

    initVoice();
    return () => { voiceManagerRef.current?.dispose(); };
  }, []);

  // ── Core streaming ────────────────────────────────────────────────────────────
  const streamResponse = async (
    response: Response,
    onDelta?: (text: string) => void
  ) => {
    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = '';

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') break;
        try {
          const parsed = JSON.parse(raw);

          // Text delta
          if (parsed.text) {
            assistantMessage += parsed.text;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', content: assistantMessage };
              return next;
            });
            onDelta?.(parsed.text);
          }

          // Tool badges
          if (parsed.type === 'tool_start' && parsed.name) {
            const label = TOOL_LABELS[parsed.name] ?? parsed.name;
            setActiveTools((prev) => prev.includes(label) ? prev : [...prev, label]);
          }
          if (parsed.type === 'tool_end' && parsed.name) {
            const label = TOOL_LABELS[parsed.name] ?? parsed.name;
            setActiveTools((prev) => prev.filter((l) => l !== label));
          }

        } catch { /* ignore partial JSON */ }
      }
    }
  };

  // ── sendMessage (extracted so voice + keyboard both use it) ───────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setActiveTools([]);

    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
      });
      if (!response.ok || !response.body) throw new Error('Erreur serveur');

      const shouldSpeak = autoSpeakRef.current && voiceManagerRef.current;
      await streamResponse(
        response,
        shouldSpeak ? (delta) => voiceManagerRef.current?.speakStreaming(delta) : undefined
      );

      // Flush any remaining buffered text that didn't end with punctuation
      if (shouldSpeak) voiceManagerRef.current?.flushStreamBuffer();

    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Désolé, une erreur s'est produite. Veuillez réessayer." },
      ]);
    } finally {
      setIsLoading(false);
      setActiveTools([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Keep ref fresh after every render so VoiceManager callback always calls latest version
  useEffect(() => { sendMessageRef.current = sendMessage; });

  const triggerOnboarding = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: 'Bonjour' }),
      });
      if (!response.body) return;
      await streamResponse(response);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ── Voice toggle ──────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    if (!voiceSupported) {
      setNoVoiceMsg('Le mode vocal n\'est pas supporté par votre navigateur. Utilisez Chrome ou Edge.');
      setTimeout(() => setNoVoiceMsg(''), 5000);
      return;
    }
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      voiceManagerRef.current?.stopListening();
      voiceManagerRef.current?.stopSpeaking();
    }
  };

  const toggleMic = () => {
    if (!voiceManagerRef.current) return;
    if (isListening) {
      voiceManagerRef.current.stopListening();
    } else {
      if (isSpeaking) voiceManagerRef.current.stopSpeaking();
      voiceManagerRef.current.startListening();
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (!historyLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-[#9ca3af] text-sm">
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Voice mode bar ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-[#f3f4f6] bg-white flex items-center justify-between gap-3 flex-wrap">

        {/* Left: mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6b7280] font-medium">🎙 Mode vocal</span>
          <button
            onClick={toggleVoice}
            aria-label={voiceEnabled ? 'Désactiver le mode vocal' : 'Activer le mode vocal'}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              voiceEnabled ? 'bg-indigo-600' : 'bg-[#d1d5db]'
            } ${!voiceSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                voiceEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Right: auto-speak toggle (only when voice enabled) */}
        {voiceEnabled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7280]">Réponses vocales</span>
            <button
              onClick={() => {
                const next = !autoSpeak;
                setAutoSpeak(next);
                if (!next) voiceManagerRef.current?.stopSpeaking();
              }}
              aria-label={autoSpeak ? 'Désactiver les réponses vocales' : 'Activer les réponses vocales'}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                autoSpeak ? 'bg-emerald-500' : 'bg-[#d1d5db]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  autoSpeak ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>

            {/* Interrupt button */}
            {isSpeaking && (
              <button
                onClick={() => voiceManagerRef.current?.stopSpeaking()}
                aria-label="Interrompre l'agent"
                className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
              >
                ⏹ Interrompre
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Error banners ─────────────────────────────────────────────────────── */}
      {(voiceError || noVoiceMsg) && (
        <div className="flex-shrink-0 mx-4 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs" role="alert">
          {voiceError || noVoiceMsg}
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message, index) => {
          const isLastAndStreaming = isLoading && index === messages.length - 1;
          const chartSymbols = message.role === 'assistant' ? getChartSymbols(message.content) : [];

          return (
            <div key={index}>
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2 mt-1">
                    AI
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-white border border-[#e5e7eb] text-[#1a1a1a] rounded-tl-sm shadow-sm'
                  }`}
                >
                  {message.content ? (
                    message.role === 'assistant'
                      ? <BubbleText content={message.content} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-[#e5e7eb] flex items-center justify-center text-[#6b7280] text-xs font-bold flex-shrink-0 ml-2 mt-1">
                    Vous
                  </div>
                )}
              </div>

              {message.role === 'assistant' && chartSymbols.length > 0 && (
                <div className="ml-10 space-y-3">
                  {isLastAndStreaming
                    ? chartSymbols.map((_, i) => <ChartPlaceholder key={i} />)
                    : chartSymbols.map((sym) => <InlineChart key={sym} symbol={sym} />)
                  }
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Tool badges ───────────────────────────────────────────────────────── */}
      {activeTools.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 flex flex-wrap gap-2">
          {activeTools.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-xs font-medium animate-pulse"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* ── Voice status bar ──────────────────────────────────────────────────── */}
      {voiceEnabled && (isListening || isSpeaking || interimTranscript) && (
        <div
          aria-live="polite"
          className="flex-shrink-0 mx-4 mb-2 px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all
            bg-white border-[#e5e7eb]"
        >
          {isListening && (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-red-600">🎤 J&apos;écoute…</span>
              {interimTranscript && (
                <span className="text-[#9ca3af] italic truncate max-w-[60%]">
                  &ldquo;{interimTranscript}&rdquo;
                </span>
              )}
            </>
          )}
          {isSpeaking && !isListening && (
            <>
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-indigo-600">🔊 L&apos;agent répond…</span>
            </>
          )}
        </div>
      )}

      {/* ── Input ─────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[#e5e7eb] p-4 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? 'Parlez maintenant…'
                : t.chat_placeholder
            }
            rows={2}
            className="flex-1 bg-[#f8f9fa] border border-[#e5e7eb] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:border-indigo-400 resize-none transition-colors"
            disabled={isLoading || isListening}
          />

          {/* Mic button — only when voice is enabled */}
          {voiceEnabled && (
            <MicButton
              isListening={isListening}
              onClick={toggleMic}
              disabled={isLoading}
            />
          )}

          <button
            type="submit"
            disabled={!input.trim() || isLoading || isListening}
            aria-label="Envoyer le message"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex-shrink-0"
          >
            {isLoading ? '...' : '→'}
          </button>
        </form>
        <p className="text-[#9ca3af] text-xs mt-2 text-center">{t.chat_disclaimer}</p>
      </div>
    </div>
  );
}
