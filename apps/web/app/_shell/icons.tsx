// Filled, square-cornered icons on a 24-unit grid, in the same hand as the transport button's.
// Decorative: the button around each one carries the label.

function Icon({ size = 18, d }: { size?: number; d: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Two columns of three dots: the drag handle. */
export const GripIcon = () => (
  <Icon d="M8 4h3v3H8zM13 4h3v3h-3zM8 10.5h3v3H8zM13 10.5h3v3h-3zM8 17h3v3H8zM13 17h3v3h-3z" />
);

export const UpIcon = () => <Icon d="M12 6l8 8-2.5 2.5L12 11l-5.5 5.5L4 14z" />;

export const DownIcon = () => <Icon d="M12 18l-8-8 2.5-2.5L12 13l5.5-5.5L20 10z" />;

/** A cross: take something out (never "delete"). */
export const RemoveIcon = () => (
  <Icon d="M6.4 4.3L12 9.9l5.6-5.6 2.1 2.1-5.6 5.6 5.6 5.6-2.1 2.1-5.6-5.6-5.6 5.6-2.1-2.1 5.6-5.6-5.6-5.6z" />
);
