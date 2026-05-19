import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULTS = {
  currency:        'CAD',
  language:        'fr',
  risk_profile:    'moderate',
  level:           'beginner',
  alert_threshold: 5.0,
  alerts_enabled:  true,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(DEFAULTS, { status: 401 });

  const { data, error } = await admin
    .from('user_preferences')
    .select('currency, language, risk_profile, level, alert_threshold, alerts_enabled')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = "no rows" — expected for new users
    console.error('[user-settings] GET error:', error.message);
  }

  return NextResponse.json(data ?? DEFAULTS);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json();

  // Whitelist fields — never let the client inject arbitrary columns
  const allowed = ['currency', 'language', 'risk_profile', 'level', 'alert_threshold', 'alerts_enabled'];
  const payload: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) payload[key] = body[key];
  }

  const { error } = await admin
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    console.error('[user-settings] PUT error:', error.message, error.code);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
