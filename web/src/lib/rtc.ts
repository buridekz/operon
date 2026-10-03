"use client";

// Agora RTC join helper. agora-rtc-sdk-ng touches `window` on import, so it is loaded with a
// dynamic import() from client code only (per the bundled Next.js lazy-loading guide).
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { engine } from "./engine";

export type Call = {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack;
  leave: () => Promise<void>;
};

export async function joinChannel(
  role: "room" | "specialist",
  onUserJoined?: (uid: string | number) => void,
): Promise<Call> {
  const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
  const { token, uid, channel, appId } = await engine<{ token: string; uid: number; channel: string; appId: string }>("/api/token", { role });

  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") user.audioTrack?.play(); // Vega's voice, and the other party
  });
  if (onUserJoined) client.on("user-joined", (u) => onUserJoined(u.uid));

  await client.join(appId, channel, token, uid);
  let mic: IMicrophoneAudioTrack | undefined;
  try {
    mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
    await client.publish([mic]);
  } catch (e) {
    // Mic blocked or missing: leave cleanly so the caller can show the error and try again.
    mic?.close();
    await client.leave().catch(() => {});
    throw e;
  }

  return {
    client,
    mic,
    leave: async () => {
      mic.close();
      await client.leave().catch(() => {});
    },
  };
}
