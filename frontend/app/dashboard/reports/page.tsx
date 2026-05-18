'use client';

import { useEffect, useState } from 'react';
import ReportCard from '@/components/ReportCard';
import { useLanguage } from '@/lib/language-context';

interface Report {
  id: string;
  content: string;
  sentiment_score: number;
  generated_at: string;
  date: string;
}

interface Prediction {
  id: string;
  asset: string;
  direction: 'hausse' | 'baisse' | 'neutre';
  confidence: number;
  reasoning: string;
  was_correct: boolean | null;
  result: string | null;
  predicted_at: string;
  resolved_at: string | null;
}

type Tab = 'rapports' | 'pronostics';

export default function ReportsPage() {
  const { t } = useLanguage();
  const [tab, setTab]                   = useState<Tab>('rapports');
  const [reports, setReports]           = useState<Report[]>([]);
  const [predictions, setPredictions]   = useState<Prediction[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [predsLoading, setPredsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data) => { setReports(data.reports || []); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/predictions')
      .then((r) => r.json())
      .then((data) => { setPredictions(data.predictions || []); setPredsLoading(false); })
      .catch(() => setPredsLoading(false));
  }, []);

  // ── accuracy stats ──────────────────────────────────────────────────────────
  const resolved   = predictions.filter((p) => p.was_correct !== null);
  const correct    = resolved.filter((p) => p.was_correct === true).length;
  const accuracy   = resolved.length > 0 ? Math.round((correct / resolved.length) * 100) : null;

  const dirColor = (d: string) =>
    d === 'hausse' ? '#10b981' : d === 'baisse' ? '#ef4444' : '#f59e0b';
  const dirLabel = (d: string) =>
    d === 'hausse' ? t.dir_up : d === 'baisse' ? t.dir_down : t.dir_neutral;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(t.locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const tabClass = (tabId: Tab) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      tab === tabId ? 'bg-indigo-600 text-white' : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a1a]'
    }`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">📄 {t.reports_title}</h1>
          <p className="text-[#6b7280] text-sm">{t.reports_subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button className={tabClass('rapports')} onClick={() => setTab('rapports')}>
            📄 {t.tab_reports} ({reports.length})
          </button>
          <button className={tabClass('pronostics')} onClick={() => setTab('pronostics')}>
            🎯 {t.tab_predictions} ({predictions.length})
          </button>
        </div>
      </div>

      {/* ── Reports tab ───────────────────────────────────────────────────── */}
      {tab === 'rapports' && (
        <>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl p-4 animate-pulse shadow-sm">
                  <div className="h-4 bg-[#f3f4f6] rounded w-3/4 mb-2" />
                  <div className="h-3 bg-[#f3f4f6] rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-4">📭</p>
              <p className="text-[#1a1a1a] font-medium">{t.reports_no_reports}</p>
              <p className="text-[#9ca3af] text-sm mt-2">{t.reports_auto}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Predictions tab ───────────────────────────────────────────────── */}
      {tab === 'pronostics' && (
        <>
          {/* Accuracy banner */}
          {accuracy !== null && (
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: accuracy >= 60 ? '#10b981' : accuracy >= 45 ? '#f59e0b' : '#ef4444' }}
                >
                  {accuracy}%
                </div>
                <div>
                  <p className="text-[#1a1a1a] font-semibold text-sm">{t.pred_title}</p>
                  <p className="text-[#6b7280] text-xs">{correct} / {resolved.length}</p>
                </div>
              </div>
              <div className="flex gap-3 ml-auto text-xs">
                <div className="text-center">
                  <p className="font-bold text-emerald-600 text-lg">{correct}</p>
                  <p className="text-[#6b7280]">✅ {t.pred_correct}</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-red-500 text-lg">{resolved.length - correct}</p>
                  <p className="text-[#6b7280]">❌ {t.pred_wrong}</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-amber-500 text-lg">{predictions.length - resolved.length}</p>
                  <p className="text-[#6b7280]">⏳ {t.pred_pending}</p>
                </div>
              </div>
            </div>
          )}

          {predsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl p-4 animate-pulse shadow-sm">
                  <div className="h-4 bg-[#f3f4f6] rounded w-1/2 mb-2" />
                  <div className="h-3 bg-[#f3f4f6] rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : predictions.length === 0 ? (
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-4">🎯</p>
              <p className="text-[#1a1a1a] font-medium">{t.pred_no_preds}</p>
              <p className="text-[#9ca3af] text-sm mt-2">{t.pred_none}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {predictions.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex items-start gap-3"
                >
                  {/* Status icon */}
                  <div className="text-xl flex-shrink-0 mt-0.5">
                    {p.was_correct === true ? '✅' : p.was_correct === false ? '❌' : '⏳'}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#1a1a1a]">{p.asset}</span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: dirColor(p.direction) }}
                      >
                        {dirLabel(p.direction)}
                      </span>
                      <span className="text-xs text-[#6b7280]">{t.pred_confidence} : {p.confidence}%</span>
                    </div>

                    {/* Confidence bar */}
                    <div className="mt-1.5 mb-1.5 h-1.5 bg-[#f3f4f6] rounded-full w-48 max-w-full">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${p.confidence}%`,
                          backgroundColor:
                            p.confidence >= 70 ? '#10b981' : p.confidence >= 50 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>

                    <p className="text-[#6b7280] text-xs leading-relaxed">{p.reasoning}</p>
                  </div>

                  {/* Right column: dates + result */}
                  <div className="flex-shrink-0 text-right space-y-1">
                    <p className="text-xs text-[#9ca3af]">{formatDate(p.predicted_at)}</p>
                    {p.result && (
                      <p
                        className="text-xs font-semibold"
                        style={{ color: p.result.startsWith('+') ? '#10b981' : p.result.startsWith('-') ? '#ef4444' : '#6b7280' }}
                      >
                        {p.result}
                      </p>
                    )}
                    {p.resolved_at && (
                      <p className="text-xs text-[#9ca3af]">{t.pred_resolved} {formatDate(p.resolved_at)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
