/**
 * Audio I/O helpers for the Gemini Live voice pipeline.
 *
 *  • Mic capture:  browser MediaStream → 16 kHz mono Int16 PCM base64 chunks
 *  • Playback:    24 kHz mono Int16 PCM base64 → queued AudioBufferSourceNodes
 *
 * The Gemini Live API expects raw PCM (`audio/pcm` with sample-rate in the
 * MIME type). The browser's AudioContext handles any resampling between the
 * device's native rate and the rate we ask for, so requesting a 16 kHz context
 * for capture and a 24 kHz context for playback gives us the right data with
 * no DSP on our side.
 */

// ---------- Encoding helpers ----------

/**
 * Convert a Float32Array of samples in the range [-1, 1] to 16-bit signed PCM.
 * Matches the format Gemini Live expects on the wire (little-endian Int16).
 */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = input[i] ?? 0;
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

/**
 * Convert 16-bit signed PCM (little-endian) to a Float32Array suitable for
 * loading into an AudioBuffer.
 */
export function pcm16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] ?? 0;
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return out;
}

/** Encode a byte array as base64 (browser-safe). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    // Avoid spread (Uint8Array<ArrayBufferLike> needs --downlevelIteration).
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j] ?? 0);
    }
  }
  return btoa(binary);
}

/** Decode a base64 string to a Uint8Array. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Convenience: Int16 PCM (little-endian) → base64 string for the wire. */
export function pcm16ToBase64(pcm: Int16Array): string {
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

/** Convenience: base64 string → Int16 PCM. */
export function base64ToPcm16(b64: string): Int16Array {
  const bytes = base64ToBytes(b64);
  // Align to Int16Array boundary.
  const view = new Uint8Array(bytes);
  const aligned = new Uint8Array(view.length);
  aligned.set(view);
  return new Int16Array(aligned.buffer);
}

// ---------- Mic capture ----------

/** Constant sample rates used throughout the voice pipeline. */
export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

export interface MicCaptureHandle {
  stop: () => void;
  context: AudioContext;
}

/**
 * Open the user's microphone and start streaming 16 kHz Int16 PCM chunks
 * (base64-encoded) to `onChunk`. Returns a handle the caller uses to stop
 * the stream.
 *
 * Uses a ScriptProcessorNode for cross-browser reliability (the deprecated
 * API is still the most portable way to grab raw audio buffers without
 * hosting an AudioWorklet module).
 */
export async function startMicCapture(
  onChunk: (b64: string) => void,
  onError: (err: Error) => void
): Promise<MicCaptureHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Microphone access is not available in this environment.");
  }

  // Echo cancellation, noise suppression, and AGC make the voice much
  // cleaner on consumer mics (especially laptop + bluetooth headsets).
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  // Ask for a 16 kHz context — the browser resamples automatically.
  const AudioCtor =
    typeof window !== "undefined" ? window.AudioContext : undefined;
  if (!AudioCtor) throw new Error("Web Audio API is not supported.");
  const context = new AudioCtor({ sampleRate: INPUT_SAMPLE_RATE });

  const source = context.createMediaStreamSource(stream);

  // 4096 samples @ 16 kHz ≈ 256 ms — a good balance between latency and
  // message frequency on the websocket.
  const bufferSize = 4096;
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    const pcm = floatTo16BitPCM(input);
    try {
      onChunk(pcm16ToBase64(pcm));
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  source.connect(processor);
  // Some browsers (Safari especially) require the processor to be connected
  // to the destination for onaudioprocess to fire. We connect through a
  // muted gain so it doesn't actually play anything back.
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(context.destination);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      processor.disconnect();
      source.disconnect();
      mute.disconnect();
    } catch {
      /* already disconnected */
    }
    for (const track of stream.getTracks()) track.stop();
    if (context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  };

  return { stop, context };
}

// ---------- Audio playback ----------

/**
 * A small queue-based audio player. Gemini Live streams audio in small
 * chunks (modelTurn.parts[].inlineData); we accumulate each chunk and play
 * it back-to-back. When the model signals an interruption, call `clear()` to
 * drop anything still queued (otherwise the user hears stale audio after a
 * new turn begins).
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;

  /** Lazily build an AudioContext at the model output's native rate. */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      if (typeof window === "undefined" || !window.AudioContext) {
        throw new Error("Web Audio API is not supported.");
      }
      this.ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    }
    return this.ctx;
  }

  /**
   * Decode and play one base64-encoded Int16 PCM chunk (24 kHz, mono).
   * Safe to call repeatedly; chunks are scheduled sequentially.
   */
  playChunk(b64: string): void {
    if (!b64) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") void ctx.resume();

    const pcm = base64ToPcm16(b64);
    const float32 = pcm16ToFloat32(pcm);
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
  }

  /** Drop any pending playback — used on server `interrupted` signal. */
  clear(): void {
    this.nextStartTime = 0;
    if (this.ctx) this.nextStartTime = this.ctx.currentTime;
  }

  /** Release the AudioContext — call when the session ends. */
  close(): void {
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.nextStartTime = 0;
  }
}