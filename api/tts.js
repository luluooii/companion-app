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
    const { appid, token, voice_type } = await req.json();
    const results = [];

    // Step 1: Check voice status via mega_tts status API
    try {
      const statusRes = await fetch('https://openspeech.bytedance.com/api/v1/mega_tts/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer;' + token,
          'Resource-Id': 'volc.megatts.voiceclone'
        },
        body: JSON.stringify({ appid: appid, speaker_id: voice_type })
      });
      const statusBody = await statusRes.text();
      results.push('STATUS: ' + statusBody.substring(0, 500));
    } catch (e) {
      results.push('STATUS ERROR: ' + e.message);
    }

    // Step 2: Try V3 with seed-icl-2.0 + additions model_type=1
    try {
      const res1 = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-App-Id': appid,
          'X-Api-Access-Key': token,
          'X-Api-Resource-Id': 'seed-icl-1.0'
        },
        body: JSON.stringify({
          user: { uid: 'companion_user' },
          req_params: {
            text: '你好，我是易遇。',
            speaker: voice_type,
            audio_params: { format: 'mp3', sample_rate: 24000 },
            additions: JSON.stringify({ model_type: 1 })
          }
        })
      });
      const body1 = await res1.text();
      results.push('icl1.0+mt1: ' + body1.substring(0, 200));
    } catch (e) {
      results.push('icl1.0+mt1 ERROR: ' + e.message);
    }

    // Step 3: Try V3 with seed-icl-2.0 + additions model_type=4
    try {
      const res2 = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-App-Id': appid,
          'X-Api-Access-Key': token,
          'X-Api-Resource-Id': 'seed-icl-2.0'
        },
        body: JSON.stringify({
          user: { uid: 'companion_user' },
          req_params: {
            text: '你好，我是易遇。',
            speaker: voice_type,
            audio_params: { format: 'mp3', sample_rate: 24000 },
            additions: JSON.stringify({ model_type: 4 })
          }
        })
      });
      const body2 = await res2.text();
      results.push('icl2.0+mt4: ' + body2.substring(0, 200));
    } catch (e) {
      results.push('icl2.0+mt4 ERROR: ' + e.message);
    }

    return new Response(JSON.stringify({
      code: -1,
      message: results.join(' ||| ')
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
