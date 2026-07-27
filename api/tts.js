export const config = {
  runtime: 'edge'
};

async function tryTTS(appid, token, voice_type, text, resourceId) {
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

  const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Id': appid,
      'X-Api-Access-Key': token,
      'X-Api-Resource-Id': resourceId
    },
    body: JSON.stringify(ttsBody)
  });

  const body = await res.text();
  return resourceId + ' => status:' + res.status + ' body:' + body.substring(0, 300);
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

    const results = [];
    const ids = ['seed-icl-1.0', 'seed-icl-2.0', 'seed-tts-2.0', 'volc.megatts.voiceclone'];

    for (const rid of ids) {
      try {
        const r = await tryTTS(appid, token, voice_type, testText, rid);
        results.push(r);
      } catch (e) {
        results.push(rid + ' => ERROR: ' + e.message);
      }
    }

    return new Response(JSON.stringify({
      code: -1,
      message: 'MULTI-TEST | ' + results.join(' ||| ')
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
