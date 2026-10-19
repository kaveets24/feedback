import { formatDuration } from '../../lib/format';

/**
 * A time on the LCD, e.g. "1:12". Each character sits in a fixed-width cell over an unlit "8",
 * the way an LCD's segments show, so the readout doesn't shift as the seconds tick.
 */
export function LcdTime({ ms, className = '' }: { ms: number; className?: string }) {
  const text = formatDuration(ms);
  return (
    <span className={`inline-flex ${className}`}>
      <span className="sr-only">{text}</span>
      {[...text].map((char, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`relative inline-block ${char === ':' ? 'w-[0.45em] text-center' : 'w-[0.8em] text-right'}`}
        >
          <span className="absolute inset-0 text-lcd-ghost">{char === ':' ? ':' : '8'}</span>
          <span className="relative">{char}</span>
        </span>
      ))}
    </span>
  );
}
