// Waveform peaks from decoded audio. ffmpeg streams mono float32 samples to stdout; the collector
// keeps the loudest sample of each short window as they arrive (so a 20-minute track never sits in
// memory), and `peaks` reduces those windows to the points the player draws.

const BYTES_PER_SAMPLE = 4;

export class PeakCollector {
  readonly #windowSize: number;
  readonly #windows: number[] = [];
  #current = 0;
  #inWindow = 0;
  #samples = 0;
  /** Bytes of a sample split across two chunks. */
  #partial = Buffer.alloc(0);

  /** `windowSize` is in samples, e.g. 160 for 10 ms at 16 kHz. */
  constructor(windowSize: number) {
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new RangeError('windowSize must be a positive integer');
    }
    this.#windowSize = windowSize;
  }

  /** Adds little-endian float32 samples, in chunks of any length. */
  push(chunk: Buffer): void {
    const bytes = this.#partial.length ? Buffer.concat([this.#partial, chunk]) : chunk;
    const whole = bytes.length - (bytes.length % BYTES_PER_SAMPLE);
    for (let offset = 0; offset < whole; offset += BYTES_PER_SAMPLE) {
      const level = Math.abs(bytes.readFloatLE(offset));
      // NaN compares false, so a bad sample is skipped rather than poisoning the window.
      if (level > this.#current) this.#current = level;
      if (++this.#inWindow === this.#windowSize) this.#closeWindow();
    }
    this.#samples += whole / BYTES_PER_SAMPLE;
    this.#partial = Buffer.from(bytes.subarray(whole));
  }

  /** How many samples have been pushed. */
  get sampleCount(): number {
    return this.#samples;
  }

  /**
   * `count` points, each the loudest window in its slice of the track, as a fraction of full
   * scale (clipped to 1, rounded to 3 places to keep the stored JSON small). A track shorter
   * than `count` windows repeats windows rather than returning fewer points.
   */
  peaks(count: number): number[] {
    const windows = this.#inWindow ? [...this.#windows, this.#current] : this.#windows;
    if (windows.length === 0) return new Array<number>(count).fill(0);
    const points: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor((i * windows.length) / count);
      const end = Math.max(start + 1, Math.floor(((i + 1) * windows.length) / count));
      let peak = 0;
      for (let w = start; w < end; w++) peak = Math.max(peak, windows[w]!);
      points.push(Math.round(Math.min(peak, 1) * 1000) / 1000);
    }
    return points;
  }

  #closeWindow() {
    this.#windows.push(this.#current);
    this.#current = 0;
    this.#inWindow = 0;
  }
}
