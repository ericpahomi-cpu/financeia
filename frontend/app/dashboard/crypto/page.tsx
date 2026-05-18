'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { toTVSymbol } from '@/lib/tv-symbol';
import { useLanguage } from '@/lib/language-context';
import Toast from '@/components/Toast';

const TradingViewWidget = dynamic(() => import('@/components/TradingViewWidget'), { ssr: false });

interface Coin {
  id: string; symbol: string; name: string; image: string;
  price: number; change: number; changePct: number;
  marketCap: number; volume: number; rank: number;
}
interface SelectedCoin { tvSymbol: string; symbol: string; name: string; }

export default function CryptoPage() {
  const { t } = useLanguage();
  const [coins, setCoins]         = useState<Coin[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<SelectedCoin | null>(null);
  const [currency, setCurrency]   = useState<'usd' | 'cad'>('cad');
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((d) => setFavorites(new Set((d.favorites || []).map((f: { symbol: string }) => f.symbol))));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crypto?currency=${currency}`)
      .then((r) => r.json())
      .then((d) => { setCoins(d.coins || []); setLoading(false); });
  }, [currency]);

  const toggleFav = async (coin: Coin) => {
    const isFav = favorites.has(coin.symbol);
    const next  = new Set(favorites);
    if (isFav) {
      next.delete(coin.symbol);
      await fetch('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: coin.symbol }) });
      setToast(t.fav_removed);
    } else {
      next.add(coin.symbol);
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: coin.symbol, type: 'crypto', name: coin.name }) });
      setToast(t.fav_added);
    }
    setFavorites(next);
  };

  const filtered = coins.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString(t.locale, { minimumFractionDigits: 2, maximumFractionDigits: n > 1 ? 2 : 6 });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <Toast message={toast} onDone={() => setToast(null)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">₿ {t.crypto_title}</h1>
          <p className="text-[#6b7280] text-sm">{t.crypto_subtitle}</p>
        </div>
        <div className="flex items-center gap-1 bg-[#f3f4f6] rounded-lg p-1">
          {(['cad', 'usd'] as const).map((c) => (
            <button key={c} onClick={() => setCurrency(c)}
              className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${currency === c ? 'bg-white text-indigo-600 shadow-sm' : 'text-[#6b7280]'}`}>
              {c.toUpperCase()} $
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t.crypto_search}
          className="w-full bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#9ca3af] focus:outline-none focus:border-indigo-400 pl-10" />
        <span className="absolute left-3 top-3.5 text-[#9ca3af]">🔍</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
                <th className="px-4 py-3 text-left text-[#6b7280] font-medium">{t.crypto_rank}</th>
                <th className="px-4 py-3 text-left text-[#6b7280] font-medium">{t.column_name}</th>
                <th className="px-4 py-3 text-right text-[#6b7280] font-medium">{t.crypto_price}</th>
                <th className="px-4 py-3 text-right text-[#6b7280] font-medium">{t.crypto_change}</th>
                <th className="px-4 py-3 text-right text-[#6b7280] font-medium hidden md:table-cell">{t.crypto_volume}</th>
                <th className="px-4 py-3 text-center text-[#6b7280] font-medium w-12">★</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((coin) => {
                const isUp  = coin.changePct >= 0;
                const isFav = favorites.has(coin.symbol);
                const tvSym = toTVSymbol(coin.id, 'crypto');
                return (
                  <tr key={coin.id}
                    onClick={() => setSelected({ tvSymbol: tvSym, symbol: coin.symbol, name: coin.name })}
                    className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-[#9ca3af]">{coin.rank}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {coin.image && <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full" />}
                        <div>
                          <div className="font-semibold text-[#1a1a1a]">{coin.symbol.toUpperCase()}</div>
                          <div className="text-[#9ca3af] text-xs hidden sm:block">{coin.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#1a1a1a]">
                      {fmt(coin.price)} {currency.toUpperCase()}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isUp ? '+' : ''}{coin.changePct?.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right text-[#6b7280] hidden md:table-cell">
                      {(coin.volume / 1e6).toFixed(0)}M
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFav(coin); }}
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
      )}

      {/* Chart modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1a1a1a]">{selected.symbol.toUpperCase()}</h2>
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
