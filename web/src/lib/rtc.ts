"use client";

// Agora RTC join helper. agora-rtc-sdk-ng touches `window` on import, so it is loaded with a
// dynamic import() from client code only (per the bundled Next.js lazy-loading guide).
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { engine } from "./engine";

export type Call = {
  client: IAgoraRTCClient;
  mic: IMicrophoneAudioTrack;
  /** Agora AI noise suppression is filtering this mic. */
  denoise: boolean;
  leave: () => Promise<void>;
};

type AgoraRTCModule = (typeof import("agora-rtc-sdk-ng"))["default"];
type Denoiser = import("agora-extension-ai-denoiser").AIDenoiserExtension;
let denoiser: Promise<Denoiser | null> | null = null;

/** Agora AI noise suppression on the room mic: background noise and nearby voices are filtered
 *  before ARNIE hears them. Desktop browsers only; if it can't run, the mic works as before. */
async function suppressNoise(AgoraRTC: AgoraRTCModule, mic: IMicrophoneAudioTrack): Promise<boolean> {
  try {
    denoiser ??= import("agora-extension-ai-denoiser").then(({ AIDenoiserExtension }) => {
      const ext = new AIDenoiserExtension({ assetsPath: "/denoiser" }); // wasm copied to public/denoiser
      if (!ext.checkCompatibility()) return null;
      AgoraRTC.registerExtensions([ext]);
      return ext;
    });
    const ext = await denoiser;
    if (!ext) return false;
    const processor = ext.createProcessor();
    mic.pipe(processor).pipe(mic.processorDestination);
    await processor.enable();
    await processor.setMode("NSNG"); // AI mode (STATIONARY_NS only removes steady hum)
    await processor.setLevel("AGGRESSIVE");
    return true;
  } catch (e) {
    console.warn("[noise suppression] off:", (e as Error).message);
    return false;
  }
}

export async function joinChannel(
  role: "room" | "specialist",
  onUserJoined?: (uid: string | number) => void,
): Promise<Call> {
  const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
  const { token, uid, channel, appId } = await engine<{ token: string; uid: number; channel: string; appId: string }>("/api/token", { role });

  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") user.audioTrack?.play(); // ARNIE's voice, and the other party
  });
  if (onUserJoined) client.on("user-joined", (u) => onUserJoined(u.uid));

  await client.join(appId, channel, token, uid);
  let mic: IMicrophoneAudioTrack | undefined;
  let denoise = false;
  try {
    mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
    if (role === "room") denoise = await suppressNoise(AgoraRTC, mic);
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
    denoise,
    leave: async () => {
      mic.close();
      await client.leave().catch(() => {});
    },
  };
}
