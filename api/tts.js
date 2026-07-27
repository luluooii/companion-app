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

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return new Response(JSON.stringify({ code: -1, message: 'HTTP ' + ttsRes.status + ': ' + errText }), {
        status: ttsRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // V3 returns streaming chunks with base64 audio data
    // Collect all chunks, decode to binary, combine, then re-encode
    const reader = ttsRes.body.getReader();
    const decoder = new TextDecoder();
    const audioArrays = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split by newlines to find complete JSON objects
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          if (chunk.data) {
            // Decode base64 chunk to binary
            const binary = Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0));
            audioArrays.push(binary);
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim());
        if (chunk.data) {
          const binary = Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0));
          audioArrays.push(binary);
        }
      } catch (e) {}
    }

    if (audioArrays.length === 0) {
      return new Response(JSON.stringify({ code: -1, message: 'No audio data received' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Combine all binary arrays
    const totalLength = audioArrays.reduce((sum, arr) => sum + arr.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of audioArrays) {
      combined.set(arr, offset);
      offset += arr.length;
    }

    // Re-encode to base64
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < combined.length; i += chunkSize) {
      const slice = combined.subarray(i, Math.min(i + chunkSize, combined.length));
      base64 += String.fromCharCode.apply(null, slice);
    }
    base64 = btoa(base64);

    // Return in the format the frontend expects: { code: 3000, data: "base64..." }
    return new Response(JSON.stringify({ code: 3000, data: base64 }), {
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
