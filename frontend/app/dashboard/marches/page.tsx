'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { STOCKS, StockDef } from '@/lib/stocks';
import { toTVSymbol } from '@/lib/tv-symbol';
import { useLanguage } from '@/lib/language-context';
import Toast from '@/components/Toast';

const TradingViewWidget = dynamic(() => import('@/components/TradingViewWidget'), { ssr: false });

interface Quote {
  symbol: string; name: string; price: number;
  change: number; changePct: number; currency: string; volume?: number;
}
interface SearchResult { symbol: string; name: string; exchange: string; }
interface SelectedStock { symbol: string; name: string; tvSymbol: string; }

export default function MarchesPage() {
  const { t } = useLanguage();
  const [quotes, setQuotes]               = useState<Record<string, Quote>>({});
  const [favorites, setFavorites]         = useState<Set<string>>(new Set());
  const [search, setSearch]               = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selected, setSelected]           = useState<SelectedStock | null>(null);
  const [currency, setCurrency]           = useState<'USD' | 'CAD'>('CAD');
  const [usdcad, setUsdcad]               = useState(1.36);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [filter, setFilter]               = useState<'all' | 'NASDAQ' | 'NYSE' | 'TSX'>('all');
  const [toast, setToast]                 = useState<string | null>(null);

  const visibleStocks: StockDef[] = filter === 'all' ? STOCKS : STOCKS.filter((s) => s.exchange === filter);

  useEffect(() => {
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((d) => setFavorites(new Set((d.favorites || []).map((f: { symbol: string }) => f.symbol))));
  }, []);

  useEffect(() => {
    const symbols = visibleStocks.map((s) => s.symbol).join(',');
    fetch(`/api/markets?symbols=${encodeURIComponent(symbols)}`)
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, Quote> = {};
        (d.quotes || []).forEach((q: Quote) => { map[q.symbol] = q; });
        setQuotes(map);
      });
  }, [filter]); // eslint-disable-line

  useEffect(() => {
    fetch('/api/markets?symbols=USDCAD%3DX')
      .then((r) => r.json())
      .then((d) => { if (d.quotes?.[0]) setUsdcad(d.quotes[0].price); });
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q) { setSearchResults([]); return; }
    setIsLoadingSearch(true);
    try {
      const res = await fetch(`/api/markets/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { results: SearchResult[] };
      setSearchResults(data.results || []);
    } finally { setIsLoadingSearch(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search, doSearch]);

  const toggleFavorite = async (stock: { symbol: string; name: string; exchange?: string }) => {
    const isFav = favorites.has(stock.symbol);
    const next  = new Set(favorites);
    if (isFav) {
      next.delete(stock.symbol);
      await fetch('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: stock.symbol }) });
      setToast(t.fav_removed);
    } else {
      next.add(stock.symbol);
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: stock.symbol, type: 'stock', name: stock.name }) });
      setToast(t.fav_added);
    }
    setFavorites(next);
  };

  const displayPrice = (q: Quote | undefined) => {
    if (!q) return '—';
    let price = q.price;
    let cur   = q.currency;
    if (currency === 'CAD' && q.currency === 'USD') { price *= usdcad; cur = 'CAD'; }
    if (currency === 'USD' && q.currency === 'CAD') { price /= usdcad; cur = 'USD'; }
    return `${price.toLocaleString(t.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
  };

  const stocksToShow = search
    ? searchResults.map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange as StockDef['exchange'], currency: 'USD' as const }))
    : visibleStocks;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <Toast message={toast} onDone={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">🌍 {t.markets_title}</h1>
          <p className="text-[#6b7280] text-sm">{t.markets_subtitle}</p>
        </div>
        <div className="flex items-center gap-1 bg-[#f3f4f6] rounded-lg p-1">
          {(['CAD', 'USD'] as const).map((c) => (
            <button key={c} onClick={() => setCurrency(c)}
              className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${currency === c ? 'bg-white text-indigo-600 shadow-sm' : 'text-[#6b7280]'}`}>
              {c} $
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t.markets_search}
          className="w-full bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:border-indigo-400 pl-10" />
        <span className="absolute left-3 top-3.5 text-[#9ca3af]">🔍</span>
        {isLoadingSearch && <span className="absolute right-3 top-3.5 text-[#9ca3af] text-xs">...</span>}
      </div>

      {/* Exchange filter */}
      {!search && (
        <div className="flex gap-2">
          {(['all', 'NASDAQ', 'NYSE', 'TSX'] as const).map((ex) => (
            <button key={ex} onClick={() => setFilter(ex)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === ex ? 'bg-indigo-600 text-white' : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-indigo-300'}`}>
              {ex === 'all' ? t.markets_all : ex}
            </button>
          ))}
        </div>
      )}

      {/* Stock table */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
              <th className="px-4 py-3 text-left text-[#6b7280] font-medium">{t.column_symbol}</th>
              <th className="px-4 py-3 text-left text-[#6b7280] font-medium hidden sm:table-cell">{t.column_name}</th>
              <th className="px-4 py-3 text-right text-[#6b7280] font-medium">{t.markets_price}</th>
              <th className="px-4 py-3 text-right text-[#6b7280] font-medium">{t.markets_change}</th>
              <th className="px-4 py-3 text-center text-[#6b7280] font-medium w-12">★</th>
            </tr>
          </thead>
          <tbody>
            {stocksToShow.map((stock) => {
              const q     = quotes[stock.symbol];
              const isUp  = (q?.changePct ?? 0) >= 0;
              const isFav = favorites.has(stock.symbol);
              return (
                <tr key={stock.symbol}
                  onClick={() => setSelected({ symbol: stock.symbol, name: stock.name, tvSymbol: toTVSymbol(stock.symbol, 'stock') })}
                  className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#1a1a1a]">{stock.symbol}</div>
                    <div className="text-[#9ca3af] text-xs">{(stock as StockDef).exchange || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-[#6b7280] hidden sm:table-cell max-w-[200px] truncate">{stock.name}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#1a1a1a]">{displayPrice(q)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                    {q ? `${isUp ? '+' : ''}${q.changePct.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(stock); }}
                      className={`text-lg transition-all duration-200 ${isFav ? 'text-amber-400 scale-110' : 'text-[#d1d5db] hover:text-amber-300'}`}>
                      ★
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chart modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1a1a1a]">{selected.symbol}</h2>
                <p className="text-[#6b7280] text-sm">{selected.name}</p>
                <p className="text-[#9ca3af] text-xs">{selected.tvSymbol}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9ca3af] hover:text-[#6b7280] text-2xl leading-none">&times;</button>
            </div>
            <TradingViewWidget tvSymbol={selected.tvSymbol} height={500} />
          </div>
        </div>
      )}
    </div>
  );
}
