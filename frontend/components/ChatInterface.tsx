'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/language-context';

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Chart tag parser ────────────────────────────────────────────────────────
// Splits a message into text segments and [CHART:SYMBOL] tags
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

// ── Inline chart range picker + chart ──────────────────────────────────────
type MiniRange = '1J' | '1SEM' | '1MOIS';

function InlineChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<MiniRange>('1MOIS');

  // Detect if it's a crypto by checking for -USD suffix or known crypto tickers
  const isCrypto = symbol.includes('-') || /^(BTC|ETH|SOL|BNB|ADA|XRP|DOGE|DOT|AVAX|MATIC|LINK|UNI|ATOM|LTC)$/i.test(symbol);
  const chartSymbol = isCrypto ? symbol.toLowerCase() : symbol;

  return (
    <div className="mt-2 mb-1 rounded-xl border border-[#e5e7eb] overflow-hidden bg-white">
      {/* Mini range bar */}
      <div className="flex gap-1 px-3 pt-2">
        {(['1J', '1SEM', '1MOIS'] as MiniRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              range === r ? 'bg-indigo-600 text-white' : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]'
            }`}
          >
            {r}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#9ca3af] self-center">{symbol}</span>
      </div>
      <TradingChart symbol={chartSymbol} type={isCrypto ? 'crypto' : 'stock'} height={200} rangeOverride={range} />
    </div>
  );
}

// ── Message renderer ────────────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  const segments = parseSegments(content);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{seg.text}</span>
        ) : (
          <InlineChart key={i} symbol={seg.symbol} />
        )
      )}
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ChatInterface() {
  const { t } = useLanguage();
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [isLoading, setIsLoading]   = useState(false);
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
          } catch { /* ignore */ }
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
        { role: 'assistant', content: 'Désolé, une erreur s\'est produite. Veuillez réessayer.' },
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
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                  ? <MessageContent content={message.content} />
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
        ))}
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
