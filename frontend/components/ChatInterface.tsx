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

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

// ── Tool display labels ───────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  get_stock_price:                 '📈 Prix en temps réel',
  get_user_portfolio:              '💼 Portefeuille',
  get_user_favorites:              '⭐ Favoris',
  get_user_predictions:            '🔮 Pronostics',
  get_agent_memory:                '🧠 Mémoire agent',
  get_recent_news:                 '📰 Actualités',
  calculate_portfolio_performance: '📊 Performance',
  save_client_insight:             '💾 Sauvegarde',
  get_client_profile:              '👤 Profil',
  get_conversation_history:        '💬 Historique',
  detect_user_mood:                '🎭 Analyse',
  compare_to_similar_clients:      '🔄 Comparaison',
  simulate_scenario:               '🔮 Simulation',
  web_search:                      '🔍 Recherche web',
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
    .replace(/\[CHART:[A-Z0-9.\-]+\]/gi, '')
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
    .map((s) => s.text).join('');
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
  return parseSegments(stripMarkdown(content))
    .filter((s): s is { type: 'chart'; symbol: string } => s.type === 'chart')
    .map((s) => s.symbol);
}

// ── Sound wave bars (ChatGPT-style) ───────────────────────────────────────────
const BAR_HEIGHTS = [28, 46, 64, 52, 36, 58, 30];
const BAR_DELAYS  = [0, 110, 220, 155, 270, 85, 195];

function SoundBars({ active, fast }: { active: boolean; fast: boolean }) {
  return (
    <div className="flex items-end justify-center gap-1.5" style={{ height: 68 }}>
      {BAR_HEIGHTS.map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: h,
            borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.88)',
            transformOrigin: 'bottom',
            transform: active ? undefined : 'scaleY(0.12)',
            animationName: active ? 'voiceBar' : 'none',
            animationDuration: fast ? '0.45s' : '0.85s',
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDelay: `${BAR_DELAYS[i]}ms`,
            transition: active ? 'none' : 'transform 0.4s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── Voice overlay (full-screen, ChatGPT-style) ────────────────────────────────
function VoiceOverlay({
  isOpen,
  voiceState,
  interimTranscript,
  assistantText,
  onToggleMic,
  onClose,
}: {
  isOpen:             boolean;
  voiceState:         VoiceState;
  interimTranscript:  string;
  assistantText:      string;
  onToggleMic:        () => void;
  onClose:            () => void;
}) {
  if (!isOpen) return null;

  const listening  = voiceState === 'listening';
  const processing = voiceState === 'processing';
  const speaking   = voiceState === 'speaking';

  const statusText =
    listening  ? 'Je vous écoute…'        :
    processing ? 'Réflexion en cours…'    :
    speaking   ? 'Je vous réponds…'       :
                 'Appuyez sur le micro pour parler';

  const displayText = stripMarkdown(assistantText).slice(-220);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none"
      style={{ background: 'rgba(4, 4, 16, 0.97)', backdropFilter: 'blur(16px)' }}
    >
      {/* Keyframes injected locally */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes voiceBar {
          0%, 100% { transform: scaleY(0.12); }
          50%       { transform: scaleY(1);    }
        }
        @keyframes orbListen {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(129,140,248,0.55), 0 0 50px 12px rgba(99,102,241,0.25);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 22px rgba(129,140,248,0), 0 0 80px 24px rgba(99,102,241,0.45);
            transform: scale(1.07);
          }
        }
        @keyframes orbThink {
          0%   { transform: rotate(0deg)   scale(0.96); opacity: 0.75; }
          50%  { transform: rotate(180deg) scale(1.04); opacity: 1;    }
          100% { transform: rotate(360deg) scale(0.96); opacity: 0.75; }
        }
        @keyframes orbSpeak {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(52,211,153,0.55), 0 0 50px 12px rgba(16,185,129,0.25);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 18px rgba(52,211,153,0), 0 0 80px 24px rgba(16,185,129,0.45);
            transform: scale(1.09);
          }
        }
        .orb-listen { animation: orbListen 1.7s ease-in-out infinite; }
        .orb-think  { animation: orbThink  2.2s linear    infinite; }
        .orb-speak  { animation: orbSpeak  0.65s ease-in-out infinite; }
      `}} />

      {/* ── Close ── */}
      <button
        onClick={onClose}
        aria-label="Quitter le mode vocal"
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all text-xl font-light"
      >
        ✕
      </button>

      {/* ── Orb ── */}
      <div
        className={`w-36 h-36 rounded-full flex items-center justify-center ${
          listening  ? 'bg-gradient-to-br from-indigo-500 to-violet-700 orb-listen' :
          processing ? 'bg-gradient-to-br from-slate-500  to-indigo-600 orb-think'  :
          speaking   ? 'bg-gradient-to-br from-emerald-400 to-teal-600  orb-speak'  :
                       'bg-gradient-to-br from-indigo-400  to-violet-600'
        }`}
      >
        <SoundBars active={listening || speaking} fast={speaking} />
      </div>

      {/* ── Status ── */}
      <p className="mt-9 text-white text-lg font-medium tracking-wide">
        {statusText}
      </p>

      {/* ── Interim transcript ── */}
      {interimTranscript && (
        <p
          aria-live="polite"
          className="mt-3 text-white/55 text-base italic px-10 text-center max-w-sm leading-snug"
        >
          &ldquo;{interimTranscript}&rdquo;
        </p>
      )}

      {/* ── Last agent response (streaming preview) ── */}
      {(speaking || processing) && displayText && (
        <p className="mt-4 text-white/40 text-sm px-12 text-center max-w-md leading-relaxed line-clamp-3">
          {displayText}
        </p>
      )}

      {/* ── Controls ── */}
      <div className="mt-14 flex flex-col items-center gap-4">
        <button
          onClick={onToggleMic}
          aria-label={listening ? "Arrêter l'écoute" : speaking ? "Interrompre l'agent" : "Parler"}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all shadow-xl ${
            listening
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/40'
              : speaking
              ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/40'
              : 'bg-white/15 hover:bg-white/25'
          }`}
        >
          {listening ? '⏹' : speaking ? '⏸' : '🎤'}
        </button>

        <p className="text-white/22 text-xs tracking-wide">
          {listening
            ? 'Silence détecté → envoi automatique'
            : speaking
            ? 'Appuyez pour interrompre'
            : 'La conversation continue automatiquement'}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatInterface() {
  const { t } = useLanguage();

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [activeTools, setActiveTools]     = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // ── Voice state ──────────────────────────────────────────────────────────────
  const [voiceSupported, setVoiceSupported]       = useState(false);
  const [voiceOverlayOpen, setVoiceOverlayOpen]   = useState(false);
  const [isListening, setIsListening]             = useState(false);
  const [isSpeaking, setIsSpeaking]               = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError]               = useState('');
  const voiceManagerRef     = useRef<VoiceManager | null>(null);
  const voiceOverlayOpenRef = useRef(false);
  const sendMessageRef      = useRef<(text: string) => Promise<void>>(async () => {});

  // Derived
  const voiceState: VoiceState =
    isLoading  ? 'processing' :
    isSpeaking ? 'speaking'   :
    isListening? 'listening'  :
                 'idle';

  const lastAssistantMsg =
    [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';

  // ── Scroll ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load history ─────────────────────────────────────────────────────────────
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
    if (!isVoiceSupported()) return;
    setVoiceSupported(true);

    const initVoice = async () => {
      let lang: VoiceLanguage = 'fr';
      try {
        const res = await fetch('/api/user-settings');
        if (res.ok) {
          const data = await res.json();
          if (['fr','en','es','ru','ro'].includes(data.language)) {
            lang = data.language as VoiceLanguage;
          }
        }
      } catch { /* use default */ }

      const vm = new VoiceManager(lang);

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

  // ── Auto-restart listening when overlay is open and idle ─────────────────────
  useEffect(() => {
    if (!voiceOverlayOpen || isLoading || isSpeaking || isListening) return;
    const timer = setTimeout(() => {
      if (voiceOverlayOpenRef.current && voiceManagerRef.current) {
        voiceManagerRef.current.startListening();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [voiceOverlayOpen, isLoading, isSpeaking, isListening]);

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
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') break;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.text) {
            assistantMessage += parsed.text;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', content: assistantMessage };
              return next;
            });
            onDelta?.(parsed.text);
          }
          if (parsed.type === 'tool_start' && parsed.name) {
            const label = TOOL_LABELS[parsed.name] ?? parsed.name;
            setActiveTools((prev) => prev.includes(label) ? prev : [...prev, label]);
          }
          if (parsed.type === 'tool_end' && parsed.name) {
            const label = TOOL_LABELS[parsed.name] ?? parsed.name;
            setActiveTools((prev) => prev.filter((l) => l !== label));
          }
        } catch { /* ignore */ }
      }
    }
  };

  // ── sendMessage ───────────────────────────────────────────────────────────────
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

      // In overlay mode, always speak. Outside overlay, no TTS.
      const shouldSpeak = voiceOverlayOpenRef.current && !!voiceManagerRef.current;
      await streamResponse(
        response,
        shouldSpeak ? (delta) => voiceManagerRef.current?.speakStreaming(delta) : undefined
      );
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

  // Keep ref fresh so VoiceManager callbacks always call latest sendMessage
  useEffect(() => { sendMessageRef.current = sendMessage; });

  // ── Onboarding ────────────────────────────────────────────────────────────────
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

  // ── Text input handlers ───────────────────────────────────────────────────────
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

  // ── Voice overlay controls ────────────────────────────────────────────────────
  const openVoiceOverlay = () => {
    // Vérification au clic (pas au render) — bouton toujours visible
    if (!isVoiceSupported()) {
      setVoiceError('Le mode vocal nécessite Chrome ou Edge — votre navigateur ne supporte pas cette fonctionnalité.');
      setTimeout(() => setVoiceError(''), 5000);
      return;
    }
    voiceOverlayOpenRef.current = true;
    setVoiceOverlayOpen(true);
    // Si VoiceManager pas encore prêt (race condition au premier clic), on attend
    if (voiceManagerRef.current) {
      voiceManagerRef.current.startListening();
    }
  };

  const closeVoiceOverlay = () => {
    voiceManagerRef.current?.stopListening();
    voiceManagerRef.current?.stopSpeaking();
    voiceOverlayOpenRef.current = false;
    setVoiceOverlayOpen(false);
    setInterimTranscript('');
  };

  const toggleOverlayMic = () => {
    const vm = voiceManagerRef.current;
    if (!vm) return;
    if (isListening) {
      vm.stopListening();
    } else if (isSpeaking) {
      vm.stopSpeaking();
      // Auto-restart will fire via useEffect after 500ms
    } else {
      vm.startListening();
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

      {/* ── Voice overlay (portal-style, fixed position) ─────────────────────── */}
      <VoiceOverlay
        isOpen={voiceOverlayOpen}
        voiceState={voiceState}
        interimTranscript={interimTranscript}
        assistantText={lastAssistantMsg}
        onToggleMic={toggleOverlayMic}
        onClose={closeVoiceOverlay}
      />

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

      {/* ── Voice error banner ────────────────────────────────────────────────── */}
      {voiceError && (
        <div className="flex-shrink-0 mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs" role="alert">
          {voiceError}
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
            placeholder={t.chat_placeholder}
            rows={2}
            className="flex-1 bg-[#f8f9fa] border border-[#e5e7eb] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:border-indigo-400 resize-none transition-colors"
            disabled={isLoading}
          />

          {/* Mic button — toujours visible, gère le cas non supporté au clic */}
          <button
              type="button"
              onClick={openVoiceOverlay}
              aria-label="Activer le mode vocal"
              className={`relative flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                voiceOverlayOpen
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40'
                  : 'bg-[#f3f4f6] hover:bg-indigo-50 text-[#6b7280] hover:text-indigo-600'
              }`}
            >
              {voiceOverlayOpen && (
                <span className="absolute inset-0 rounded-xl bg-indigo-500 animate-ping opacity-30" />
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="relative w-5 h-5"
              >
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
              </svg>
            </button>

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
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
