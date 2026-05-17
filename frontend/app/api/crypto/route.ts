import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const currency = new URL(req.url).searchParams.get('currency') || 'usd';
  const page     = new URL(req.url).searchParams.get('page') || '1';

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=100&page=${page}&sparkline=false&price_change_percentage=24h`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error('CoinGecko unavailable');

    const data = await res.json() as Array<{
      id: string; symbol: string; name: string; image: string;
      current_price: number; price_change_percentage_24h: number;
      price_change_24h: number; market_cap: number; total_volume: number;
      market_cap_rank: number;
    }>;

    const coins = data.map((c) => ({
      id:         c.id,
      symbol:     c.symbol.toUpperCase(),
      name:       c.name,
      image:      c.image,
      price:      c.current_price,
      change:     c.price_change_24h,
      changePct:  c.price_change_percentage_24h,
      marketCap:  c.market_cap,
      volume:     c.total_volume,
      rank:       c.market_cap_rank,
    }));

    return NextResponse.json({ coins });
  } catch {
    return NextResponse.json({ coins: [], error: 'CoinGecko indisponible' });
  }
}
