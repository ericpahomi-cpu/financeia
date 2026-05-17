'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });

interface WatchItem {
  symbol: string; name: string; type: 'stock' | 'crypto';
  reason: string; direction: 'hausse' | 'baisse' | 'neutre'; confidence: number;
}
interface Selected { symbol: string; name: string; type: 'stock' | 'crypto'; }

export default function SurveillerPage() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [cached, setCached]       = useState(false);
  const [selected, setSelected]   = useState<Selected | null>(null);
  const [error, setError]         = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json() as { watchlist: WatchItem[]; cached: boolean; error?: string };
      setWatchlist(data.watchlist || []);
      setCached(data.cached);
      if (data.error) setError(data.error);
    } catch {
      setError('Impossible de charger la liste');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dirColor = (d: string) =>
    d === 'hausse' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : d === 'baisse' ? 'text-red-500 bg-red-50 border-red-200'
    : 'text-amber-500 bg-amber-50 border-amber-200';

  const dirIcon = (d: string) => d === 'hausse' ? '📈' : d === 'baisse' ? '📉' : '➡️';

  const confColor = (c: number) =>
    c >= 70 ? 'bg-emerald-500' : c >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">👁️ À surveiller</h1>
          <p className="text-[#6b7280] text-sm">
            {cached ? 'Analyse mise en cache (< 1h)' : 'Analyse IA en temps réel avec recherche web'}
          </p>
        </div>
        <button onClick={load}
          className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600 text-sm hover:bg-indigo-100 transition-colors">
          🔄 Actualiser
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl p-4 animate-pulse h-24" />
          ))}
          <p className="text-center text-[#9ca3af] text-sm">Analyse du marché en cours... (peut prendre 20 secondes)</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button onClick={load} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Réessayer</button>
        </div>
      ) : (
        <div className="space-y-3">
          {watchlist.map((item, i) => (
            <div key={i}
              onClick={() => setSelected({ symbol: item.type === 'crypto' ? item.symbol.toLowerCase() : item.symbol, name: item.name, type: item.type })}
              className="bg-white border border-[#e5e7eb] rounded-xl p-4 cursor-pointer hover:shadow-md transition-all hover:border-indigo-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-[#1a1a1a]">{item.symbol}</span>
                    <span className="text-[#9ca3af] text-sm">{item.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${dirColor(item.direction)}`}>
                      {dirIcon(item.direction)} {item.direction}
                    </span>
                  </div>
                  <p className="text-[#6b7280] text-sm">{item.reason}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[#1a1a1a] font-bold text-lg">{item.confidence}%</div>
                  <div className="w-20 h-2 bg-[#f3f4f6] rounded-full mt-1">
                    <div className={`h-2 rounded-full ${confColor(item.confidence)}`}
                      style={{ width: `${item.confidence}%` }} />
                  </div>
                  <div className="text-[#9ca3af] text-xs mt-0.5">confiance</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1a1a1a]">{selected.symbol.toUpperCase()}</h2>
                <p className="text-[#6b7280] text-sm">{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9ca3af] hover:text-[#6b7280] text-2xl">×</button>
            </div>
            <TradingChart symbol={selected.symbol} type={selected.type} height={300} />
          </div>
        </div>
      )}
    </div>
  );
}
