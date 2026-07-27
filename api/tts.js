/**
 * 火山TTS 前端调用函数
 * 只请求本地Next.js中转接口，前端不存放任何密钥
 */

export async function generateAndPlayVoice(text) {
  if (!text || text.trim() === "") return;

  try {
    // 调用自己项目的中转接口，不直接访问火山
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.trim()
      })
    });

    if (!res.ok) {
      console.warn("语音合成请求失败，不影响文字对话");
      return null;
    }

    const audioBuffer = await res.arrayBuffer();
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(blob);
    const audioPlayer = new Audio(audioUrl);
    await audioPlayer.play();
    return audioPlayer;
  } catch (err) {
    console.error("TTS异常：", err);
    return null;
  }
}
