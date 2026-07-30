export const config = {
  runtime: 'edge'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// 复刻音色（S_ 开头）在 V3 接口里可能对应的 Resource Id。
// 顺序 = 命中概率从高到低。命中一个就停。
const RESOURCE_CANDIDATES = [
  'seed-icl-1.0',          // 声音复刻 ICL 1.0 字符版
  'seed-icl-1.0-concurr',  // 声音复刻 ICL 1.0 并发版
  'seed-icl-2.0',          // 声音复刻 ICL 2.0 字符版
  'volc.megatts.default',  // 旧版商品名（部分老账号仍在用）
  'volc.megatts.concurr'
];

/**
 * 从火山的 chunked 响应里抠出完整 JSON 对象，
 * 不依赖网络分块的位置。
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
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
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

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function bytesToBase64(bytes) {
  const blockSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += blockSize) {
    const block = bytes.subarray(i, Math.min(i + blockSize, bytes.length));
    binary += String.fromCharCode(...block);
  }
  return btoa(binary);
}

/**
 * 组装鉴权头。
 * 旧版控制台：X-Api-App-Id + X-Api-Access-Key
 * 新版控制台：X-Api-Key
 * 两种都支持，按环境变量有什么就用什么。
 */
function buildAuthModes() {
  const appId =
    process.env.DOUBAO_TTS_APP_ID ||
    process.env.DOUBAO_APP_ID ||
    '';

  const accessKey =
    process.env.DOUBAO_TTS_ACCESS_KEY ||
    process.env.DOUBAO_ACCESS_TOKEN ||
    process.env.DOUBAO_ACCESS_KEY ||
    '';

  const apiKey = process.env.DOUBAO_API_KEY || '';

  const modes = [];

  // 新版控制台
  if (apiKey) {
    modes.push({
      mode: 'api_key',
      headers: { 'X-Api-Key': apiKey }
    });
  }

  // 旧版控制台
  if (appId && (accessKey || apiKey)) {
    modes.push({
      mode: 'app_id + access_key',
      headers: {
        'X-Api-App-Id': appId,
        'X-Api-Access-Key': accessKey || apiKey
      }
    });
  }

  if (modes.length === 0) {
    throw new Error(
      'Vercel 环境变量没配好：需要 DOUBAO_API_KEY，或者 DOUBAO_TTS_APP_ID + DOUBAO_TTS_ACCESS_KEY'
    );
  }

  return modes;
}

/**
 * 用某个 resourceId 试一次合成。
 * 返回 { ok, audioBase64, logId, status, code, message }
 */
async function trySynthesize(text, speaker, resourceId, authHeaders) {
  const response = await fetch(
    'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        user: { uid: 'companion_user' },
        req_params: {
          text,
          speaker,
          audio_params: {
            format: 'mp3',
            sample_rate: 24000
          }
        }
      })
    }
  );

  const logId = response.headers.get('X-Tt-Logid') || '';
  const raw = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      resourceId,
      status: response.status,
      message: raw.slice(0, 300),
      logId
    };
  }

  const jsonStrings = extractJsonObjects(raw);

  if (jsonStrings.length === 0) {
    return {
      ok: false,
      resourceId,
      status: response.status,
      message: `没解析到 JSON：${raw.slice(0, 300)}`,
      logId
    };
  }

  const audioChunks = [];
  let serviceError = null;
  let serviceCode = null;

  for (const jsonString of jsonStrings) {
    let item;
    try {
      item = JSON.parse(jsonString);
    } catch {
      continue;
    }

    // 0 = 音频片段 / 普通事件；20000000 = 合成完成
    if (item.code !== 0 && item.code !== 20000000) {
      serviceCode = item.code;
      serviceError = item.message || `火山错误码 ${item.code}`;
      continue;
    }

    if (typeof item.data === 'string' && item.data.length > 0) {
      audioChunks.push(base64ToBytes(item.data));
    }
  }

  if (audioChunks.length === 0) {
    return {
      ok: false,
      resourceId,
      status: response.status,
      code: serviceCode,
      message: serviceError || `没有音频数据：${raw.slice(0, 300)}`,
      logId
    };
  }

  return {
    ok: true,
    resourceId,
    audioBase64: bytesToBase64(concatBytes(audioChunks)),
    logId
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ code: -1, message: '只支持 POST 请求' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const authModes = buildAuthModes();
    const requestData = await req.json();

    const text =
      requestData.text ||
      requestData.content ||
      requestData.message ||
      '你好，我是易遇。';

    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('没有收到需要朗读的文字');
    }

    const speaker =
      requestData.speaker ||
      process.env.DOUBAO_TTS_SPEAKER ||
      'S_dRt20zd82';

    // 一旦知道正确答案，就把 DOUBAO_TTS_RESOURCE_ID 设成它，
    // 之后每次只发一个请求，不再挨个试。
    const pinned =
      requestData.resource_id ||
      process.env.DOUBAO_TTS_RESOURCE_ID ||
      '';

    const candidates = pinned ? [pinned] : RESOURCE_CANDIDATES;

    const attempts = [];

    // 鉴权方式 × Resource Id 全矩阵，命中一个就立刻返回
    for (const auth of authModes) {
      for (const resourceId of candidates) {
        const result = await trySynthesize(
          text.trim(),
          speaker,
          resourceId,
          auth.headers
        );

        if (result.ok) {
          const audioDataUrl = `data:audio/mpeg;base64,${result.audioBase64}`;

          return new Response(
            JSON.stringify({
              code: 0,
              message: 'success',

              // 兼容前端各种写法
              data: result.audioBase64,
              audio: result.audioBase64,
              audio_url: audioDataUrl,
              audioUrl: audioDataUrl,

              format: 'mp3',
              speaker,

              // 关键：把命中的组合记下来
              resource_id: result.resourceId,
              auth_mode: auth.mode,
              log_id: result.logId,
              attempts
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        attempts.push({
          auth_mode: auth.mode,
          resource_id: result.resourceId,
          http: result.status,
          code: result.code ?? null,
          message: result.message,
          log_id: result.logId
        });
      }
    }

    return new Response(
      JSON.stringify({
        code: -1,
        message: '所有组合都没通过，看 attempts 里每一条的报错',
        speaker,
        attempts
      }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: -1,
        message: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
