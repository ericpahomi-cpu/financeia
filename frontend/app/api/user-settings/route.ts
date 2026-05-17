import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULTS = {
  currency: 'CAD',
  language: 'fr',
  risk_profile: 'moderate',
  level: 'beginner',
  alert_threshold: 5.0,
  alerts_enabled: true,
};

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(DEFAULTS, { status: 401 });

  const { data } = await admin
    .from('user_settings')
    .select('*')
    .eq('id', user.id)
    .single();

  return NextResponse.json(data || DEFAULTS);
}

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json();

  const { error } = await admin
    .from('user_settings')
    .upsert({ id: user.id, ...body, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
