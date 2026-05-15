'use client';

interface SentimentScoreProps {
  score: number;
}

export default function SentimentScore({ score }: SentimentScoreProps) {
  const getColor = (s: number) => {
    if (s >= 65) return { stroke: '#10b981', text: 'Positif', bg: 'text-emerald-400' };
    if (s >= 40) return { stroke: '#f59e0b', text: 'Neutre', bg: 'text-amber-400' };
    return { stroke: '#ef4444', text: 'Prudence', bg: 'text-red-400' };
  };

  const { stroke, text, bg } = getColor(score);
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
            stroke="#2a2a4a"
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
          <span className={`text-3xl font-bold ${bg}`}>{score}</span>
          <span className="text-slate-400 text-xs">/100</span>
        </div>
      </div>
      <div className={`mt-2 px-3 py-1 rounded-full text-sm font-semibold ${bg} bg-opacity-10`}
           style={{ backgroundColor: `${stroke}20` }}>
        <span style={{ color: stroke }}>{text}</span>
      </div>
      <p className="text-slate-500 text-xs mt-1">Sentiment du marché</p>
    </div>
  );
}
