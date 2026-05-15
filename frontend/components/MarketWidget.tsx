'use client';

interface MarketItem {
  symbol: string;
  price: number;
  change_pct: number;
  direction: 'up' | 'down';
}

interface MarketWidgetProps {
  data: Record<string, MarketItem>;
}

const SYMBOL_LABELS: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^DJI': 'Dow Jones',
  '^FCHI': 'CAC 40',
  '^GDAXI': 'DAX',
  'AAPL': 'Apple',
  'MSFT': 'Microsoft',
  'GOOGL': 'Google',
  'AMZN': 'Amazon',
  'NVDA': 'NVIDIA',
  'META': 'Meta',
  'BTC-USD': 'Bitcoin',
  'ETH-USD': 'Ethereum',
};

export default function MarketWidget({ data }: MarketWidgetProps) {
  const items = Object.entries(data || {}).slice(0, 12);

  if (!items.length) {
    return (
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
        <p className="text-slate-500 text-sm text-center">Chargement des données marché...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <span>🌍</span> Marchés en temps réel
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map(([symbol, item]) => (
          <div
            key={symbol}
            className="bg-[#0a0a0f] rounded-lg p-3 border border-[#2a2a4a] hover:border-indigo-500/50 transition-colors"
          >
            <p className="text-slate-400 text-xs truncate">
              {SYMBOL_LABELS[symbol] || symbol}
            </p>
            <p className="text-white font-bold text-sm mt-1">
              ${item.price?.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${
              item.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {item.direction === 'up' ? '▲' : '▼'} {Math.abs(item.change_pct).toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
