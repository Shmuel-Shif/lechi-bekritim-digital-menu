/**
 * LECHAIM — Hebrew → Greek for a free-text dish note.
 * API key stays in Edge Function secrets. Called once on admin save.
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_LEN = 400;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let text = '';
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim();
  } catch (_) {
    return json({ error: 'invalid_body' }, 400);
  }

  if (!text) return json({ error: 'empty' }, 400);
  if (text.length > MAX_LEN) return json({ error: 'too_long' }, 400);

  const key = String(Deno.env.get('GOOGLE_TRANSLATE_API_KEY') || '').trim();

  async function translateViaMyMemory() {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=he|el`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = String(data?.responseData?.translatedText || '').trim();
    if (!res.ok || !translated || /^MYMEMORY WARNING/i.test(translated)) return '';
    return translated;
  }

  async function translateOnce(source?: string) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
    const body: Record<string, string> = {
      q: text,
      target: 'el',
      format: 'text',
    };
    if (source) body.source = source;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const translated = String(data?.data?.translations?.[0]?.translatedText || '').trim();
    return { ok: res.ok && Boolean(translated), translated };
  }

  try {
    if (key) {
      let result = await translateOnce('he');
      if (!result.ok) result = await translateOnce();
      if (result.ok) return json({ el: result.translated });
    }
    const fallback = await translateViaMyMemory();
    if (fallback) return json({ el: fallback });
    return json({ error: 'translate_failed' }, 502);
  } catch (_) {
    return json({ error: 'translate_failed' }, 502);
  }
});
