import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ messages: [] }, { status: 401 });
  }

  // Fetch last 20 messages newest-first, then reverse for chronological display
  const { data: raw, error } = await supabaseAdmin
    .from('conversations')
    .select('role, content, created_at')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const messages = raw ? [...raw].reverse() : [];

  if (error) {
    console.error('[conversations] Erreur fetch:', error.message);
    return NextResponse.json({ messages: [] });
  }

  return NextResponse.json({ messages });
}
