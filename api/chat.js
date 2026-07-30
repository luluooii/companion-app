export const config = {
  runtime: 'edge'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const {
      bot_id,
      user_id,
      auto_save_history,
      additional_messages,
      conversation_id
    } = body;

    const token = req.headers.get('authorization');

    // 只记录形状，不记录密钥本身
    console.log('[chat] 入参检查', JSON.stringify({
      has_token: Boolean(token),
      token_len: token ? token.length : 0,
      bot_id: bot_id || null,
      user_id: user_id || null,
      conversation_id: conversation_id || null,
      messages_count: Array.isArray(additional_messages)
        ? additional_messages.length
        : null
    }));

    if (!token) {
      console.log('[chat] 前端没带 Authorization 头');
      return new Response(
        JSON.stringify({ error: '前端没有传 Coze 密钥（Authorization 头是空的）' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

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

    console.log('[chat] Coze 响应状态', cozeRes.status);

    if (!cozeRes.ok) {
      const errText = await cozeRes.text();
      console.log('[chat] Coze 报错正文', errText.slice(0, 1000));
      return new Response(errText, {
        status: cozeRes.status,
        headers: { ...corsHeaders }
      });
    }

    if (!cozeRes.body) {
      console.log('[chat] Coze 返回了 200 但 body 是空的');
      return new Response(
        JSON.stringify({ error: 'Coze 返回了空的响应体' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 边转发边偷看：原样传给前端，同时把内容打到 Vercel 日志里
    const decoder = new TextDecoder();
    let seen = '';
    let deltaChars = 0;
    let logCalls = 0;

    const peeker = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);

        try {
          const piece = decoder.decode(chunk, { stream: true });
          seen += piece;

          // 数一数真正的正文有多少字
          for (const line of piece.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const obj = JSON.parse(payload);
              if (typeof obj.content === 'string' && obj.type === 'answer') {
                deltaChars += obj.content.length;
              }
            } catch {
              // 不是 JSON 就算了
            }
          }

          // 前几段原样打出来，看看 Coze 到底说了什么
          if (logCalls < 8) {
            logCalls++;
            console.log(`[chat] 流片段 ${logCalls}`, piece.slice(0, 800));
          }
        } catch {
          // 偷看失败不能影响转发
        }
      },

      flush() {
        console.log('[chat] 流结束', JSON.stringify({
          total_bytes: seen.length,
          answer_chars: deltaChars
        }));

        if (deltaChars === 0) {
          console.log('[chat] 一个字都没有，完整原文如下');
          console.log(seen.slice(0, 4000));
        }
      }
    });

    return new Response(cozeRes.body.pipeThrough(peeker), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (err) {
    console.log('[chat] 函数抛异常', err && err.message);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
