'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { visibilitySchema, type ShareLinkResponse, type Visibility } from '@feedback/shared';
import { formatDate } from '../../lib/format';
import {
  EXPIRY_CHOICES,
  EXPIRY_LABELS,
  linkState,
  shareUrl,
  VISIBILITY_CHOICES,
  type ExpiryChoice,
} from '../../lib/share';
import { DownIcon } from '../_shell/icons';
import { createShareLinkAction, revokeShareLinkAction, setVisibilityAction } from './actions';

type Target = { kind: 'track' | 'project'; id: string };

/**
 * Who can listen to a track or project, and its share links. Privacy settings, so the words are
 * plain and every change is a deliberate press (CLAUDE.md section 9: trust comes first).
 */
export function SharingSection({
  target,
  visibility,
  projectVisibility,
  inherits,
  links,
}: {
  target: Target;
  /** The effective visibility. */
  visibility: Visibility;
  /** For a track in a project: the project's, which it can follow. */
  projectVisibility?: Visibility;
  /** For a track in a project: whether it follows the project now. */
  inherits?: boolean;
  links: ShareLinkResponse[];
}) {
  return (
    <section id="sharing" aria-labelledby="sharing-heading" className="mt-12 scroll-mt-6">
      <h2 id="sharing-heading" className="mb-4 text-lg font-semibold">
        Sharing
      </h2>
      <VisibilityForm
        target={target}
        visibility={visibility}
        projectVisibility={projectVisibility}
        inherits={inherits ?? false}
      />
      <ShareLinks target={target} visibility={visibility} links={links} />
    </section>
  );
}

const INHERIT = 'project';

function VisibilityForm({
  target,
  visibility,
  projectVisibility,
  inherits,
}: {
  target: Target;
  visibility: Visibility;
  projectVisibility?: Visibility;
  inherits: boolean;
}) {
  const saved = inherits ? INHERIT : visibility;
  const [choice, setChoice] = useState<string>(saved);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const noun = target.kind;

  const options = [
    ...(projectVisibility
      ? [
          {
            value: INHERIT,
            label: `Same as the project (${VISIBILITY_CHOICES[projectVisibility].label.toLowerCase()})`,
            description: 'Changes when the project’s setting does.',
          },
        ]
      : []),
    ...visibilitySchema.options.map((value) => ({ value, ...VISIBILITY_CHOICES[value] })),
  ];

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await setVisibilityAction(target, choice === INHERIT ? null : choice);
      setMessage(
        result.ok ? { error: false, text: 'Saved.' } : { error: true, text: result.message },
      );
    });
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Who can listen to this ${noun}`}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who can listen</legend>
        <div className="space-y-3">
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name={`visibility-${target.id}`}
                value={option.value}
                checked={choice === option.value}
                onChange={() => {
                  setChoice(option.value);
                  setMessage(null);
                }}
                className="mt-1 size-4 shrink-0"
              />
              <span>
                <span className="block">{option.label}</span>
                <span className="block text-sm text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn" disabled={pending || choice === saved}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        {message && (
          <p
            role={message.error ? 'alert' : 'status'}
            className={`text-sm ${message.error ? 'text-danger' : 'text-muted'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}

function ShareLinks({
  target,
  visibility,
  links,
}: {
  target: Target;
  visibility: Visibility;
  links: ShareLinkResponse[];
}) {
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const [created, setCreated] = useState<{ url: string; copied: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noun = target.kind;
  const isPrivate = visibility === 'private';
  const now = new Date();
  const active = links.filter((link) => linkState(link, now).active);
  const inactive = links.filter((link) => !linkState(link, now).active);

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createShareLinkAction(target, {
        expiry,
        allowLinkAccess: isPrivate,
      });
      if (result.ok)
        setCreated({ url: shareUrl(window.location.origin, result.data.token), copied: false });
      else setError(result.message);
    });
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCreated({ ...created, copied: true });
    } catch {
      setError('Couldn’t copy. Select the link and copy it yourself.');
    }
  }

  return (
    <div className="mt-10">
      <h3 className="font-semibold">Share links</h3>
      <p className="mt-1 max-w-[65ch] text-sm text-muted">
        {noun === 'project'
          ? 'Anyone with a link can listen to this project’s tracks, except tracks set to only you, and comment on them if they’re signed in. Listening doesn’t need an account.'
          : 'Anyone with a link can listen to this track, and comment on it if they’re signed in. Listening doesn’t need an account.'}{' '}
        You can turn a link off at any time.
      </p>

      <form onSubmit={onCreate} className="mt-4 space-y-4" aria-label="Make a share link">
        <div className="flex flex-wrap gap-4">
          <Select
            id={`link-expiry-${target.id}`}
            label="Stops working"
            value={expiry}
            onChange={(value) => setExpiry(value as ExpiryChoice)}
            options={EXPIRY_CHOICES.map((choice) => [choice, EXPIRY_LABELS[choice]])}
          />
        </div>
        {isPrivate && (
          <p className="max-w-[65ch] text-sm">
            This {noun} is set to only you, so links don’t work yet. Making a link also changes who
            can listen to “Anyone with a link”.
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending
            ? 'Making the link…'
            : isPrivate
              ? 'Allow link access and make a link'
              : 'Make a link'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>

      {created && (
        <div role="status" className="mt-4 max-w-xl space-y-2">
          <label htmlFor={`new-link-${target.id}`} className="block text-sm font-medium">
            New link
          </label>
          <div className="flex gap-2">
            <input
              id={`new-link-${target.id}`}
              readOnly
              value={created.url}
              onFocus={(event) => event.currentTarget.select()}
              className="field min-w-0 flex-1 font-mono text-sm"
            />
            <button type="button" className="btn" onClick={() => void copy()}>
              {created.copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-muted">
            Copy it now. For your security, it can’t be shown again.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <ul className="mt-6 border-t border-rule" aria-label="Links that work">
          {active.map((link) => (
            <LinkRow key={link.id} target={target} link={link} now={now} />
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">
            Turned off or expired ({inactive.length})
          </summary>
          <ul className="mt-2 border-t border-rule">
            {inactive.map((link) => (
              <LinkRow key={link.id} target={target} link={link} now={now} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LinkRow({ target, link, now }: { target: Target; link: ShareLinkResponse; now: Date }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const state = linkState(link, now);

  function revoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeShareLinkAction(target, link.id);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule py-3">
      <div className="min-w-0 flex-1">
        <p>
          Made <time dateTime={link.createdAt}>{formatDate(link.createdAt)}</time>
        </p>
        <p className="text-sm text-muted">{state.text}</p>
      </div>
      {state.active &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">People using this link will lose access right away.</p>
            <button type="button" className="btn btn-danger" disabled={pending} onClick={revoke}>
              {pending ? 'Turning off…' : 'Turn off'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Turn off
          </button>
        ))}
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field appearance-none pr-10"
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
          <DownIcon />
        </span>
      </div>
    </div>
  );
}
