'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SentimentScore from '@/components/SentimentScore';
import AlertBanner from '@/components/AlertBanner';
import ReportCard from '@/components/ReportCard';
import { toTVSymbol } from '@/lib/tv-symbol';
import { useLanguage } from '@/lib/language-context';

const TradingViewWidget = dynamic(() => import('@/components/TradingViewWidget'), { ssr: false });

interface Alert { id: string; type: string; asset: string; message: string; triggered_at: string; }
interface MarketItem { symbol: string; price: number; change_pct: number; direction: 'up' | 'down'; }
interface Report { id: string; content: string; sentiment_score: number; generated_at: string; date: string; market_data?: Record<string, MarketItem>; }
interface Favorite { symbol: string; type: 'stock' | 'crypto'; name: string; }
interface FavQuote { symbol: string; name: string; price: number; changePct: number; currency: string; }
interface Portfolio { symbol: string; quantity: number; purchase_price: number; }
interface Selected { symbol: string; name: string; type: 'stock' | 'crypto'; }

export default function DashboardPage() {
  const { t } = useLanguage();
  const [latestReport, setLatestReport] = useState<Report | null>(null);
  const [alerts, setAlerts]             = useState<Alert[]>([]);
  const [favorites, setFavorites]       = useState<Favorite[]>([]);
  const [favQuotes, setFavQuotes]       = useState<Record<string, FavQuote>>({});
  const [portfolio, setPortfolio]       = useState<Record<string, Portfolio>>({});
  const [selected, setSelected]         = useState<Selected | null>(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [currency, setCurrency]         = useState<'CAD' | 'USD'>('CAD');
  const [usdcad, setUsdcad]             = useState(1.36);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  const fetchAll = async () => {
    try {
      const [reportsRes, alertsRes, favsRes, portfolioRes, settingsRes] = await Promise.all([
        fetch('/api/reports'),
        fetch('/api/alerts'),
        fetch('/api/favorites'),
        fetch('/api/portfolio'),
        fetch('/api/user-settings'),
      ]);
      if (reportsRes.ok) {
        const d = await reportsRes.json();
        if (d.reports?.length > 0) setLatestReport(d.reports[0]);
      }
      if (alertsRes.ok)    { const d = await alertsRes.json();    setAlerts(d.alerts || []); }
      if (settingsRes.ok)  { const d = await settingsRes.json();  setCurrency(d.currency || 'CAD'); }
      if (portfolioRes.ok) {
        const d = await portfolioRes.json();
        const map: Record<string, Portfolio> = {};
        (d.portfolio || []).forEach((p: Portfolio) => { map[p.symbol] = p; });
        setPortfolio(map);
      }
      if (favsRes.ok) {
        const d = await favsRes.json();
        const favs: Favorite[] = d.favorites || [];
        setFavorites(favs);

        const stocks  = favs.filter((f) => f.type === 'stock').map((f) => f.symbol).join(',');
        const cryptos = favs.filter((f) => f.type === 'crypto');

        if (stocks) {
          const [qRes, rateRes] = await Promise.all([
            fetch(`/api/markets?symbols=${encodeURIComponent(stocks)}`),
            fetch('/api/markets?symbols=USDCAD%3DX'),
          ]);
          const qData    = await qRes.json();
          const rateData = await rateRes.json();
          if (rateData.quotes?.[0]) setUsdcad(rateData.quotes[0].price);
          const map: Record<string, FavQuote> = {};
          (qData.quotes || []).forEach((q: FavQuote) => { map[q.symbol] = q; });
          setFavQuotes((prev) => ({ ...prev, ...map }));
        }
        if (cryptos.length > 0) {
          const cRes  = await fetch(`/api/crypto?currency=${currency.toLowerCase()}`);
          const cData = await cRes.json();
          const map: Record<string, FavQuote> = {};
          (cData.coins || []).forEach((c: { symbol: string; name: string; price: number; changePct: number }) => {
            map[c.symbol] = { symbol: c.symbol, name: c.name, price: c.price, changePct: c.changePct, currency };
          });
          setFavQuotes((prev) => ({ ...prev, ...map }));
        }
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const displayPrice = (q: FavQuote) => {
    let price = q.price;
    if (currency === 'CAD' && q.currency === 'USD') price *= usdcad;
    if (currency === 'USD' && q.currency === 'CAD') price /= usdcad;
    return price.toLocaleString(t.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const pnl = (fav: Favorite) => {
    const p = portfolio[fav.symbol];
    const q = favQuotes[fav.symbol];
    if (!p || !q || !p.quantity || !p.purchase_price) return null;
    const val  = q.price * p.quantity;
    const cost = p.purchase_price * p.quantity;
    const gain = val - cost;
    const pct  = (gain / cost) * 100;
    return { gain, pct, val };
  };

  const sentiment = latestReport?.sentiment_score ?? 62;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">{t.dashboard_title}</h1>
          <p className="text-[#6b7280] text-sm">
            {new Date().toLocaleDateString(t.locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#f3f4f6] rounded-lg p-1">
            {(['CAD', 'USD'] as const).map((c) => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${currency === c ? 'bg-white text-indigo-600 shadow-sm' : 'text-[#6b7280]'}`}>
                {c}$
              </button>
            ))}
          </div>
          <button onClick={fetchAll}
            className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600 text-sm hover:bg-indigo-100 transition-colors">
            🔄
          </button>
        </div>
      </div>

      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Top row: sentiment + stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 flex flex-col items-center justify-center shadow-sm">
          <SentimentScore score={sentiment} />
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
            <p className="text-[#6b7280] text-sm">{t.stats_favorites}</p>
            <p className="text-[#1a1a1a] text-3xl font-bold mt-1">{favorites.length}</p>
            <Link href="/dashboard/marches" className="text-indigo-500 text-xs mt-1 block hover:text-indigo-600">
              {t.stats_manage}
            </Link>
          </div>
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
            <p className="text-[#6b7280] text-sm">{t.stats_alerts_active}</p>
            <p className={`text-3xl font-bold mt-1 ${alerts.length > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>{alerts.length}</p>
            <p className="text-[#9ca3af] text-xs mt-1">
              {alerts.length > 0 ? t.alerts_needs_attention : t.alerts_all_calm}
            </p>
          </div>
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
            <p className="text-[#6b7280] text-sm">{t.stats_next_report}</p>
            <p className="text-[#1a1a1a] text-lg font-bold mt-1">07:00 AM</p>
            <Link href="/dashboard/chat" className="text-indigo-600 text-xs mt-1 hover:text-indigo-500 block">
              💬 {t.chat_ask}
            </Link>
          </div>
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
            <p className="text-[#6b7280] text-sm">{t.stats_watchlist_label}</p>
            <p className="text-[#1a1a1a] text-3xl font-bold mt-1">IA</p>
            <Link href="/dashboard/surveiller" className="text-indigo-500 text-xs mt-1 block hover:text-indigo-600">
              {t.see_analysis}
            </Link>
          </div>
        </div>
      </div>

      {/* Favorites */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[#1a1a1a] font-semibold">⭐ {t.my_favorites}</h2>
          <Link href="/dashboard/marches" className="text-indigo-600 text-sm hover:text-indigo-500">
            {t.add_to_favorites}
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map((i) => <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl h-24 animate-pulse" />)}
          </div>
        ) : favorites.length === 0 ? (
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-10 text-center shadow-sm">
            <p className="text-3xl mb-3">⭐</p>
            <p className="text-[#1a1a1a] font-medium">{t.favorites_empty_title}</p>
            <p className="text-[#9ca3af] text-sm mt-1">{t.favorites_empty_sub}</p>
            <div className="flex gap-2 justify-center mt-4">
              <Link href="/dashboard/marches" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                🌍 {t.nav_markets}
              </Link>
              <Link href="/dashboard/crypto" className="px-4 py-2 bg-white border border-[#e5e7eb] text-[#1a1a1a] rounded-lg text-sm">
                ₿ {t.nav_crypto}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favorites.map((fav) => {
              const q    = favQuotes[fav.symbol];
              const isUp = (q?.changePct ?? 0) >= 0;
              const pl   = pnl(fav);
              return (
                <div key={fav.symbol}
                  onClick={() => setSelected({ symbol: fav.symbol, name: fav.name, type: fav.type })}
                  className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-[#1a1a1a]">{fav.symbol}</p>
                      <p className="text-[#9ca3af] text-xs truncate max-w-[120px]">{fav.name}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                      {fav.type === 'crypto' ? '₿' : '📈'}
                    </span>
                  </div>
                  <p className="text-[#1a1a1a] text-xl font-bold">
                    {q ? `${displayPrice(q)} ${currency}` : '—'}
                  </p>
                  <p className={`text-sm font-semibold mt-0.5 ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                    {q ? `${isUp ? '+' : ''}${q.changePct.toFixed(2)}% ${t.today}` : '—'}
                  </p>
                  {pl && (
                    <div className={`mt-2 pt-2 border-t border-[#f3f4f6] text-xs font-medium ${pl.gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {pl.gain >= 0 ? '+' : ''}{pl.gain.toFixed(2)} {currency} ({pl.pct.toFixed(2)}%)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Latest report */}
      {latestReport && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1a1a1a] font-semibold">📄 {t.latest_report}</h2>
            <Link href="/dashboard/reports" className="text-indigo-600 text-sm hover:text-indigo-500">
              {t.see_all}
            </Link>
          </div>
          <ReportCard report={latestReport} compact />
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
              </div>
              <button onClick={() => setSelected(null)} className="text-[#9ca3af] hover:text-[#6b7280] text-2xl leading-none">&times;</button>
            </div>
            <TradingViewWidget tvSymbol={toTVSymbol(selected.symbol, selected.type)} height={400} />
          </div>
        </div>
      )}
    </div>
  );
}
