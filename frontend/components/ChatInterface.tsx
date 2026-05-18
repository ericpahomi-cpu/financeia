'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/language-context';
import { toTVSymbol } from '@/lib/tv-symbol';

const TradingViewWidget = dynamic(() => import('@/components/TradingViewWidget'), { ssr: false });

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Markdown stripper (mirrors server-side, runs before display) ─────────────
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

// ── Chart tag parser ─────────────────────────────────────────────────────────
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

// ── Text-only content (inside bubble) ────────────────────────────────────────
function BubbleText({ content }: { content: string }) {
  const clean    = stripMarkdown(content);
  const segments = parseSegments(clean);
  // Render only text portions; charts are rendered outside the bubble
  const textOnly = segments
    .filter((s): s is { type: 'text'; text: string } => s.type === 'text')
    .map((s) => s.text)
    .join('');
  return <span style={{ whiteSpace: 'pre-wrap' }}>{textOnly}</span>;
}

// ── Full-width chart block (below bubble, only after streaming ends) ──────────
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
      {/* Give TradingView a clean, fixed-height container with no overflow clipping */}
      <div style={{ height: 420, width: '100%' }}>
        <TradingViewWidget tvSymbol={tvSymbol} height={420} />
      </div>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] animate-pulse"
      style={{ height: 60 }}>
      <div className="px-4 py-4 flex items-center gap-2 text-[#9ca3af] text-sm">
        <span>📊</span>
        <span>Chargement du graphique…</span>
      </div>
    </div>
  );
}

/** Extract explicit [CHART:X] tags from a completed message.
 *  Claude is instructed via system prompt to always include these tags —
 *  no client-side mapping needed.
 */
function getChartSymbols(content: string): string[] {
  const clean = stripMarkdown(content);
  const segments = parseSegments(clean);
  return segments
    .filter((s): s is { type: 'chart'; symbol: string } => s.type === 'chart')
    .map((s) => s.symbol);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatInterface() {
  const { t } = useLanguage();
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load history on mount
  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((data) => {
        const history: Message[] = (data.messages || []).map(
          (m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
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

  const triggerOnboarding = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Bonjour' }),
      });
      if (!response.body) return;
      await streamResponse(response);
    } finally {
      setIsLoading(false);
    }
  };

  const streamResponse = async (response: Response) => {
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
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              assistantMessage += parsed.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: assistantMessage };
                return next;
              });
            }
          } catch { /* ignore partial JSON */ }
        }
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      if (!response.ok || !response.body) throw new Error('Erreur serveur');
      await streamResponse(response);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Désolé, une erreur s'est produite. Veuillez réessayer." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

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
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message, index) => {
          const isLastAndStreaming = isLoading && index === messages.length - 1;
          const chartSymbols = message.role === 'assistant'
            ? getChartSymbols(message.content)
            : [];

          return (
            <div key={index}>
              {/* ── Bubble row ── */}
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
                    // Streaming dots
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

              {/* ── Charts — rendered OUTSIDE the bubble, AFTER streaming ends ── */}
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

      {/* Input */}
      <div className="border-t border-[#e5e7eb] p-4 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-3">
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
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
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
