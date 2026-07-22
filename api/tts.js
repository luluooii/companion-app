export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, appid, token, voice_type, cluster } = req.body;
    const reqid = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const ttsBody = {
      app: { appid: appid, token: 'access_token', cluster: cluster || 'volcano_icl' },
      user: { uid: 'companion_user' },
      audio: { voice_type: voice_type, encoding: 'mp3', speed_ratio: 1.0, volume_ratio: 1.0, pitch_ratio: 1.0 },
      request: { reqid: reqid, text: text, text_type: 'plain', operation: 'query' }
    };

    const ttsRes = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer;${token}` },
      body: JSON.stringify(ttsBody)
    });

    if (!ttsRes.ok) { const errText = await ttsRes.text(); return res.status(ttsRes.status).send(errText); }
    const result = await ttsRes.json();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(500).json({ error: err.message });
  }
}
