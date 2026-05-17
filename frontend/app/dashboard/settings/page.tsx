'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import { Lang, LANG_NAMES } from '@/lib/translations';

interface Settings {
  currency: 'CAD' | 'USD';
  language: Lang;
  risk_profile: string;
  level: 'beginner' | 'expert';
  alert_threshold: number;
  alerts_enabled: boolean;
}

interface PortfolioEntry {
  symbol: string; type: string; name: string;
  quantity: number; purchase_price: number; purchase_date: string;
}

interface Favorite { symbol: string; type: string; name: string; }

export default function SettingsPage() {
  const { t, lang, setLang } = useLanguage();

  const cardClass  = 'bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm';
  const inputClass = 'bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#1a1a1a] text-sm focus:outline-none focus:border-indigo-400 transition-colors';
  const labelClass = 'text-[#6b7280] text-xs block mb-1 font-medium';

  const [settings, setSettings]   = useState<Settings>({ currency: 'CAD', language: lang, risk_profile: 'moderate', level: 'beginner', alert_threshold: 5, alerts_enabled: true });
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [saved, setSaved]         = useState(false);
  const [newEntry, setNewEntry]   = useState<Partial<PortfolioEntry>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/user-settings').then((r) => r.json()),
      fetch('/api/portfolio').then((r) => r.json()),
      fetch('/api/favorites').then((r) => r.json()),
    ]).then(([s, p, f]) => {
      if (s) setSettings((prev) => ({ ...prev, ...s }));
      setPortfolio(p.portfolio || []);
      setFavorites(f.favorites || []);
      setIsLoading(false);
    });
  }, []);

  // Keep local language in sync with context
  useEffect(() => {
    setSettings((prev) => ({ ...prev, language: lang }));
  }, [lang]);

  const handleSave = async () => {
    // Update language context immediately
    if (settings.language !== lang) {
      setLang(settings.language);
    }
    await fetch('/api/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLangChange = (l: Lang) => {
    setSettings((prev) => ({ ...prev, language: l }));
    setLang(l); // immediate UI update
  };

  const addPortfolioEntry = async () => {
    if (!newEntry.symbol || !newEntry.quantity || !newEntry.purchase_price) return;
    const fav = favorites.find((f) => f.symbol === newEntry.symbol);
    await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newEntry, type: fav?.type || 'stock', name: fav?.name || newEntry.symbol }),
    });
    const res = await fetch('/api/portfolio');
    const data = await res.json();
    setPortfolio(data.portfolio || []);
    setNewEntry({});
  };

  const removePortfolioEntry = async (symbol: string) => {
    await fetch('/api/portfolio', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) });
    setPortfolio((prev) => prev.filter((p) => p.symbol !== symbol));
  };

  if (isLoading) return <div className="p-6 text-center text-[#9ca3af]">{t.loading}</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">⚙️ {t.settings_title}</h1>
        <p className="text-[#6b7280] text-sm">{t.settings_subtitle}</p>
      </div>

      {/* Display */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">🌐 {t.section_display}</h2>

        <div>
          <p className={labelClass}>{t.label_currency}</p>
          <div className="flex gap-2">
            {(['CAD', 'USD'] as const).map((c) => (
              <button key={c} onClick={() => setSettings((p) => ({ ...p, currency: c }))}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${settings.currency === c ? 'bg-indigo-600 text-white' : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]'}`}>
                {c} $
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>{t.label_language}</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
              <button key={l} onClick={() => handleLangChange(l)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${settings.language === l ? 'bg-indigo-600 text-white' : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]'}`}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Preferences */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">🤖 {t.section_ai}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t.label_risk}</label>
            <select value={settings.risk_profile} onChange={(e) => setSettings((p) => ({ ...p, risk_profile: e.target.value }))} className={`${inputClass} w-full`}>
              <option value="conservative">{t.risk_conservative}</option>
              <option value="moderate">{t.risk_moderate}</option>
              <option value="aggressive">{t.risk_aggressive}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t.label_level}</label>
            <div className="flex gap-2">
              {([['beginner', t.level_beginner], ['expert', t.level_expert]] as const).map(([val, lbl]) => (
                <button key={val} onClick={() => setSettings((p) => ({ ...p, level: val }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${settings.level === val ? 'bg-indigo-600 text-white' : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[#9ca3af] text-xs">
          {settings.level === 'beginner' ? t.level_beginner_desc : t.level_expert_desc}
        </p>
      </div>

      {/* Alerts */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">🔔 {t.section_alerts}</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#1a1a1a] text-sm font-medium">{t.alerts_active}</p>
            <p className="text-[#9ca3af] text-xs">{t.alerts_sub}</p>
          </div>
          <button onClick={() => setSettings((p) => ({ ...p, alerts_enabled: !p.alerts_enabled }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${settings.alerts_enabled ? 'bg-indigo-600' : 'bg-[#d1d5db]'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.alerts_enabled ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
        <div>
          <label className={labelClass}>{t.alerts_threshold}</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0.5} max={50} step={0.5} value={settings.alert_threshold}
              onChange={(e) => setSettings((p) => ({ ...p, alert_threshold: Number(e.target.value) }))}
              className={`${inputClass} w-28`} />
            <span className="text-[#6b7280] text-sm">{t.alerts_threshold_label}</span>
          </div>
        </div>
      </div>

      {/* Portfolio */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">💼 {t.section_portfolio}</h2>
        <p className="text-[#9ca3af] text-xs">{t.portfolio_sub}</p>

        {portfolio.length > 0 && (
          <div className="space-y-2">
            {portfolio.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between bg-[#f8f9fa] rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-[#1a1a1a]">{p.symbol}</span>
                  <span className="text-[#6b7280] ml-2">{p.quantity} × {p.purchase_price}</span>
                </div>
                <button onClick={() => removePortfolioEntry(p.symbol)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={newEntry.symbol || ''} onChange={(e) => setNewEntry((p) => ({ ...p, symbol: e.target.value }))}
            className={`${inputClass} col-span-2 sm:col-span-1`}>
            <option value="">{t.portfolio_choose}</option>
            {favorites.map((f) => <option key={f.symbol} value={f.symbol}>{f.symbol}</option>)}
          </select>
          <input type="number" placeholder={t.portfolio_qty} value={newEntry.quantity || ''} min={0}
            onChange={(e) => setNewEntry((p) => ({ ...p, quantity: Number(e.target.value) }))}
            className={inputClass} />
          <input type="number" placeholder={t.portfolio_price} value={newEntry.purchase_price || ''} min={0}
            onChange={(e) => setNewEntry((p) => ({ ...p, purchase_price: Number(e.target.value) }))}
            className={inputClass} />
          <button onClick={addPortfolioEntry}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors">
            {t.add}
          </button>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave}
        className={`w-full py-3 rounded-xl font-semibold transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
        {saved ? t.saved : t.save}
      </button>
    </div>
  );
}
