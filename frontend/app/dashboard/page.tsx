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
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Dashboard</h1>
          <p className="text-[#6b7280] text-sm">
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
          className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600 text-sm hover:bg-indigo-100 transition-colors"
        >
          🔄 Actualiser
        </button>
      </div>

      {/* Alertes */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Score de sentiment + stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score de sentiment */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 flex flex-col items-center justify-center shadow-sm">
          <SentimentScore score={mockSentiment} />
        </div>

        {/* Stats rapides */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
            <p className="text-[#6b7280] text-sm">Rapports générés</p>
            <p className="text-[#1a1a1a] text-3xl font-bold mt-1">
              {latestReport ? '1+' : '0'}
            </p>
            <p className="text-indigo-500 text-xs mt-1">Ce mois-ci</p>
          </div>
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
            <p className="text-[#6b7280] text-sm">Alertes actives</p>
            <p className={`text-3xl font-bold mt-1 ${alerts.length > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
              {alerts.length}
            </p>
            <p className="text-[#9ca3af] text-xs mt-1">
              {alerts.length > 0 ? 'Requiert attention' : 'Tout est calme'}
            </p>
          </div>
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
            <p className="text-[#6b7280] text-sm">Sources de données</p>
            <p className="text-[#1a1a1a] text-3xl font-bold mt-1">4</p>
            <p className="text-emerald-600 text-xs mt-1">Actives</p>
          </div>
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
            <p className="text-[#6b7280] text-sm">Prochain rapport</p>
            <p className="text-[#1a1a1a] text-lg font-bold mt-1">07:00 AM</p>
            <Link
              href="/dashboard/chat"
              className="text-indigo-600 text-xs mt-1 hover:text-indigo-500 transition-colors"
            >
              💬 Poser une question →
            </Link>
          </div>
        </div>
      </div>

      {/* Marchés */}
      {isLoading ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 text-center shadow-sm">
          <p className="text-[#9ca3af]">Chargement des données marché...</p>
        </div>
      ) : (
        <MarketWidget data={marketData} />
      )}

      {/* Dernier rapport */}
      {latestReport ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1a1a1a] font-semibold">📄 Dernier rapport</h2>
            <Link
              href="/dashboard/reports"
              className="text-indigo-600 text-sm hover:text-indigo-500 transition-colors"
            >
              Voir tous →
            </Link>
          </div>
          <ReportCard report={latestReport} compact />
        </div>
      ) : (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 text-center shadow-sm">
          <p className="text-2xl mb-2">📭</p>
          <p className="text-[#6b7280]">Aucun rapport généré pour l&apos;instant</p>
          <p className="text-[#9ca3af] text-sm mt-1">
            Le premier rapport sera généré à 7h00 AM
          </p>
        </div>
      )}
    </div>
  );
}
