'use client';

import { useEffect, useState } from 'react';
import ReportCard from '@/components/ReportCard';

export default function ReportsPage() {
  interface Report { id: string; content: string; sentiment_score: number; generated_at: string; date: string; }
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data) => {
        setReports(data.reports || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📄 Rapports</h1>
          <p className="text-slate-400 text-sm">Vos analyses financières quotidiennes</p>
        </div>
        <div className="text-slate-500 text-sm">
          {reports.length} rapport{reports.length !== 1 ? 's' : ''}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-[#2a2a4a] rounded w-3/4 mb-2" />
              <div className="h-3 bg-[#2a2a4a] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-slate-300 font-medium">Aucun rapport disponible</p>
          <p className="text-slate-500 text-sm mt-2">
            Les rapports sont générés automatiquement chaque matin à 7h00
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}
