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
    const speaker = voice_type || 'S_dRt2Ozd82';
    const testText = '你好，我是易遇，今天天气真好。';
    const results = [];
    const bodyData = JSON.stringify({
      user: { uid: 'companion_user' },
      req_params: {
        text: testText,
        speaker: speaker,
        audio_params: { format: 'mp3', sample_rate: 24000 }
      }
    });

    // Test 1: X-Api-Access-Key only (no App-Id)
    try {
      const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Access-Key': apiKey,
          'X-Api-Resource-Id': 'seed-icl-2.0'
        },
        body: bodyData
      });
      const body = await res.text();
      results.push('T1 XAccessKey: s=' + res.status + ' b=' + body.substring(0, 250));
    } catch (e) {
      results.push('T1 ERR: ' + e.message);
    }

    // Test 2: X-Api-Key
    try {
      const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Api-Resource-Id': 'seed-icl-2.0'
        },
        body: bodyData
      });
      const body = await res.text();
      results.push('T2 XApiKey: s=' + res.status + ' b=' + body.substring(0, 250));
    } catch (e) {
      results.push('T2 ERR: ' + e.message);
    }

    // Test 3: Authorization Bearer (space) with Resource-Id header
    try {
      const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'Resource-Id': 'seed-icl-2.0'
        },
        body: bodyData
      });
      const body = await res.text();
      results.push('T3 Bearer+RId: s=' + res.status + ' b=' + body.substring(0, 250));
    } catch (e) {
      results.push('T3 ERR: ' + e.message);
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
