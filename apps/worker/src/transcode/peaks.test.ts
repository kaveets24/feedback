import { describe, expect, it } from 'vitest';
import { PeakCollector } from './peaks.ts';

const samples = (...values: number[]) => {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
};

describe('PeakCollector', () => {
  it('keeps the loudest sample of each window, ignoring sign', () => {
    const collector = new PeakCollector(2);
    collector.push(samples(0.1, -0.5, 0.25, 0.2, -1, 0));
    expect(collector.sampleCount).toBe(6);
    expect(collector.peaks(3)).toEqual([0.5, 0.25, 1]);
  });

  it('reduces many windows to the requested count', () => {
    const collector = new PeakCollector(1);
    collector.push(samples(0.1, 0.9, 0.2, 0.3, 0.4, 0.8));
    expect(collector.peaks(2)).toEqual([0.9, 0.8]);
  });

  it('repeats windows for a track shorter than the point count', () => {
    const collector = new PeakCollector(1);
    collector.push(samples(0.2, 0.6));
    expect(collector.peaks(4)).toEqual([0.2, 0.2, 0.6, 0.6]);
  });

  it('counts a trailing partial window', () => {
    const collector = new PeakCollector(4);
    collector.push(samples(0.1, 0.1, 0.1, 0.1, 0.7));
    expect(collector.peaks(2)).toEqual([0.1, 0.7]);
  });

  it('joins samples split across chunks', () => {
    const bytes = samples(0.5, -0.75, 0.25);
    const collector = new PeakCollector(1);
    collector.push(bytes.subarray(0, 3));
    collector.push(bytes.subarray(3, 9));
    collector.push(bytes.subarray(9));
    expect(collector.sampleCount).toBe(3);
    expect(collector.peaks(3)).toEqual([0.5, 0.75, 0.25]);
  });

  it('clips over-full-scale samples to 1, skips NaN, and rounds to 3 places', () => {
    const collector = new PeakCollector(1);
    collector.push(samples(1.7, Number.NaN, 0.12345));
    expect(collector.peaks(3)).toEqual([1, 0, 0.123]);
  });

  it('returns silence when nothing was pushed', () => {
    const collector = new PeakCollector(160);
    expect(collector.sampleCount).toBe(0);
    expect(collector.peaks(3)).toEqual([0, 0, 0]);
  });
});
