'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });

interface Coin {
  id: string; symbol: string; name: string; image: string;
  price: number; change: number; changePct: number;
  marketCap: number; volume: number; rank: number;
}
interface SelectedCoin { id: string; symbol: string; name: string; }

export default function CryptoPage() {
  const [coins, setCoins]         = useState<Coin[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<SelectedCoin | null>(null);
  const [currency, setCurrency]   = useState<'usd' | 'cad'>('cad');
  const [loading, setLoading]     = useState(true);

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
    const next = new Set(favorites);
    if (isFav) {
      next.delete(coin.symbol);
      await fetch('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: coin.symbol }) });
    } else {
      next.add(coin.symbol);
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: coin.symbol, type: 'crypto', name: coin.name }) });
    }
    setFavorites(next);
  };

  const filtered = coins.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: n > 1 ? 2 : 6 });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">₿ Crypto</h1>
          <p className="text-[#6b7280] text-sm">Top 100 cryptomonnaies via CoinGecko</p>
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
          placeholder="Rechercher une crypto..."
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
                <th className="px-4 py-3 text-left text-[#6b7280] font-medium">#</th>
                <th className="px-4 py-3 text-left text-[#6b7280] font-medium">Crypto</th>
                <th className="px-4 py-3 text-right text-[#6b7280] font-medium">Prix</th>
                <th className="px-4 py-3 text-right text-[#6b7280] font-medium">24h</th>
                <th className="px-4 py-3 text-right text-[#6b7280] font-medium hidden md:table-cell">Vol. 24h</th>
                <th className="px-4 py-3 text-center text-[#6b7280] font-medium w-12">★</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((coin) => {
                const isUp = coin.changePct >= 0;
                const isFav = favorites.has(coin.symbol);
                return (
                  <tr key={coin.id}
                    onClick={() => setSelected({ id: coin.id, symbol: coin.symbol, name: coin.name })}
                    className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-[#9ca3af]">{coin.rank}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {coin.image && <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full" />}
                        <div>
                          <div className="font-semibold text-[#1a1a1a]">{coin.symbol}</div>
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
                      <button onClick={(e) => { e.stopPropagation(); toggleFav(coin); }}
                        className={`text-lg transition-colors ${isFav ? 'text-amber-400' : 'text-[#d1d5db] hover:text-amber-300'}`}>
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
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1a1a1a]">{selected.symbol}</h2>
                <p className="text-[#6b7280] text-sm">{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9ca3af] hover:text-[#6b7280] text-2xl">×</button>
            </div>
            <TradingChart symbol={selected.id} type="crypto" height={300} />
          </div>
        </div>
      )}
    </div>
  );
}
