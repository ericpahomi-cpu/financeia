import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id       = new URL(req.url).searchParams.get('id') || '';
  const days     = new URL(req.url).searchParams.get('days') || '30';
  const currency = new URL(req.url).searchParams.get('currency') || 'usd';

  if (!id) return NextResponse.json({ candles: [] });

  try {
    // CoinGecko OHLC endpoint (free, available up to 90 days)
    const daysNum = Math.min(Number(days), 90);
    const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=${currency}&days=${daysNum}`;
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) throw new Error('No data');

    const raw = await res.json() as [number, number, number, number, number][];

    const candles = raw.map(([time, open, high, low, close]) => ({
      time:  Math.floor(time / 1000) as unknown as import('lightweight-charts').Time,
      open, high, low, close,
    }));

    return NextResponse.json({ candles });
  } catch {
    return NextResponse.json({ candles: [] });
  }
}
