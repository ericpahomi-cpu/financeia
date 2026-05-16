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

  const { data: messages, error } = await supabaseAdmin
    .from('conversations')
    .select('role, content, created_at')
    .eq('client_id', user.id)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ messages: [] });
  }

  return NextResponse.json({ messages: messages || [] });
}
