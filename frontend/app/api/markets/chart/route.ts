import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol   = searchParams.get('symbol') || '';
  const interval = searchParams.get('interval') || '1d';
  const range    = searchParams.get('range')    || '1mo';

  if (!symbol) return NextResponse.json({ candles: [] });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 120 },
    });

    if (!res.ok) throw new Error('No data');
    const data = await res.json() as {
      chart: { result: Array<{
        timestamp: number[];
        indicators: {
          quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }>;
        };
      }> };
    };

    const result = data.chart?.result?.[0];
    if (!result) throw new Error('Empty result');

    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];

    const candles = timestamp
      .map((t, i) => ({
        time:   t as unknown as import('lightweight-charts').Time,
        open:   quote.open[i],
        high:   quote.high[i],
        low:    quote.low[i],
        close:  quote.close[i],
        volume: quote.volume[i],
      }))
      .filter((c) => c.open && c.high && c.low && c.close);

    return NextResponse.json({ candles });
  } catch {
    return NextResponse.json({ candles: [] });
  }
}
