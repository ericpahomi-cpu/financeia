import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** GET — liste les symboles sauvegardés dans la watchlist de l'utilisateur */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });

  const { data, error } = await admin
    .from('watchlist')
    .select('symbol, name, type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 400 });
  return NextResponse.json({ items: data || [] });
}

/** POST — ajoute un symbole à la watchlist */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { symbol, name, type } = await req.json() as {
    symbol: string; name: string; type: 'stock' | 'crypto';
  };

  if (!symbol || !type) {
    return NextResponse.json({ error: 'symbol et type requis' }, { status: 400 });
  }

  const { error } = await admin
    .from('watchlist')
    .upsert(
      { user_id: user.id, symbol, name: name || symbol, type },
      { onConflict: 'user_id,symbol' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

/** DELETE — retire un symbole de la watchlist */
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { symbol } = await req.json() as { symbol: string };
  if (!symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 });

  const { error } = await admin
    .from('watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('symbol', symbol);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
