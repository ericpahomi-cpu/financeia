import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const VOICE_ID = 'jfEwztGDkpbpy89xeku6';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
  }

  let text: string;
  try {
    const body = await req.json() as { text?: string };
    text = (body.text ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  let elRes: Response;
  try {
    elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   apiKey,
          'Content-Type': 'application/json',
          'Accept':       'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability:        0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );
  } catch (err) {
    console.error('[tts] ElevenLabs fetch error:', err);
    return NextResponse.json({ error: 'Network error reaching ElevenLabs' }, { status: 502 });
  }

  if (!elRes.ok) {
    const detail = await elRes.text().catch(() => 'unknown');
    console.error('[tts] ElevenLabs error', elRes.status, detail);
    return NextResponse.json(
      { error: `ElevenLabs ${elRes.status}: ${detail}` },
      { status: elRes.status }
    );
  }

  // Stream the audio body directly to the client
  return new Response(elRes.body, {
    headers: {
      'Content-Type':  'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
