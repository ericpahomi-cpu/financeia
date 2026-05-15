'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SentimentScore from '@/components/SentimentScore';
import MarketWidget from '@/components/MarketWidget';
import AlertBanner from '@/components/AlertBanner';
import ReportCard from '@/components/ReportCard';

interface Alert {
  id: string;
  type: string;
  asset: string;
  message: string;
  triggered_at: string;
}

interface MarketItem {
  symbol: string;
  price: number;
  change_pct: number;
  direction: 'up' | 'down';
}

interface Report {
  id: string;
  content: string;
  sentiment_score: number;
  generated_at: string;
  date: string;
  market_data?: Record<string, MarketItem>;
}

export default function DashboardPage() {
  const [latestReport, setLatestReport] = useState<Report | null>(null);
  const [marketData, setMarketData] = useState<Record<string, MarketItem>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // Rafraîchit les données toutes les 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [reportsRes, alertsRes] = await Promise.all([
        fetch('/api/reports'),
        fetch('/api/alerts'),
      ]);

      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        if (reportsData.reports?.length > 0) {
          setLatestReport(reportsData.reports[0]);
          setMarketData(reportsData.reports[0].market_data || {});
        }
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const mockSentiment = latestReport?.sentiment_score ?? 62;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 rounded-lg text-indigo-400 text-sm hover:bg-indigo-600/30 transition-colors"
        >
          🔄 Actualiser
        </button>
      </div>

      {/* Alertes */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Score de sentiment + CTA chat */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score de sentiment */}
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-6 flex flex-col items-center justify-center">
          <SentimentScore score={mockSentiment} />
        </div>

        {/* Stats rapides */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
            <p className="text-slate-400 text-sm">Rapports générés</p>
            <p className="text-white text-3xl font-bold mt-1">
              {latestReport ? '1+' : '0'}
            </p>
            <p className="text-indigo-400 text-xs mt-1">Ce mois-ci</p>
          </div>
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
            <p className="text-slate-400 text-sm">Alertes actives</p>
            <p className={`text-3xl font-bold mt-1 ${alerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {alerts.length}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              {alerts.length > 0 ? 'Requiert attention' : 'Tout est calme'}
            </p>
          </div>
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
            <p className="text-slate-400 text-sm">Sources de données</p>
            <p className="text-white text-3xl font-bold mt-1">4</p>
            <p className="text-emerald-400 text-xs mt-1">Actives</p>
          </div>
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/30">
            <p className="text-slate-300 text-sm">Prochain rapport</p>
            <p className="text-white text-lg font-bold mt-1">07:00 AM</p>
            <Link
              href="/dashboard/chat"
              className="text-indigo-400 text-xs mt-1 hover:text-indigo-300 transition-colors"
            >
              💬 Poser une question →
            </Link>
          </div>
        </div>
      </div>

      {/* Marchés */}
      {isLoading ? (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-6 text-center">
          <p className="text-slate-500">Chargement des données marché...</p>
        </div>
      ) : (
        <MarketWidget data={marketData} />
      )}

      {/* Dernier rapport */}
      {latestReport ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">📄 Dernier rapport</h2>
            <Link
              href="/dashboard/reports"
              className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors"
            >
              Voir tous →
            </Link>
          </div>
          <ReportCard report={latestReport} compact />
        </div>
      ) : (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-8 text-center">
          <p className="text-2xl mb-2">📭</p>
          <p className="text-slate-400">Aucun rapport généré pour l&apos;instant</p>
          <p className="text-slate-500 text-sm mt-1">
            Le premier rapport sera généré à 7h00 AM
          </p>
        </div>
      )}
    </div>
  );
}
