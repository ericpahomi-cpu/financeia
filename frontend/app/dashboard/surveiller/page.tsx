'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/language-context';

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });

interface WatchItem {
  symbol: string; name: string; type: 'stock' | 'crypto';
  reason: string; direction: 'hausse' | 'baisse' | 'neutre'; confidence: number;
}

interface DetailData {
  price: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string;
}

interface Selected extends WatchItem {
  chartSymbol: string;
}

function formatVolume(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export default function SurveillerPage() {
  const { t } = useLanguage();
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [cached, setCached]       = useState(false);
  const [selected, setSelected]   = useState<Selected | null>(null);
  const [detail, setDetail]       = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError]         = useState('');

  const load = async (bypass = false) => {
    setLoading(true);
    setError('');
    try {
      const url = bypass ? '/api/watchlist?refresh=1' : '/api/watchlist';
      const res = await fetch(url);
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

  // Fetch live price/volume when an item is selected
  const openDetail = async (item: WatchItem) => {
    const chartSymbol = item.type === 'crypto'
      ? item.symbol.toLowerCase()
      : item.symbol;

    setSelected({ ...item, chartSymbol });
    setDetail(null);
    setDetailLoading(true);

    try {
      if (item.type === 'stock') {
        const res  = await fetch(`/api/markets?symbols=${encodeURIComponent(item.symbol)}`);
        const data = await res.json();
        const q    = data.quotes?.[0];
        setDetail({
          price:     q?.price ?? null,
          changePct: q?.changePct ?? null,
          volume:    q?.volume ?? null,
          currency:  q?.currency ?? 'USD',
        });
      } else {
        // Crypto: use CoinGecko markets endpoint
        const res  = await fetch(`/api/crypto?limit=250`);
        const data = await res.json();
        const coin = (data.coins || []).find(
          (c: { symbol: string }) => c.symbol.toLowerCase() === item.symbol.toLowerCase()
        );
        setDetail({
          price:     coin?.current_price ?? null,
          changePct: coin?.price_change_percentage_24h ?? null,
          volume:    coin?.total_volume ?? null,
          currency:  'USD',
        });
      }
    } catch {
      setDetail({ price: null, changePct: null, volume: null, currency: '' });
    } finally {
      setDetailLoading(false);
    }
  };

  const dirColor = (d: string) =>
    d === 'hausse' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : d === 'baisse' ? 'text-red-500 bg-red-50 border-red-200'
    : 'text-amber-500 bg-amber-50 border-amber-200';

  const dirIcon = (d: string) => d === 'hausse' ? '📈' : d === 'baisse' ? '📉' : '➡️';

  const confColor = (c: number) =>
    c >= 70 ? 'bg-emerald-500' : c >= 50 ? 'bg-amber-400' : 'bg-red-400';

  const pctColor = (v: number | null) =>
    v === null ? 'text-[#6b7280]' : v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-[#6b7280]';

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">👁️ {t.watchlist_title}</h1>
          <p className="text-[#6b7280] text-sm">
            {cached ? t.watchlist_cached : t.watchlist_live}
          </p>
        </div>
        <button onClick={() => load(true)}
          className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600 text-sm hover:bg-indigo-100 transition-colors">
          🔄 {t.refresh}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl p-4 animate-pulse h-24" />
          ))}
          <p className="text-center text-[#9ca3af] text-sm">{t.watchlist_loading}</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button onClick={() => load(true)} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">{t.retry}</button>
        </div>
      ) : (
        <div className="space-y-3">
          {watchlist.map((item, i) => (
            <div key={i}
              onClick={() => openDetail(item)}
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
                  <p className="text-[#6b7280] text-sm line-clamp-2">{item.reason}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[#1a1a1a] font-bold text-lg">{item.confidence}%</div>
                  <div className="w-20 h-2 bg-[#f3f4f6] rounded-full mt-1">
                    <div className={`h-2 rounded-full ${confColor(item.confidence)}`}
                      style={{ width: `${item.confidence}%` }} />
                  </div>
                  <div className="text-[#9ca3af] text-xs mt-0.5">{t.watchlist_confidence}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Rich detail modal ──────────────────────────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#1a1a1a]">{selected.symbol.toUpperCase()}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${dirColor(selected.direction)}`}>
                      {dirIcon(selected.direction)} {selected.direction}
                    </span>
                  </div>
                  <p className="text-[#6b7280] text-sm">{selected.name}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9ca3af] hover:text-[#6b7280] text-2xl leading-none">&times;</button>
            </div>

            {/* Price + volume row */}
            <div className="grid grid-cols-3 gap-4 px-5 py-4 bg-[#f8f9fa] border-b border-[#e5e7eb]">
              <div>
                <p className="text-[#9ca3af] text-xs mb-1">{t.watchlist_detail_price}</p>
                {detailLoading ? (
                  <div className="h-5 w-20 bg-[#e5e7eb] rounded animate-pulse" />
                ) : (
                  <p className="text-[#1a1a1a] font-bold text-lg">
                    {detail?.price != null
                      ? `${detail.currency === 'CAD' ? 'CA$' : '$'}${detail.price.toFixed(2)}`
                      : '—'}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[#9ca3af] text-xs mb-1">{t.watchlist_detail_change}</p>
                {detailLoading ? (
                  <div className="h-5 w-16 bg-[#e5e7eb] rounded animate-pulse" />
                ) : (
                  <p className={`font-bold text-lg ${pctColor(detail?.changePct ?? null)}`}>
                    {detail?.changePct != null
                      ? `${detail.changePct > 0 ? '+' : ''}${detail.changePct.toFixed(2)}%`
                      : '—'}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[#9ca3af] text-xs mb-1">{t.watchlist_detail_volume}</p>
                {detailLoading ? (
                  <div className="h-5 w-16 bg-[#e5e7eb] rounded animate-pulse" />
                ) : (
                  <p className="text-[#1a1a1a] font-bold text-lg">
                    {formatVolume(detail?.volume ?? null)}
                  </p>
                )}
              </div>
            </div>

            {/* Chart */}
            <div className="px-5 pt-4">
              <TradingChart
                symbol={selected.chartSymbol}
                type={selected.type}
                height={280}
              />
            </div>

            {/* AI explanation */}
            <div className="px-5 py-4 border-t border-[#e5e7eb]">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">
                🤖 {t.watchlist_detail_why}
              </p>
              <p className="text-[#374151] text-sm leading-relaxed">{selected.reason}</p>

              {/* Confidence bar */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-2 bg-[#f3f4f6] rounded-full">
                  <div
                    className={`h-2 rounded-full ${confColor(selected.confidence)}`}
                    style={{ width: `${selected.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-[#6b7280] flex-shrink-0">
                  {selected.confidence}% {t.watchlist_confidence}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
