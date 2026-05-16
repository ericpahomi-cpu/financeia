'use client';

interface SentimentScoreProps {
  score: number;
}

export default function SentimentScore({ score }: SentimentScoreProps) {
  const getColor = (s: number) => {
    if (s >= 65) return { stroke: '#10b981', text: 'Positif', textClass: 'text-emerald-600' };
    if (s >= 40) return { stroke: '#f59e0b', text: 'Neutre', textClass: 'text-amber-500' };
    return { stroke: '#ef4444', text: 'Prudence', textClass: 'text-red-500' };
  };

  const { stroke, text, textClass } = getColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Track */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
          />
          {/* Progress */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${textClass}`}>{score}</span>
          <span className="text-[#9ca3af] text-xs">/100</span>
        </div>
      </div>
      <div
        className="mt-2 px-3 py-1 rounded-full text-sm font-semibold"
        style={{ backgroundColor: `${stroke}18`, color: stroke }}
      >
        {text}
      </div>
      <p className="text-[#6b7280] text-xs mt-1">Sentiment du marché</p>
    </div>
  );
}
