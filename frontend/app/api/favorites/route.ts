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

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ favorites: [] }, { status: 401 });

  const { data } = await admin
    .from('favorites')
    .select('symbol, type, name')
    .eq('client_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ favorites: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { symbol, type, name } = await req.json();

  const { error } = await admin
    .from('favorites')
    .upsert({ client_id: user.id, symbol, type, name }, { onConflict: 'client_id,symbol' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { symbol } = await req.json();

  await admin
    .from('favorites')
    .delete()
    .eq('client_id', user.id)
    .eq('symbol', symbol);

  return NextResponse.json({ success: true });
}
