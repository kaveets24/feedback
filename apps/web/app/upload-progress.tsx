/**
 * How much of the file has gone up: lit, striped cells in an LCD window, with the percent read
 * out beside them. At 100% the stripes keep drifting while processing starts.
 */
export function UploadProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div
      role="progressbar"
      aria-label="Uploading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="lcd m-[3px] flex items-center gap-3 px-3 py-2"
    >
      <div className="progress-unlit h-3 flex-1 overflow-hidden rounded-[2px]">
        <div className="progress-stripes h-full" style={{ width: `${percent}%` }} />
      </div>
      <span
        aria-hidden="true"
        className="w-12 text-right font-lcd text-base text-lcd-ink tabular-nums"
      >
        {percent}%
      </span>
    </div>
  );
}
