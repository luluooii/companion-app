export const config = {
  runtime: 'edge'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// 旧前端把 3000 识别为 TTS 成功。
// 火山 V3 内部返回 0，但对前端统一转换成 3000。
const FRONTEND_SUCCESS_CODE = 3000;

// 复刻音色在 V3 接口里可能对应的 Resource ID。
// 如果已经设置 DOUBAO_TTS_RESOURCE_ID，就不会逐个尝试。
const RESOURCE_CANDIDATES = [
  'seed-icl-1.0',
  'seed-icl-1.0-concurr',
  'seed-icl-2.0',
  'volc.megatts.default',
  'volc.megatts.concurr'
];

/**
 * 从火山的 chunked 响应中提取完整 JSON 对象，
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

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0
  );

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
    const block = bytes.subarray(
      i,
      Math.min(i + blockSize, bytes.length)
    );

    binary += String.fromCharCode(...block);
  }

  return btoa(binary);
}

/**
 * 组装鉴权头。
 *
 * 新版控制台：
 * DOUBAO_API_KEY
 *
 * 旧版控制台：
 * DOUBAO_TTS_APP_ID
 * DOUBAO_TTS_ACCESS_KEY
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

  const apiKey =
    process.env.DOUBAO_API_KEY ||
    '';

  const modes = [];

  // 新版控制台鉴权
  if (apiKey) {
    modes.push({
      mode: 'api_key',
      headers: {
        'X-Api-Key': apiKey
      }
    });
  }

  // 旧版控制台鉴权
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
 * 使用某个 Resource ID 尝试一次语音合成。
 */
async function trySynthesize(
  text,
  speaker,
  resourceId,
  authHeaders
) {
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
        user: {
          uid: 'companion_user'
        },
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

  const logId =
    response.headers.get('X-Tt-Logid') ||
    response.headers.get('X-Tt-LogId') ||
    '';

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

    /*
     * 火山 V3 内部状态：
     * 0 = 普通事件或音频数据
     * 20000000 = 合成完成
     */
    if (
      item.code !== 0 &&
      item.code !== 20000000
    ) {
      serviceCode = item.code;

      serviceError =
        item.message ||
        `火山错误码 ${item.code}`;

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
    return {
      ok: false,
      resourceId,
      status: response.status,
      code: serviceCode,
      message:
        serviceError ||
        `没有音频数据：${raw.slice(0, 300)}`,
      logId
    };
  }

  const mergedAudio = concatBytes(audioChunks);

  return {
    ok: true,
    resourceId,
    audioBase64: bytesToBase64(mergedAudio),
    logId
  };
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
    const authModes = buildAuthModes();
    const requestData = await req.json();

    const text =
      requestData.text ||
      requestData.content ||
      requestData.message ||
      '你好，我是易遇。';

    if (
      typeof text !== 'string' ||
      !text.trim()
    ) {
      throw new Error(
        '没有收到需要朗读的文字'
      );
    }

    /*
     * 正确语音 ID：
     * S_dRt2Ozd82
     *
     * 2 后面是大写字母 O，
     * 不是数字 0。
     */
    const speaker =
      requestData.speaker ||
      process.env.DOUBAO_TTS_SPEAKER ||
      'S_dRt2Ozd82';

    /*
     * 已经知道正确 Resource ID 时，
     * 使用环境变量固定它，避免逐个尝试。
     */
    const pinned =
      requestData.resource_id ||
      process.env.DOUBAO_TTS_RESOURCE_ID ||
      '';

    const candidates = pinned
      ? [pinned]
      : RESOURCE_CANDIDATES;

    const attempts = [];

    // 鉴权方式 × Resource ID，命中后立即返回。
    for (const auth of authModes) {
      for (const resourceId of candidates) {
        const result = await trySynthesize(
          text.trim(),
          speaker,
          resourceId,
          auth.headers
        );

        if (result.ok) {
          const audioDataUrl =
            `data:audio/mpeg;base64,${result.audioBase64}`;

          return new Response(
            JSON.stringify({
              // 给旧前端返回 3000，防止误判成功为报错。
              code: FRONTEND_SUCCESS_CODE,
              message: 'success',

              // 兼容前端可能使用的不同字段名称。
              data: result.audioBase64,
              audio: result.audioBase64,
              audio_url: audioDataUrl,
              audioUrl: audioDataUrl,

              format: 'mp3',
              speaker,
              resource_id: result.resourceId,
              auth_mode: auth.mode,
              log_id: result.logId,
              attempts
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
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
        message:
          '所有组合都没通过，请查看 attempts 中的具体报错',
        speaker,
        attempts
      }),
      {
        status: 502,
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
