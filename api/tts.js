export const config = {
  runtime: 'edge'
};

async function tryV1(appid, token, voice_type, text, cluster) {
  const reqid = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const ttsBody = {
    app: { appid: appid, token: token, cluster: cluster },
    user: { uid: 'companion_user' },
    audio: { voice_type: voice_type, encoding: 'mp3', speed_ratio: 1.0, volume_ratio: 1.0, pitch_ratio: 1.0 },
    request: { reqid: reqid, text: text, text_type: 'plain', operation: 'query' }
  };

  const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer;' + token
    },
    body: JSON.stringify(ttsBody)
  });

  const body = await res.text();
  const preview = body.substring(0, 200);
  return cluster + ' => status:' + res.status + ' body:' + preview;
}

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
    const { appid, token, voice_type } = await req.json();
    const testText = '你好，我是易遇，今天天气真好。';

    const clusters = ['volcano_icl', 'volcano_mega', 'volcano_tts'];
    const results = [];

    for (const c of clusters) {
      try {
        const r = await tryV1(appid, token, voice_type, testText, c);
        results.push(r);
      } catch (e) {
        results.push(c + ' => ERROR: ' + e.message);
      }
    }

    return new Response(JSON.stringify({
      code: -1,
      message: 'V1-TEST | ' + results.join(' ||| ')
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
