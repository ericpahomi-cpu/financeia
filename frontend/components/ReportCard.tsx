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

  const getSentimentStyle = (score: number) => {
    if (score >= 65) return { className: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (score >= 40) return { className: 'text-amber-600 bg-amber-50 border-amber-200' };
    return { className: 'text-red-600 bg-red-50 border-red-200' };
  };

  const date = new Date(report.generated_at).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formatContent = (content: string) => {
    return content
      .replace(/## (.*)/g, '<h3 style="color:#4f46e5;font-weight:600;font-size:15px;margin:16px 0 6px">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1a1a1a">$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const { className: sentimentClass } = getSentimentStyle(report.sentiment_score);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden shadow-sm">
      <div
        className="p-4 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[#1a1a1a] font-semibold">📈 Rapport du {date}</h3>
            <p className="text-[#9ca3af] text-xs mt-0.5">Généré automatiquement par FinanceAI</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${sentimentClass}`}>
              {report.sentiment_score}/100
            </span>
            <span className="text-[#9ca3af] text-sm">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#e5e7eb]">
          <div
            className="max-w-none text-sm text-[#374151] leading-relaxed mt-4"
            style={{ lineHeight: '1.7' }}
            dangerouslySetInnerHTML={{ __html: formatContent(report.content) }}
          />
        </div>
      )}
    </div>
  );
}
