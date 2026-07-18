export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bot_id, user_id, stream, auto_save_history, additional_messages, conversation_id } = req.body;
    const token = req.headers.authorization;

    let url = 'https://api.coze.cn/v3/chat';
    if (conversation_id) url += `?conversation_id=${conversation_id}`;

    const cozeRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id, user_id, stream: true, auto_save_history: auto_save_history !== false, additional_messages })
    });

    if (!cozeRes.ok) {
      const errText = await cozeRes.text();
      return res.status(cozeRes.status).send(errText);
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = cozeRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message });
  }
}
