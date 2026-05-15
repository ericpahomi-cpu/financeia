'use client';

import { useState } from 'react';

interface Report {
  id: string;
  content: string;
  sentiment_score: number;
  generated_at: string;
  date: string;
}

interface ReportCardProps {
  report: Report;
  compact?: boolean;
}

export default function ReportCard({ report, compact = false }: ReportCardProps) {
  const [expanded, setExpanded] = useState(!compact);

  const getSentimentColor = (score: number) => {
    if (score >= 65) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (score >= 40) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    return 'text-red-400 bg-red-400/10 border-red-400/20';
  };

  const date = new Date(report.generated_at).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Convertit le markdown simple en HTML
  const formatContent = (content: string) => {
    return content
      .replace(/## (.*)/g, '<h3 class="text-indigo-400 font-bold text-base mt-4 mb-2">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-[#2a2a4a]/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">📈 Rapport du {date}</h3>
            <p className="text-slate-500 text-xs mt-0.5">Généré automatiquement par FinanceAI</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getSentimentColor(report.sentiment_score)}`}>
              {report.sentiment_score}/100
            </span>
            <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#2a2a4a]">
          <div
            className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed mt-4"
            dangerouslySetInnerHTML={{ __html: formatContent(report.content) }}
          />
        </div>
      )}
    </div>
  );
}
