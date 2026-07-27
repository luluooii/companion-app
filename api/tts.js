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
    const body = await req.json();
    const { text, appid, token, voice_type } = body;

    // Use hardcoded test text to isolate the problem
    const testText = '你好，我是易遇。';

    const ttsBody = {
      user: { uid: 'companion_user' },
      req_params: {
        text: testText,
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

    const rawText = await ttsRes.text();
    const preview = rawText.substring(0, 1500);

    return new Response(JSON.stringify({
      code: -1,
      message: 'DEBUG2 | received_text: [' + (text || 'EMPTY') + '] | voice_type: [' + (voice_type || 'EMPTY') + '] | appid: [' + (appid || 'EMPTY') + '] | api_status: ' + ttsRes.status + ' | api_body: ' + preview
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ code: -1, message: 'ERROR: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
