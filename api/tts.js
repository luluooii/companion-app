export const config = {
  runtime: 'edge'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/**
 * 从火山引擎的 Chunked 文本响应中提取完整 JSON 对象。
 * 即使网络分块位置不固定，也能正确处理。
 */
function extractJsonObjects(text) {
  const objects = [];

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = i;
      }

      depth++;
    } else if (char === '}') {
      depth--;

      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

/**
 * 将单段 Base64 解码成字节数组。
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

/**
 * 把多段音频字节合并。
 */
function concatBytes(chunks) {
  const totalLength = chunks.reduce(
    (total, chunk) => total + chunk.length,
    0
  );

  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

/**
 * 将完整字节数组转回 Base64。
 * 分批处理，避免一次传入太多参数。
 */
function bytesToBase64(bytes) {
  const blockSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += blockSize) {
    const block = bytes.subarray(
      i,
      Math.min(i + blockSize, bytes.length)
    );

    binary += String.fromCharCode(...block);
  }

  return btoa(binary);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        code: -1,
        message: '只支持 POST 请求'
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  try {
    const apiKey = process.env.DOUBAO_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Vercel 环境变量 DOUBAO_API_KEY 未设置'
      );
    }

    const requestData = await req.json();

    // 兼容前端可能使用的不同字段名称
    const text =
      requestData.text ||
      requestData.content ||
      requestData.message ||
      '你好，我是易遇。';

    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('没有收到需要朗读的文字');
    }

    // 固定正确音色，避免前端旧 voice_type 覆盖
    const speaker = 'S_dRt20zd82';

    const response = await fetch(
      'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Api-Resource-Id': 'seed-icl-2.0',
          'X-Api-Request-Id': crypto.randomUUID()
        },
        body: JSON.stringify({
          user: {
            uid: 'companion_user'
          },
          req_params: {
            text: text.trim(),
            speaker,
            audio_params: {
              format: 'mp3',
              sample_rate: 24000
            }
          }
        })
      }
    );

    const logId =
      response.headers.get('X-Tt-Logid') || '';

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `火山接口 HTTP ${response.status}：${responseText.slice(0, 500)}`
      );
    }

    const jsonStrings = extractJsonObjects(responseText);

    if (jsonStrings.length === 0) {
      throw new Error(
        `没有解析到火山返回数据：${responseText.slice(0, 500)}`
      );
    }

    const audioChunks = [];
    let serviceError = null;

    for (const jsonString of jsonStrings) {
      let item;

      try {
        item = JSON.parse(jsonString);
      } catch {
        continue;
      }

      // code 0：音频片段或普通事件
      // code 20000000：合成完成
      if (
        item.code !== 0 &&
        item.code !== 20000000
      ) {
        serviceError =
          item.message ||
          `火山引擎错误码：${item.code}`;

        continue;
      }

      if (
        typeof item.data === 'string' &&
        item.data.length > 0
      ) {
        audioChunks.push(
          base64ToBytes(item.data)
        );
      }
    }

    if (audioChunks.length === 0) {
      throw new Error(
        serviceError ||
        `没有收到音频数据。原始返回：${responseText.slice(0, 700)}`
      );
    }

    const mergedAudio = concatBytes(audioChunks);
    const audioBase64 = bytesToBase64(mergedAudio);
    const audioDataUrl =
      `data:audio/mpeg;base64,${audioBase64}`;

    return new Response(
      JSON.stringify({
        code: 0,
        message: 'success',

        // 兼容常见前端写法
        data: audioBase64,
        audio: audioBase64,
        audio_url: audioDataUrl,
        audioUrl: audioDataUrl,

        format: 'mp3',
        speaker,
        log_id: logId
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: -1,
        message:
          error instanceof Error
            ? error.message
            : String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
