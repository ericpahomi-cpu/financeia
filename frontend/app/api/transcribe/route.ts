import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/transcribe
 * Receives a multipart/form-data with:
 *   - audio: Blob (webm / mp4)
 *   - language: VoiceLanguage code ('fr' | 'en' | 'es' | 'ru' | 'ro')
 *
 * Proxies to Groq Whisper API and returns { text: string }
 */
export async function POST(req: NextRequest) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY not configured' },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio    = formData.get('audio')    as Blob | null;
  const language = (formData.get('language') as string | null) ?? 'fr';

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: 'No audio data' }, { status: 400 });
  }

  // Build the multipart form for Groq
  const groqForm = new FormData();
  // Groq requires a filename with extension to detect format
  const ext = audio.type.includes('mp4') ? 'mp4' : 'webm';
  groqForm.append('file', audio, `recording.${ext}`);
  groqForm.append('model', 'whisper-large-v3-turbo');
  groqForm.append('language', language);
  groqForm.append('response_format', 'json');

  let groqRes: Response;
  try {
    groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: groqForm,
    });
  } catch (err) {
    console.error('[transcribe] Groq fetch error:', err);
    return NextResponse.json({ error: 'Network error reaching Groq' }, { status: 502 });
  }

  if (!groqRes.ok) {
    const detail = await groqRes.text().catch(() => 'unknown');
    console.error('[transcribe] Groq error', groqRes.status, detail);
    return NextResponse.json(
      { error: `Groq error ${groqRes.status}: ${detail}` },
      { status: groqRes.status }
    );
  }

  const data = await groqRes.json() as { text?: string };
  const text = (data.text ?? '').trim();

  return NextResponse.json({ text });
}
