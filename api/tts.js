export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { text, appid, token, voice_type } = await req.json();

    const ttsBody = {
      user: { uid: 'companion_user' },
      req_params: {
        text: text,
        speaker: voice_type,
        audio_params: {
          format: 'mp3',
          sample_rate: 24000
        }
      }
    };

    const ttsRes = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Id': appid,
        'X-Api-Access-Key': token,
        'X-Api-Resource-Id': 'seed-icl-2.0'
      },
      body: JSON.stringify(ttsBody)
    });

    // DEBUG: capture raw response to see format
    const rawText = await ttsRes.text();
    const preview = rawText.substring(0, 2000);

    return new Response(JSON.stringify({
      code: -1,
      message: 'DEBUG - status: ' + ttsRes.status + ' | content-type: ' + (ttsRes.headers.get('content-type') || 'none') + ' | body: ' + preview
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ code: -1, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
