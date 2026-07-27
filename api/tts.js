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
    const { voice_type } = await req.json();
    const apiKey = '3dfd9390-7033-4f68-ba7f-d734e696c9cb';
    const testText = '你好，我是易遇，今天天气真好。';
    const results = [];

    // Test 1: New auth style - Authorization: Bearer {apiKey} with seed-icl-2.0
    try {
      const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'X-Api-Resource-Id': 'seed-icl-2.0'
        },
        body: JSON.stringify({
          user: { uid: 'companion_user' },
          req_params: {
            text: testText,
            speaker: voice_type || 'S_dRt2Ozd82',
            audio_params: { format: 'mp3', sample_rate: 24000 }
          }
        })
      });
      const body = await res.text();
      results.push('Bearer+icl2.0: status=' + res.status + ' body=' + body.substring(0, 300));
    } catch (e) {
      results.push('Bearer+icl2.0 ERR: ' + e.message);
    }

    // Test 2: New auth with seed-icl-1.0
    try {
      const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'X-Api-Resource-Id': 'seed-icl-1.0'
        },
        body: JSON.stringify({
          user: { uid: 'companion_user' },
          req_params: {
            text: testText,
            speaker: voice_type || 'S_dRt2Ozd82',
            audio_params: { format: 'mp3', sample_rate: 24000 }
          }
        })
      });
      const body = await res.text();
      results.push('Bearer+icl1.0: status=' + res.status + ' body=' + body.substring(0, 300));
    } catch (e) {
      results.push('Bearer+icl1.0 ERR: ' + e.message);
    }

    // Test 3: mega_tts status with new auth
    try {
      const res = await fetch('https://openspeech.bytedance.com/api/v1/mega_tts/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({ speaker_id: voice_type || 'S_dRt2Ozd82' })
      });
      const body = await res.text();
      results.push('STATUS: ' + body.substring(0, 300));
    } catch (e) {
      results.push('STATUS ERR: ' + e.message);
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
