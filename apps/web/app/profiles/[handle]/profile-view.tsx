import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  CITY_LABELS,
  GENRE_LABELS,
  type ProjectResponse,
  type PublicProfileResponse,
  type TrackSummary,
} from '@feedback/shared';
import { formatDuration, formatShortDate } from '../../../lib/format';
import { listItem } from '../../../lib/player-item';
import { ResultQueue, ResultRow } from '../../_discover/result-row';
import { Avatar } from '../../_shell/avatar';
import { UnderlineTabs } from '../../_shell/tabs';
import { ProjectCover } from '../../projects/project-cover';
import { ReleaseTypeBadge } from '../../projects/release-type-badge';
import { FollowButton } from './follow-button';

export type Tab = 'tracks' | 'projects';

/**
 * Someone's public page: who they are, Follow (or Edit profile for them), and their public tracks
 * and projects as two tabs (links, so they work without JavaScript). Tracks play in place, like
 * home's results.
 */
export function ProfileView({
  profile,
  tab,
  playable,
  projects,
  isYou,
  canFollow,
  signedIn,
}: {
  profile: PublicProfileResponse;
  tab: Tab;
  /** Their public tracks with a ready version, newest first. */
  playable: TrackSummary[];
  projects: ProjectResponse[];
  isYou: boolean;
  /** Signed out (Sign in to follow) or approved; accounts waiting for approval get no button. */
  canFollow: boolean;
  signedIn: boolean;
}) {
  const projectTitles = new Map(projects.map((project) => [project.id, project.title]));
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <Identity profile={profile}>
        {isYou ? (
          <Link href="/settings/profile" className="btn shrink-0 self-start">
            Edit profile
          </Link>
        ) : (
          canFollow && (
            <FollowButton
              handle={profile.handle}
              following={profile.following}
              signedIn={signedIn}
            />
          )
        )}
      </Identity>
      {isYou && (
        <p className="mt-4 max-w-[60ch] text-sm text-muted">
          This is your public page. Everyone sees it like this, with only what you’ve made public.
        </p>
      )}

      <Tabs
        handle={profile.handle}
        tab={tab}
        counts={{ tracks: playable.length, projects: projects.length }}
      />
      <div id="profile-list" className="mt-3">
        {tab === 'tracks' ? (
          <TrackList handle={profile.handle} tracks={playable} projectTitles={projectTitles} />
        ) : (
          <ProjectList projects={projects} />
        )}
      </div>
    </main>
  );
}

/** The picture beside the name, handle and city, and bio, with the page's action at the right. */
function Identity({ profile, children }: { profile: PublicProfileResponse; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
        <Avatar avatar={profile.avatar} size="page" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold break-words text-balance">
            {profile.displayName ?? `@${profile.handle}`}
          </h1>
          {/* With no name, the H1 is already the handle, so the line keeps only the city. */}
          {(profile.displayName || profile.city) && (
            <p className="mt-1 text-sm text-muted">
              {[
                profile.displayName && `@${profile.handle}`,
                profile.city && CITY_LABELS[profile.city],
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {profile.bio && (
            <p className="mt-3 max-w-[60ch] break-words whitespace-pre-line">{profile.bio}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Tracks and Projects, as tabs. */
function Tabs({ handle, tab, counts }: { handle: string; tab: Tab; counts: Record<Tab, number> }) {
  return (
    <UnderlineTabs
      label="Their work"
      className="mt-8"
      items={[
        { label: 'Tracks', href: `/@${handle}`, current: tab === 'tracks', count: counts.tracks },
        {
          label: 'Projects',
          href: `/@${handle}?tab=projects`,
          current: tab === 'projects',
          count: counts.projects,
        },
      ]}
    />
  );
}

/** Their public tracks (ready ones), newest first, each playable in place and queued in order. */
function TrackList({
  handle,
  tracks,
  projectTitles,
}: {
  handle: string;
  tracks: TrackSummary[];
  projectTitles: Map<string, string>;
}) {
  if (tracks.length === 0) return <Empty>No public tracks yet.</Empty>;
  return (
    <ResultQueue
      queueId={`profile:${handle}`}
      items={tracks.map((track) => listItem(track, track.latestVersion))}
    >
      <ul>
        {tracks.map((track, index) => {
          const { versionNumber, durationMs, createdAt } = track.latestVersion;
          const project = track.projectId ? projectTitles.get(track.projectId) : undefined;
          const length = formatDuration(durationMs ?? 0);
          const date = createdAt ? formatShortDate(createdAt) : null;
          const meta = [project, track.genre && GENRE_LABELS[track.genre], `v${versionNumber}`]
            .filter(Boolean)
            .join(' · ');
          return (
            <ResultRow key={track.id} index={index}>
              <div className="min-w-0">
                <p className="line-clamp-2 font-medium break-words sm:line-clamp-1">
                  <Link
                    href={`/tracks/${track.id}`}
                    className="rounded-sm group-data-playing:text-accent hover:text-accent focus-glow"
                  >
                    {track.title}
                  </Link>
                </p>
                <p className="text-sm text-muted">
                  {meta}
                  <span className="whitespace-nowrap sm:hidden">
                    {' · '}
                    <span className="font-lcd text-base text-ink tabular-nums">{length}</span>
                    {date && ` · ${date}`}
                  </span>
                </p>
              </div>
              <span className="hidden text-right font-lcd text-base tabular-nums sm:block">
                {length}
              </span>
              <span className="hidden text-right text-sm whitespace-nowrap text-muted sm:block">
                {createdAt && date && <time dateTime={createdAt}>{date}</time>}
              </span>
            </ResultRow>
          );
        })}
      </ul>
    </ResultQueue>
  );
}

/** Their public projects, newest first, like the projects list: cover, title, release type. */
function ProjectList({ projects }: { projects: ProjectResponse[] }) {
  if (projects.length === 0) return <Empty>No public projects yet.</Empty>;
  return (
    <ul>
      {projects.map((project) => (
        <li
          key={project.id}
          className="relative flex items-center gap-4 border-b border-rule py-3 hover:bg-chrome-lo/60"
        >
          <ProjectCover cover={project.cover} size="list" />
          <div className="min-w-0 flex-1">
            {/* The link's hit area covers the whole row. */}
            <Link
              href={`/projects/${project.id}`}
              className="row-link line-clamp-2 font-medium break-words sm:line-clamp-1"
            >
              {project.title}
            </Link>
            {project.description && (
              <p className="line-clamp-2 text-sm text-muted sm:line-clamp-1">
                {project.description}
              </p>
            )}
          </div>
          <ReleaseTypeBadge releaseType={project.releaseType} />
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="border-b border-rule py-6 text-muted">{children}</p>;
}
