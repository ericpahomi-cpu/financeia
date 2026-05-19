import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Auth check — return only public (client_id IS NULL) + user-specific predictions
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    let query = adminSupabase
      .from('predictions')
      .select('id, asset, direction, confidence, reasoning, was_correct, result, predicted_at, resolved_at, client_id')
      .order('predicted_at', { ascending: false })
      .limit(100);

    // If authenticated, fetch global (client_id IS NULL) + their own
    // If not authenticated, fetch only global predictions
    if (user) {
      query = query.or(`client_id.is.null,client_id.eq.${user.id}`);
    } else {
      query = query.is('client_id', null);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ predictions: [], error: error.message });
    }

    return NextResponse.json({ predictions: data || [] });
  } catch {
    return NextResponse.json({ predictions: [] }, { status: 500 });
  }
}
