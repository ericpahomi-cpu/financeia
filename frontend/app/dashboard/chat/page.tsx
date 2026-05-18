'use client';

import { useState } from 'react';
import ChatInterface from '@/components/ChatInterface';
import { useLanguage } from '@/lib/language-context';

type Tab = 'chat' | 'pronostics';

interface Reference { title: string; url: string; }
interface Prediction {
  symbol:       string;
  direction:    'hausse' | 'baisse' | 'neutre';
  confidence:   number;
  target_price: number | null;
  timeframe:    string;
  reasoning:    string;
  references:   Reference[];
  risks:        string[];
}

const DIR_CONFIG = {
  hausse: {
    label:  'HAUSSE',
    icon:   '🟢',
    border: 'border-emerald-400',
    bg:     'bg-emerald-50',
    text:   'text-emerald-700',
    bar:    'bg-emerald-500',
  },
  baisse: {
    label:  'BAISSE',
    icon:   '🔴',
    border: 'border-red-400',
    bg:     'bg-red-50',
    text:   'text-red-600',
    bar:    'bg-red-500',
  },
  neutre: {
    label:  'NEUTRE',
    icon:   '🟡',
    border: 'border-amber-400',
    bg:     'bg-amber-50',
    text:   'text-amber-600',
    bar:    'bg-amber-400',
  },
} as const;

export default function ChatPage() {
  const { t } = useLanguage();
  const [tab, setTab]             = useState<Tab>('chat');
  const [symbol, setSymbol]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError]         = useState('');

  const analyze = async () => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) return;
    setLoading(true);
    setError('');
    setPrediction(null);
    try {
      const res  = await fetch('/api/predictions/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbol: ticker }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur lors de l\'analyse');
      } else {
        setPrediction(data as Prediction);
      }
    } catch {
      setError('Erreur réseau — réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        tab === id
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a1a]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-screen">
      {/* ── Header + tabs ──────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-4 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-3">💬 {t.chat_title}</h1>
        <div className="flex gap-2">
          {tabBtn('chat',       '💬 Chat')}
          {tabBtn('pronostics', '🎯 Pronostics')}
        </div>
      </div>

      {/* ── Chat tab ───────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div className="flex-1 min-h-0">
          <ChatInterface />
        </div>
      )}

      {/* ── Pronostics tab ─────────────────────────────────────────────────── */}
      {tab === 'pronostics' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Search card */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-[#1a1a1a] mb-1">Analyse d&apos;un actif</h2>
            <p className="text-[#6b7280] text-sm mb-4">
              Entrez un symbole pour obtenir un pronostic IA basé sur les données en temps réel.
            </p>
            <div className="flex gap-3">
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && !loading && analyze()}
                placeholder="Ex : AAPL, BTC-USD, NVDA, ETH-USD…"
                className="flex-1 bg-[#f8f9fa] border border-[#e5e7eb] rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:border-indigo-400 font-mono tracking-wide"
              />
              <button
                onClick={analyze}
                disabled={loading || !symbol.trim()}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  loading || !symbol.trim()
                    ? 'bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
              >
                {loading ? '⏳ Analyse…' : '🔍 Analyser'}
              </button>
            </div>
            <p className="text-[#9ca3af] text-xs mt-2">
              Recherche web en temps réel — peut prendre 10 à 20 secondes.
            </p>
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 text-center shadow-sm">
              <div className="text-4xl mb-3 animate-pulse">🔍</div>
              <p className="text-[#1a1a1a] font-medium">Recherche en cours pour {symbol}…</p>
              <p className="text-[#9ca3af] text-sm mt-1">Claude consulte les sources de marché en temps réel.</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Result card */}
          {prediction && !loading && (() => {
            const dir = DIR_CONFIG[prediction.direction];
            return (
              <div className={`bg-white border-2 ${dir.border} rounded-xl shadow-sm overflow-hidden`}>

                {/* Direction header */}
                <div className={`${dir.bg} px-5 py-4 flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl leading-none">{dir.icon}</span>
                    <div>
                      <p className="text-xs text-[#6b7280] font-semibold uppercase tracking-widest mb-0.5">
                        {prediction.symbol}
                      </p>
                      <p className={`text-3xl font-extrabold tracking-tight ${dir.text}`}>
                        {dir.label}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {prediction.target_price != null && (
                      <>
                        <p className="text-xs text-[#6b7280]">Prix cible</p>
                        <p className="text-xl font-bold text-[#1a1a1a]">
                          ${prediction.target_price.toLocaleString()}
                        </p>
                      </>
                    )}
                    <p className="text-xs text-[#9ca3af] mt-0.5">{prediction.timeframe}</p>
                  </div>
                </div>

                <div className="p-5 space-y-5">

                  {/* Confidence bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                        Confiance
                      </span>
                      <span className={`text-sm font-bold ${dir.text}`}>
                        {prediction.confidence}%
                      </span>
                    </div>
                    <div className="h-2.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-700 ${dir.bar}`}
                        style={{ width: `${prediction.confidence}%` }}
                      />
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div>
                    <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
                      🤖 Raisonnement
                    </p>
                    <p className="text-[#374151] text-sm leading-relaxed">
                      {prediction.reasoning}
                    </p>
                  </div>

                  {/* References */}
                  {prediction.references.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
                        📰 Sources
                      </p>
                      <div className="space-y-1.5">
                        {prediction.references.map((ref, i) => (
                          <a
                            key={i}
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-1.5 text-indigo-600 text-xs hover:text-indigo-500 hover:underline"
                          >
                            <span className="mt-px flex-shrink-0">↗</span>
                            <span className="line-clamp-1">{ref.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risks */}
                  {prediction.risks.length > 0 && (
                    <div className="bg-[#fafafa] border border-[#f3f4f6] rounded-lg p-3.5">
                      <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
                        ⚠️ Risques principaux
                      </p>
                      <ul className="space-y-1">
                        {prediction.risks.map((risk, i) => (
                          <li key={i} className="text-xs text-[#6b7280] flex items-start gap-1.5">
                            <span className="flex-shrink-0 text-amber-400 mt-px">•</span>
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <p className="text-[#9ca3af] text-xs border-t border-[#f3f4f6] pt-3 leading-relaxed">
                    Ce pronostic est généré par IA à titre informatif uniquement.
                    Il ne constitue pas un conseil en investissement. Faites vos propres recherches.
                  </p>
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
