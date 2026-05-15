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
    // Simulation de sauvegarde
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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">⚙️ Paramètres</h1>
        <p className="text-slate-400 text-sm">Personnalisez votre expérience FinanceAI</p>
      </div>

      {/* Profil */}
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-5 space-y-4">
        <h2 className="text-white font-semibold">👤 Profil</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-slate-400 text-sm block mb-1">Nom</label>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => setSettings((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-[#0a0a0f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-1">Email</label>
            <input
              type="email"
              value={settings.email}
              onChange={(e) => setSettings((p) => ({ ...p, email: e.target.value }))}
              placeholder="votre@email.com"
              className="w-full bg-[#0a0a0f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Préférences IA */}
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-5 space-y-4">
        <h2 className="text-white font-semibold">🤖 Préférences IA</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-slate-400 text-sm block mb-1">Profil de risque</label>
            <select
              value={settings.risk_profile}
              onChange={(e) => setSettings((p) => ({ ...p, risk_profile: e.target.value }))}
              className="w-full bg-[#0a0a0f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="conservative">Conservateur</option>
              <option value="moderate">Modéré</option>
              <option value="aggressive">Agressif</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-1">Langue</label>
            <select
              value={settings.language}
              onChange={(e) => setSettings((p) => ({ ...p, language: e.target.value }))}
              className="w-full bg-[#0a0a0f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-1">Heure du rapport</label>
            <input
              type="time"
              value={settings.report_time}
              onChange={(e) => setSettings((p) => ({ ...p, report_time: e.target.value }))}
              className="w-full bg-[#0a0a0f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Actifs surveillés */}
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-5 space-y-4">
        <h2 className="text-white font-semibold">📊 Actifs surveillés</h2>
        <div className="flex flex-wrap gap-2">
          {popularAssets.map((asset) => (
            <button
              key={asset}
              onClick={() => toggleAsset(asset)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                settings.watched_assets.includes(asset)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#0a0a0f] border border-[#2a2a4a] text-slate-400 hover:border-indigo-500/50 hover:text-white'
              }`}
            >
              {asset}
            </button>
          ))}
        </div>
        <div>
          <label className="text-slate-400 text-sm block mb-1">
            Seuil d&apos;alerte (variation %)
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.alert_threshold}
            onChange={(e) => setSettings((p) => ({ ...p, alert_threshold: Number(e.target.value) }))}
            className="w-32 bg-[#0a0a0f] border border-[#2a2a4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          <span className="text-slate-500 text-sm ml-2">%</span>
        </div>
      </div>

      {/* Bouton sauvegarder */}
      <button
        onClick={handleSave}
        className={`w-full py-3 rounded-xl font-semibold transition-all ${
          saved
            ? 'bg-emerald-600 text-white'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {saved ? '✅ Sauvegardé !' : 'Sauvegarder les paramètres'}
      </button>
    </div>
  );
}
