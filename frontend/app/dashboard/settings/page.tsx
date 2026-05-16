'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    name: 'Client FinanceAI',
    email: '',
    risk_profile: 'moderate',
    language: 'fr',
    report_time: '07:00',
    watched_assets: ['AAPL', 'MSFT', 'BTC-USD'],
    alert_threshold: 5,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleAsset = (asset: string) => {
    setSettings((prev) => ({
      ...prev,
      watched_assets: prev.watched_assets.includes(asset)
        ? prev.watched_assets.filter((a) => a !== asset)
        : [...prev.watched_assets, asset],
    }));
  };

  const popularAssets = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'BTC-USD', 'ETH-USD', '^GSPC', '^IXIC'];

  const inputClass = 'w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#1a1a1a] text-sm focus:outline-none focus:border-indigo-400 transition-colors';
  const cardClass = 'bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm';
  const labelClass = 'text-[#6b7280] text-sm block mb-1';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">⚙️ Paramètres</h1>
        <p className="text-[#6b7280] text-sm">Personnalisez votre expérience FinanceAI</p>
      </div>

      {/* Profil */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">👤 Profil</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nom</label>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => setSettings((p) => ({ ...p, name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={settings.email}
              onChange={(e) => setSettings((p) => ({ ...p, email: e.target.value }))}
              placeholder="votre@email.com"
              className={`${inputClass} placeholder-[#9ca3af]`}
            />
          </div>
        </div>
      </div>

      {/* Préférences IA */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">🤖 Préférences IA</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Profil de risque</label>
            <select
              value={settings.risk_profile}
              onChange={(e) => setSettings((p) => ({ ...p, risk_profile: e.target.value }))}
              className={inputClass}
            >
              <option value="conservative">Conservateur</option>
              <option value="moderate">Modéré</option>
              <option value="aggressive">Agressif</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Langue</label>
            <select
              value={settings.language}
              onChange={(e) => setSettings((p) => ({ ...p, language: e.target.value }))}
              className={inputClass}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Heure du rapport</label>
            <input
              type="time"
              value={settings.report_time}
              onChange={(e) => setSettings((p) => ({ ...p, report_time: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Actifs surveillés */}
      <div className={cardClass}>
        <h2 className="text-[#1a1a1a] font-semibold">📊 Actifs surveillés</h2>
        <div className="flex flex-wrap gap-2">
          {popularAssets.map((asset) => (
            <button
              key={asset}
              onClick={() => toggleAsset(asset)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                settings.watched_assets.includes(asset)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#f3f4f6] border border-[#e5e7eb] text-[#6b7280] hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {asset}
            </button>
          ))}
        </div>
        <div>
          <label className={labelClass}>
            Seuil d&apos;alerte (variation %)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={settings.alert_threshold}
              onChange={(e) => setSettings((p) => ({ ...p, alert_threshold: Number(e.target.value) }))}
              className="w-32 bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#1a1a1a] text-sm focus:outline-none focus:border-indigo-400"
            />
            <span className="text-[#6b7280] text-sm">%</span>
          </div>
        </div>
      </div>

      {/* Bouton sauvegarder */}
      <button
        onClick={handleSave}
        className={`w-full py-3 rounded-xl font-semibold transition-all ${
          saved
            ? 'bg-emerald-500 text-white'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {saved ? '✅ Sauvegardé !' : 'Sauvegarder les paramètres'}
      </button>
    </div>
  );
}
