import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('is_read', false)
      .order('triggered_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erreur Supabase alerts:', error);
      return NextResponse.json({ alerts: [] });
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch {
    return NextResponse.json({ alerts: [] }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { alert_ids } = await req.json();

    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .in('id', alert_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
