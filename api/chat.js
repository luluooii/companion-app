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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { bot_id, user_id, stream, auto_save_history, additional_messages, conversation_id } = body;
    const token = req.headers.get('authorization');

    let url = 'https://api.coze.cn/v3/chat';
    if (conversation_id) url += `?conversation_id=${conversation_id}`;

    const cozeRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bot_id,
        user_id,
        stream: true,
        auto_save_history: auto_save_history !== false,
        additional_messages
      })
    });

    if (!cozeRes.ok) {
      const errText = await cozeRes.text();
      return new Response(errText, { status: cozeRes.status });
    }

    return new Response(cozeRes.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
