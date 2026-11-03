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

export const DownIcon = () => <Icon d="M12 18l-8-8 2.5-2.5L12 13l5.5-5.5L20 10z" />;

/** A cross: take something out (never "delete"). */
export const RemoveIcon = () => (
  <Icon d="M6.4 4.3L12 9.9l5.6-5.6 2.1 2.1-5.6 5.6 5.6 5.6-2.1 2.1-5.6-5.6-5.6 5.6-2.1-2.1 5.6-5.6-5.6-5.6z" />
);

/** A pencil: edit something written. */
export const EditIcon = () => (
  <Icon d="M4 16.5L15 5.5l3.5 3.5-11 11H4zM16.5 4l1.5-1.5L21.5 6 20 7.5z" />
);

/** A square-headed eighth note: a project with no cover art yet. */
export const NoteIcon = ({ size }: { size?: number }) => (
  <Icon size={size} d="M14 4h6v4h-4v11H8v-5h6z" />
);

/** A square head over shoulders: someone with no profile picture yet. */
export const PersonIcon = ({ size }: { size?: number }) => (
  <Icon size={size} d="M8 3h8v8H8zM4 14h16v7H4z" />
);

/** A square-shouldered bell: notifications, in the header. */
export const BellIcon = ({ size }: { size?: number }) => (
  <Icon size={size} d="M11 2h2v2h-2zM7 5h10v9l2 2v2H5v-2l2-2zM10 19h4v3h-4z" />
);

/** A square speaker with two level bars: sound on. */
export const SpeakerIcon = ({ size }: { size?: number }) => (
  <Icon size={size} d="M3 9h4l5-5v16l-5-5H3zM15 9h2v6h-2zM19 6h2v12h-2z" />
);

/** The speaker with a square-cornered cross: muted. */
export const SpeakerMutedIcon = ({ size }: { size?: number }) => (
  <Icon
    size={size}
    d="M3 9h4l5-5v16l-5-5H3zM14 9.5L15.5 8l2.5 2.5L20.5 8l1.5 1.5-2.5 2.5 2.5 2.5-1.5 1.5-2.5-2.5-2.5 2.5-1.5-1.5 2.5-2.5z"
  />
);
