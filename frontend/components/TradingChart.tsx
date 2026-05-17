'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  CandlestickSeries,
  Time,
} from 'lightweight-charts';

type Range = '1J' | '1SEM' | '1MOIS' | '3MOIS' | '1AN';

const RANGES: Range[] = ['1J', '1SEM', '1MOIS', '3MOIS', '1AN'];

const RANGE_PARAMS: Record<Range, { interval: string; range: string; days: number }> = {
  '1J':    { interval: '5m',  range: '1d',  days: 1   },
  '1SEM':  { interval: '1h',  range: '5d',  days: 7   },
  '1MOIS': { interval: '1d',  range: '1mo', days: 30  },
  '3MOIS': { interval: '1d',  range: '3mo', days: 90  },
  '1AN':   { interval: '1wk', range: '1y',  days: 365 },
};

interface TradingChartProps {
  symbol: string;
  type?: 'stock' | 'crypto';
  height?: number;
}

export default function TradingChart({ symbol, type = 'stock', height = 280 }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<ISeriesApi<'Candlestick', any> | null>(null);
  const [range, setRange]       = useState<Range>('1MOIS');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#6b7280' },
      grid:   { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale:  true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:    '#10b981',
      downColor:  '#ef4444',
      borderVisible: false,
      wickUpColor:   '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data when symbol/range changes
  useEffect(() => { loadData(); }, [symbol, range, type]); // eslint-disable-line

  const loadData = async () => {
    if (!seriesRef.current) return;
    setLoading(true);
    setError('');
    try {
      const { interval, range: r, days } = RANGE_PARAMS[range];
      const url = type === 'crypto'
        ? `/api/crypto/chart?id=${symbol}&days=${days}`
        : `/api/markets/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${r}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Données indisponibles');
      const { candles } = await res.json() as { candles: CandlestickData<Time>[] };

      if (!candles?.length) throw new Error('Aucune donnée');
      seriesRef.current.setData(candles);
      chartRef.current?.timeScale().fitContent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Range selector */}
      <div className="flex gap-1 mb-3">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              range === r
                ? 'bg-indigo-600 text-white'
                : 'bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chart container */}
      <div className="relative" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <span className="text-[#9ca3af] text-sm">Chargement...</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[#9ca3af] text-sm">{error}</span>
          </div>
        )}
        <div ref={containerRef} style={{ height }} />
      </div>
    </div>
  );
}
