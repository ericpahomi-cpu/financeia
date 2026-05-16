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
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
        <p className="text-[#9ca3af] text-sm text-center">Chargement des données marché...</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
      <h3 className="text-[#1a1a1a] font-semibold mb-3 flex items-center gap-2">
        <span>🌍</span> Marchés en temps réel
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map(([symbol, item]) => (
          <div
            key={symbol}
            className="bg-[#f8f9fa] rounded-lg p-3 border border-[#e5e7eb] hover:border-indigo-300 transition-colors"
          >
            <p className="text-[#6b7280] text-xs truncate">
              {SYMBOL_LABELS[symbol] || symbol}
            </p>
            <p className="text-[#1a1a1a] font-bold text-sm mt-1">
              ${item.price?.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${
              item.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {item.direction === 'up' ? '▲' : '▼'} {Math.abs(item.change_pct).toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
