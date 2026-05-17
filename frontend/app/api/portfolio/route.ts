import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ portfolio: [] }, { status: 401 });

  const { data } = await admin
    .from('portfolio')
    .select('*')
    .eq('client_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ portfolio: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json();
  const { symbol, type, name, quantity, purchase_price, purchase_date } = body;

  const { data, error } = await admin
    .from('portfolio')
    .upsert(
      { client_id: user.id, symbol, type: type || 'stock', name, quantity, purchase_price, purchase_date },
      { onConflict: 'client_id,symbol' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { symbol } = await req.json();
  await admin.from('portfolio').delete().eq('client_id', user.id).eq('symbol', symbol);
  return NextResponse.json({ success: true });
}
