// Agora helpers: tokens and the Conversational AI REST API (join / speak / leave).
// Patterns follow Agora's official samples (agent-quickstart-nextjs, server-custom-llm, agoraio/skills).
import pkg from "agora-token"; // CJS package: named ESM imports fail on Node, use the default export
const { RtcTokenBuilder, RtcRole } = pkg;

const API = "https://api.agora.io/api/conversational-ai-agent/v2/projects";

export type AgoraConfig = {
  appId: string; appCert: string; channel: string; publicUrl: string; llmKey: string;
  agentUid: number; roomUid: number; specialistUid: number;
  asrLanguage: string; ttsPreset: string; ttsVoice: string;
  /** Selective Attention Locking (beta): lock onto the main speaker, block other nearby voices. */
  speakerLock: boolean;
};

export function rtcRtmToken(cfg: AgoraConfig, uid: number, ttlSeconds = 86400): string {
  // Relative seconds, per agora-token's docs. Combined RTC + RTM token.
  return RtcTokenBuilder.buildTokenWithRtm(cfg.appId, cfg.appCert, cfg.channel, String(uid), RtcRole.PUBLISHER, ttlSeconds, ttlSeconds);
}

class AgoraError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(cfg: AgoraConfig, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/${cfg.appId}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `agora token=${rtcRtmToken(cfg, cfg.agentUid)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new AgoraError(`Agora ${path} failed: ${res.status} ${text}`, res.status);
  return (text ? JSON.parse(text) : null) as T;
}

/** Start the voice agent: it listens to the room mic only and uses our server as its LLM. */
export function startAgent(cfg: AgoraConfig) {
  return call<{ agent_id: string; create_ts: number; status: string }>(cfg, "/join", {
    name: `operon_${Date.now().toString(36)}`,
    preset: cfg.ttsPreset, // Agora-managed TTS, no API key needed
    properties: {
      channel: cfg.channel,
      token: rtcRtmToken(cfg, cfg.agentUid),
      agent_rtc_uid: String(cfg.agentUid),
      remote_rtc_uids: [String(cfg.roomUid)], // the single room mic; the specialist is not processed
      idle_timeout: 120,
      advanced_features: { enable_rtm: true, enable_sal: cfg.speakerLock },
      ...(cfg.speakerLock ? { sal: { sal_mode: "locking" } } : {}),
      // Vega always finishes its sentence: a nearby voice can't cut off a read-back or an alert.
      // Speech during Vega's turn is handled after it ("append"), so an early "Confirmed" still counts.
      interruption: { enable: false, disabled_config: { strategy: "append" } },
      parameters: { data_channel: "rtm", enable_error_message: true },
      asr: { vendor: "ares", language: cfg.asrLanguage },
      tts: cfg.ttsPreset.startsWith("openai")
        ? { vendor: "openai", params: { voice: cfg.ttsVoice } }
        : { vendor: "minimax", params: { voice_setting: { voice_id: cfg.ttsVoice, speed: 1.0 } } },
      llm: {
        url: `${cfg.publicUrl}/chat/completions`,
        api_key: cfg.llmKey,
        vendor: "custom",
        style: "openai",
        system_messages: [{ role: "system", content: "Vega, Operon's operating-room safety assistant." }],
        greeting_message: "Vega ready.",
        failure_message: "Say that again.",
        max_history: 8,
        params: { model: "operon-brain" },
      },
      turn_detection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: { mode: "vad", vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 } },
          // 800 ms: fewer split answers than 640, still responsive (see README, live test notes).
          end_of_speech: { mode: "vad", vad_config: { silence_duration_ms: 800 } },
        },
      },
    },
  });
}

/** Make the agent say exact text (scripted lines and alerts). Never cut off by room speech. */
export function speak(cfg: AgoraConfig, agentId: string, text: string, priority: "INTERRUPT" | "APPEND" | "IGNORE" = "APPEND") {
  return call(cfg, `/agents/${agentId}/speak`, { text: text.slice(0, 500), priority, interruptable: false });
}

export async function stopAgent(cfg: AgoraConfig, agentId: string) {
  try {
    await call(cfg, `/agents/${agentId}/leave`);
  } catch (e) {
    if ((e as AgoraError).status !== 404) throw e; // already gone is fine
  }
}
