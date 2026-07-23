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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { text, appid, token, voice_type, cluster } = await req.json();
    const reqid = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const ttsBody = {
      app: { appid: appid, token: token, cluster: cluster || 'volcano_icl' },
      user: { uid: 'companion_user' },
      audio: { voice_type: voice_type, encoding: 'mp3', speed_ratio: 1.0, volume_ratio: 1.0, pitch_ratio: 1.0 },
      request: { reqid: reqid, text: text, text_type: 'plain', operation: 'query' }
    };

    const ttsRes = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${token}`,
        'Resource-Id': 'volc.megatts.default'
      },
      body: JSON.stringify(ttsBody)
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return new Response(errText, { status: ttsRes.status });
    }

    const result = await ttsRes.text();
    return new Response(result, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
