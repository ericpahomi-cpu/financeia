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

// ── Known financial tickers for auto-detection ────────────────────────────────
const KNOWN_TICKERS = new Set([
  // Crypto
  'BTC','ETH','SOL','BNB','ADA','XRP','DOGE','DOT','AVAX','MATIC',
  'LINK','UNI','ATOM','LTC','SUI','APT','NEAR','TON','SHIB','TRX',
  'PEPE','INJ','SEI','TIA','OP','ARB','FTM','SAND','MANA','AXS',
  // Stocks
  'AAPL','NVDA','TSLA','MSFT','GOOGL','GOOG','AMZN','META','NFLX',
  'AMD','INTC','SPY','QQQ','COIN','MSTR','GME','AMC','PLTR','RIVN',
  'NIO','BABA','TSM','ASML','SHOP','SQ','PYPL','UBER','LYFT','SNAP',
]);

// ── Markdown stripper (display only — does NOT remove [CHART:] tags) ──────────
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

// ── TTS text cleaner ──────────────────────────────────────────────────────────
function cleanTextForSpeech(text: string): string {
  return text
    // ── Emojis & symbols ───────────────────────────────────────────────────
    // Surrogate pairs — covers all non-BMP emoji (U+1F000–U+1FAFF, etc.)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    // BMP symbol blocks: dingbats, misc symbols, enclosed alphanumerics, etc.
    .replace(/[⌀-➿⬀-⯿︀-﻿]/g, '')
    // ── Remove non-speech tags ─────────────────────────────────────────────
    .replace(/\[CHART:[A-Z0-9.\-]+\]/gi, '')
    // ── Remove markdown ────────────────────────────────────────────────────
    .replace(/[*_~`#>|]/g, '')
    // ── Remove list markers ─────────────────────────────────────────────────
    .replace(/^\s*[-•·▪▸]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // ── Remove URLs ─────────────────────────────────────────────────────────
    .replace(/https?:\/\/\S+/g, '')
    // ── Strip greeting openers (TTS last-resort filter) ─────────────────────
    // These patterns are forbidden in the system prompt, but strip them from TTS
    // anyway as a safety net — they sound terrible when spoken repeatedly.
    // Patterns anchored to start-of-string (after trimming) AND mid-sentence.
    .replace(/^(Bonjour|Bonsoir|Salut|Bienvenue|Hello|Coucou)[,!\s]+(\w+[,!\s]+)*/i, '')
    .replace(/^Ravi(e)? de (vous|te) (retrouver|revoir|voir|parler)[,.\s]*/i, '')
    .replace(/^J['']espère que (tu vas|vous allez) bien[,.\s]*/i, '')
    .replace(/^Comment (vas-tu|allez-vous|ça va)[,?\s]*/i, '')
    .replace(/^(Bien sûr|Absolument|Certainement|Avec plaisir|Bien entendu)[,!\s]*/i, '')
    .replace(/^(Très bien|Parfait|Super|Excellent)[,!\s]*/i, '')
    // ── Financial symbol → spoken word ──────────────────────────────────────
    .replace(/(\d[\d\s,]*)\s*%/g,  '$1 pourcent')
    .replace(/\$\s*(\d)/g,          '$1 dollars')
    .replace(/€\s*(\d)/g,           '$1 euros')
    .replace(/£\s*(\d)/g,           '$1 livres')
    .replace(/\+(\d)/g,             'plus $1')
    .replace(/\bCA\$/g,             'dollars canadiens')
    // ── Abbreviation expansions ─────────────────────────────────────────────
    .replace(/\bvs\.?\b/gi,         'versus')
    .replace(/\bex\.\s+/gi,         'par exemple ')
    .replace(/\betc\.\s*/gi,        'et cetera ')
    .replace(/\bn°\s*/gi,           'numéro ')
    // ── Clean whitespace ────────────────────────────────────────────────────
    .replace(/\s{2,}/g, ' ')
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

// ── BubbleText — renders message text without [CHART:] tags ──────────────────
function BubbleText({ content }: { content: string }) {
  // Parse segments from raw content, then display only text parts
  const segments = parseSegments(content);
  const textOnly = segments
    .filter((s): s is { type: 'text'; text: string } => s.type === 'text')
    .map((s) => stripMarkdown(s.text)).join('');
  return <span style={{ whiteSpace: 'pre-wrap' }}>{textOnly}</span>;
}

// ── Chart widget ──────────────────────────────────────────────────────────────
function InlineChart({ symbol }: { symbol: string }) {
  const isCrypto = symbol.includes('-') ||
    /^(BTC|ETH|SOL|BNB|ADA|XRP|DOGE|DOT|AVAX|MATIC|LINK|UNI|ATOM|LTC|SUI|APT|INJ|SEI|TIA|NEAR|TON|SHIB|TRX|PEPE|OP|ARB|FTM|SAND|MANA|AXS)$/i.test(symbol);
  const tvSymbol = toTVSymbol(symbol, isCrypto ? 'crypto' : 'stock');
  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-[#f3f4f6]">
        <span className="font-semibold text-sm text-[#1a1a1a]">{symbol}</span>
        <span className="text-[#9ca3af] text-xs">{tvSymbol}</span>
      </div>
      <div style={{ height: 380, width: '100%' }}>
        <TradingViewWidget tvSymbol={tvSymbol} height={380} />
      </div>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] animate-pulse" style={{ height: 56 }}>
      <div className="px-4 py-4 flex items-center gap-2 text-[#9ca3af] text-sm">
        <span>📊</span><span>Chargement du graphique…</span>
      </div>
    </div>
  );
}

// ── getChartSymbols: explicit tags first, then auto-detect ────────────────────
function getChartSymbols(content: string): string[] {
  // 1. Explicit [CHART:X] tags in raw content (Claude inserts these via system prompt)
  const explicit: string[] = [];
  const CHART_RE = /\[CHART:([A-Z0-9.\-]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = CHART_RE.exec(content)) !== null) {
    const sym = m[1].toUpperCase();
    if (!explicit.includes(sym)) explicit.push(sym);
  }
  if (explicit.length > 0) return explicit.slice(0, 3);

  // 2. Auto-detect known tickers from plain text (fallback when Claude forgets)
  const stripped = stripMarkdown(content);
  const autoDetected: string[] = [];
  const tickerRe = /\b([A-Z]{2,6}(?:-USD)?)\b/g;
  while ((m = tickerRe.exec(stripped)) !== null) {
    const sym = m[1];
    if (KNOWN_TICKERS.has(sym) && !autoDetected.includes(sym)) {
      autoDetected.push(sym);
    }
  }
  return autoDetected.slice(0, 3);
}

// ── Wave visualizer data (pre-computed sinusoidal heights) ────────────────────
const WAVE_COUNT = 30;
const WAVE_DATA = Array.from({ length: WAVE_COUNT }, (_, i) => ({
  height: Math.round(8 + Math.abs(Math.sin(i * 0.38 + 0.6)) * 44 + Math.abs(Math.sin(i * 0.75 + 1.2)) * 16),
  delay:  Math.round(i * 48 + Math.abs(Math.sin(i * 1.8)) * 70),
}));

// ── Premium Voice Overlay ─────────────────────────────────────────────────────
function VoiceOverlay({
  isOpen, voiceState, isTranscribing, interimTranscript, assistantText,
  overlayTicker, onToggleMic, onClose,
}: {
  isOpen: boolean; voiceState: VoiceState; isTranscribing: boolean;
  interimTranscript: string; assistantText: string;
  overlayTicker: string | null;
  onToggleMic: () => void; onClose: () => void;
}) {
  if (!isOpen) return null;

  const listening  = voiceState === 'listening';
  const processing = voiceState === 'processing';
  const speaking   = voiceState === 'speaking';

  const statusText =
    listening  ? 'Je vous écoute…'                                    :
    processing ? (isTranscribing ? 'Transcription…' : 'Réflexion…')  :
    speaking   ? 'Je vous réponds…'                                    :
                 'Parlez pour commencer';

  // Only show last 180 chars of response in overlay preview
  const previewText = stripMarkdown(assistantText)
    .replace(/\[CHART:[A-Z0-9.\-]+\]/gi, '')
    .slice(-180).trim();

  // TradingView symbol resolution for overlay ticker
  const isCryptoTicker = overlayTicker && (
    overlayTicker.includes('-') ||
    /^(BTC|ETH|SOL|BNB|ADA|XRP|DOGE|DOT|AVAX|MATIC|LINK|UNI|ATOM|LTC|SUI|APT|INJ|SEI|TIA|NEAR|TON|SHIB|TRX|PEPE|OP|ARB|FTM|SAND|MANA|AXS)$/i.test(overlayTicker)
  );
  const tvSymbol = overlayTicker
    ? toTVSymbol(overlayTicker, isCryptoTicker ? 'crypto' : 'stock')
    : null;

  // Show chart when ticker is available and user is not currently speaking (listening)
  const showChart = !!tvSymbol && !listening;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 130% 80% at 50% -5%, #1e1250 0%, #0b0525 45%, #020110 100%)',
      }}
    >
      {/* ── CSS keyframes ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes voiceBar {
          0%, 100% { transform: scaleY(0.12); opacity: 0.4; }
          50%       { transform: scaleY(1);    opacity: 1;   }
        }
        @keyframes orbListenGlow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(99,102,241,0.6),
                        0 0 60px 15px rgba(99,102,241,0.2),
                        0 0 120px 40px rgba(139,92,246,0.1);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 28px rgba(99,102,241,0),
                        0 0 90px 30px rgba(99,102,241,0.4),
                        0 0 180px 60px rgba(139,92,246,0.2);
            transform: scale(1.055);
          }
        }
        @keyframes orbSpeakGlow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(16,185,129,0.65),
                        0 0 60px 15px rgba(16,185,129,0.2);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 24px rgba(16,185,129,0),
                        0 0 90px 30px rgba(16,185,129,0.4);
            transform: scale(1.07);
          }
        }
        @keyframes orbThinkPulse {
          0%, 100% { opacity: 0.7; transform: scale(0.98); filter: hue-rotate(0deg); }
          50%       { opacity: 1;   transform: scale(1.02); filter: hue-rotate(25deg); }
        }
        @keyframes ringExpand {
          0%   { transform: scale(1);   opacity: 0.45; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes ringExpand2 {
          0%   { transform: scale(1);   opacity: 0.25; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .orb-listen { animation: orbListenGlow 2s ease-in-out infinite; }
        .orb-speak  { animation: orbSpeakGlow  0.7s ease-in-out infinite; }
        .orb-think  { animation: orbThinkPulse 2.4s ease-in-out infinite; }
        .ring-1 { animation: ringExpand  2s ease-out infinite; }
        .ring-2 { animation: ringExpand2 2s ease-out infinite 0.7s; }
        .speak-ring-1 { animation: ringExpand  0.9s ease-out infinite; }
        .speak-ring-2 { animation: ringExpand2 0.9s ease-out infinite 0.35s; }
      `}} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 pt-6 pb-0 flex-shrink-0">
        <span className="text-white/25 text-xs font-semibold tracking-[0.25em] uppercase">
          FinanceAI
        </span>
        <button
          onClick={onClose}
          aria-label="Quitter le mode vocal"
          className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ── Center content ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-7 px-8 min-h-0">

        {/* Orb with ripple rings */}
        <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>

          {/* Ripple rings — listening */}
          {listening && (
            <>
              <div className="ring-1 absolute inset-0 rounded-full border border-indigo-400/60" />
              <div className="ring-2 absolute inset-0 rounded-full border border-violet-400/40" />
            </>
          )}
          {/* Ripple rings — speaking */}
          {speaking && (
            <>
              <div className="speak-ring-1 absolute inset-0 rounded-full border border-emerald-400/60" />
              <div className="speak-ring-2 absolute inset-0 rounded-full border border-teal-400/40" />
            </>
          )}

          {/* Main orb */}
          <div
            className={`w-44 h-44 rounded-full flex items-center justify-center relative ${
              listening  ? 'orb-listen' :
              processing ? 'orb-think'  :
              speaking   ? 'orb-speak'  : ''
            }`}
            style={{
              background: listening
                ? 'radial-gradient(circle at 38% 32%, #818cf8, #6366f1 40%, #7c3aed 75%, #4c1d95)'
                : processing
                ? 'radial-gradient(circle at 38% 32%, #94a3b8, #6366f1 50%, #4338ca)'
                : speaking
                ? 'radial-gradient(circle at 38% 32%, #6ee7b7, #10b981 45%, #0891b2 80%, #0e7490)'
                : 'radial-gradient(circle at 38% 32%, #a5b4fc, #6366f1 50%, #5b21b6)',
            }}
          >
            {/* Inner shine */}
            <div
              className="absolute rounded-full"
              style={{
                top: '14%', left: '18%', width: '36%', height: '28%',
                background: 'rgba(255,255,255,0.18)',
                filter: 'blur(6px)',
              }}
            />
            {/* Icon inside orb */}
            <div className="relative z-10 opacity-50">
              {processing ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }}>
                  <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8">
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                  <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Status text */}
        <div className="text-center space-y-2">
          <p className="text-white text-xl font-medium tracking-wide">{statusText}</p>
          {interimTranscript && (
            <p
              aria-live="polite"
              className="text-white/55 text-base italic leading-snug max-w-xs"
            >
              &ldquo;{interimTranscript}&rdquo;
            </p>
          )}
        </div>

        {/* Agent response preview (speaking/processing) */}
        {(speaking || processing) && previewText && (
          <p className="text-white/32 text-sm text-center max-w-sm leading-relaxed px-4"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {previewText}
          </p>
        )}
      </div>

      {/* ── TradingView chart OR wave visualizer ── */}
      {showChart ? (
        /* ── Inline chart (shown when agent mentions a ticker) ── */
        <div className="flex-shrink-0 px-4 pb-1" style={{ height: 232 }}>
          {/* Ticker label bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" style={{ boxShadow: '0 0 6px #10b981' }} />
            <span className="text-white/60 text-xs font-mono tracking-wider">{overlayTicker}</span>
            <span className="text-white/25 text-xs">{tvSymbol}</span>
          </div>
          {/* Chart */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ height: 200, border: '1px solid rgba(255,255,255,0.08)', background: '#0f0f1a' }}
          >
            <TradingViewWidget key={tvSymbol!} tvSymbol={tvSymbol!} height={200} />
          </div>
        </div>
      ) : (
        /* ── Wave visualizer (default) ── */
        <div
          className="flex-shrink-0 flex items-end justify-center gap-0.5 px-6"
          style={{ height: 72 }}
        >
          {WAVE_DATA.map(({ height, delay }, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                maxWidth: 6,
                height,
                borderRadius: 3,
                backgroundColor: speaking
                  ? 'rgba(52,211,153,0.75)'
                  : listening
                  ? 'rgba(129,140,248,0.75)'
                  : 'rgba(255,255,255,0.2)',
                transformOrigin: 'bottom',
                transform: (listening || speaking) ? undefined : 'scaleY(0.12)',
                animationName: (listening || speaking) ? 'voiceBar' : 'none',
                animationDuration: speaking ? '0.5s' : '0.9s',
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                animationDelay: `${delay}ms`,
                transition: (listening || speaking) ? 'none' : 'transform 0.5s ease, background-color 0.4s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Control button ── */}
      <div className="flex-shrink-0 flex flex-col items-center gap-3 py-8">
        <button
          onClick={onToggleMic}
          aria-label={listening ? "Arrêter l'écoute" : speaking ? "Interrompre" : "Parler"}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl ${
            listening
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/50'
              : speaking
              ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/50'
              : 'shadow-black/40'
          }`}
          style={!listening && !speaking ? { background: 'rgba(255,255,255,0.12)' } : {}}
        >
          {listening ? (
            <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
          ) : speaking ? (
            <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
              <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
            </svg>
          )}
        </button>
        <p className="text-white/22 text-xs tracking-wide">
          {listening ? 'Silence détecté → envoi auto' : speaking ? 'Appuyez pour interrompre' : 'Conversation continue automatiquement'}
        </p>
      </div>
    </div>
  );
}

// ── Main ChatInterface component ──────────────────────────────────────────────
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
  const [voiceOverlayOpen, setVoiceOverlayOpen]   = useState(false);
  const [isListening, setIsListening]             = useState(false);
  const [isTranscribing, setIsTranscribing]       = useState(false);
  const [isSpeaking, setIsSpeaking]               = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError]               = useState('');
  const [overlayTicker, setOverlayTicker]         = useState<string | null>(null);
  const voiceManagerRef     = useRef<VoiceManager | null>(null);
  const voiceOverlayOpenRef = useRef(false);
  const sendMessageRef      = useRef<(text: string) => Promise<void>>(async () => {});
  const sentencesSpokenRef  = useRef(0);
  const MAX_SPOKEN_SENTENCES = 3;

  // ── Derived state ───────────────────────────────────────────────────────────
  const voiceState: VoiceState =
    isLoading      ? 'processing' :
    isTranscribing ? 'processing' :
    isSpeaking     ? 'speaking'   :
    isListening    ? 'listening'  : 'idle';

  const lastAssistantMsg =
    [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';

  // ── Effects ─────────────────────────────────────────────────────────────────
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
      vm.onListeningChange    = setIsListening;
      vm.onSpeakingChange     = setIsSpeaking;
      vm.onTranscribingChange = setIsTranscribing;
      vm.onError = (err) => {
        setVoiceError(err);
        setTimeout(() => setVoiceError(''), 6000);
      };
      voiceManagerRef.current = vm;
    };

    initVoice();
    return () => { voiceManagerRef.current?.dispose(); };
  }, []);

  // ── Auto-restart listening when overlay open and idle ─────────────────────────
  useEffect(() => {
    if (!voiceOverlayOpen || isLoading || isSpeaking || isListening) return;
    const timer = setTimeout(() => {
      if (voiceOverlayOpenRef.current && voiceManagerRef.current) {
        voiceManagerRef.current.startListening();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [voiceOverlayOpen, isLoading, isSpeaking, isListening]);

  // ── Detect ticker in latest assistant message (shows chart in overlay) ─────
  useEffect(() => {
    if (!voiceOverlayOpen || !lastAssistantMsg) return;
    const symbols = getChartSymbols(lastAssistantMsg);
    setOverlayTicker(symbols[0] ?? null);
  }, [lastAssistantMsg, voiceOverlayOpen]);

  // ── Clear overlay ticker when user starts speaking (barge-in) ─────────────
  useEffect(() => {
    if (isListening) setOverlayTicker(null);
  }, [isListening]);

  // ── Core streaming ───────────────────────────────────────────────────────────
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
        } catch { /* ignore partial JSON */ }
      }
    }
  };

  // ── sendMessage ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setActiveTools([]);
    sentencesSpokenRef.current = 0; // reset sentence counter for new message

    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
      });
      if (!response.ok || !response.body) throw new Error('Erreur serveur');

      const shouldSpeak = voiceOverlayOpenRef.current && !!voiceManagerRef.current;

      console.log('[Chat] shouldSpeak:', shouldSpeak);

      const onDelta = shouldSpeak
        ? (delta: string) => {
            if (sentencesSpokenRef.current >= MAX_SPOKEN_SENTENCES) return;
            const cleaned = cleanTextForSpeech(delta);
            console.log('[Chat] onDelta → cleaned:', JSON.stringify(cleaned.slice(0, 60)));
            if (cleaned.trim()) {
              voiceManagerRef.current?.speakStreaming(cleaned);
              sentencesSpokenRef.current += (cleaned.match(/[.!?]+/g) || []).length;
            }
          }
        : undefined;

      await streamResponse(response, onDelta);
      if (shouldSpeak && sentencesSpokenRef.current < MAX_SPOKEN_SENTENCES) {
        voiceManagerRef.current?.flushStreamBuffer();
      }

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

  // Keep sendMessageRef fresh so voice callbacks always call the latest version
  useEffect(() => { sendMessageRef.current = sendMessage; });

  // ── Onboarding ───────────────────────────────────────────────────────────────
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
    if (!isVoiceSupported()) {
      setVoiceError('Le mode vocal nécessite Chrome ou Edge — votre navigateur ne supporte pas cette fonctionnalité.');
      setTimeout(() => setVoiceError(''), 5000);
      return;
    }
    voiceOverlayOpenRef.current = true;
    setVoiceOverlayOpen(true);
    voiceManagerRef.current?.startListening();
  };

  const closeVoiceOverlay = () => {
    voiceManagerRef.current?.stopListening();
    voiceManagerRef.current?.stopSpeaking();
    voiceOverlayOpenRef.current = false;
    setVoiceOverlayOpen(false);
    setInterimTranscript('');
    setOverlayTicker(null);
  };

  const toggleOverlayMic = () => {
    const vm = voiceManagerRef.current;
    if (!vm) return;
    if (isListening)     { vm.stopListening(); }
    else if (isSpeaking) { vm.stopSpeaking(); }
    else                 { vm.startListening(); }
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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Voice overlay — fixed, full screen */}
      <VoiceOverlay
        isOpen={voiceOverlayOpen}
        voiceState={voiceState}
        isTranscribing={isTranscribing}
        interimTranscript={interimTranscript}
        assistantText={lastAssistantMsg}
        overlayTicker={overlayTicker}
        onToggleMic={toggleOverlayMic}
        onClose={closeVoiceOverlay}
      />

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message, index) => {
          const isLastAndStreaming = isLoading && index === messages.length - 1;
          const chartSymbols = message.role === 'assistant' && !isLastAndStreaming
            ? getChartSymbols(message.content)
            : [];

          return (
            <div key={index}>
              {/* Bubble row */}
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

              {/* Charts — below bubble, only after streaming completes */}
              {chartSymbols.length > 0 && (
                <div className="ml-10 space-y-3 mt-1">
                  {chartSymbols.map((sym) => (
                    <InlineChart key={sym} symbol={sym} />
                  ))}
                </div>
              )}

              {/* Chart placeholder during streaming */}
              {isLastAndStreaming && message.role === 'assistant' && (
                <div className="ml-10">
                  {/* placeholder shown only if we detect chart tags mid-stream */}
                  {getChartSymbols(message.content).map((_, i) => (
                    <ChartPlaceholder key={i} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Tool badges ────────────────────────────────────────────────────── */}
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

      {/* ── Voice error banner ──────────────────────────────────────────────── */}
      {voiceError && (
        <div className="flex-shrink-0 mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs" role="alert">
          {voiceError}
        </div>
      )}

      {/* ── Input area ──────────────────────────────────────────────────────── */}
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

          {/* Mic button — always visible */}
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
              <span className="absolute inset-0 rounded-xl bg-indigo-500 animate-ping opacity-25" />
            )}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="relative w-5 h-5">
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
