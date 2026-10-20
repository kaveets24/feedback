import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { z } from 'zod';
import { serverApi } from '../../lib/api';
import { loadOrNotFound } from '../../lib/load';
import { NewProjectForm } from './new-project-form';
import { ProjectCover } from './project-cover';
import { ReleaseTypeBadge } from './release-type-badge';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { cursor } = await searchParams;
  // An invalid cursor (a hand-edited URL) shows the first page rather than an error.
  const page = await loadOrNotFound(() =>
    serverApi().listProjects(z.uuid().safeParse(cursor).success ? { cursor } : {}),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <h1 className="text-3xl font-semibold">Projects</h1>
      <p className="mt-2 max-w-[65ch] text-muted">
        Group tracks into an EP, an album, or a folder of ideas, and put them in order. Projects are
        private: only you can see them.
      </p>

      <div className="mt-6 max-w-md">
        <NewProjectForm />
      </div>

      <section aria-labelledby="projects-heading" className="mt-12">
        <h2 id="projects-heading" className="mb-3 text-lg font-semibold">
          {cursor ? 'Older projects' : 'Your projects'}
        </h2>
        {page.projects.length === 0 ? (
          <p className="border-y border-rule py-6 text-muted">
            {cursor ? 'No older projects.' : 'No projects yet. Name one above to get started.'}
          </p>
        ) : (
          <ul className="border-t border-rule">
            {page.projects.map((project) => (
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
        )}
        <nav aria-label="More projects" className="mt-4 flex gap-4 text-sm">
          {cursor && (
            <Link href="/projects" className="link">
              Newest projects
            </Link>
          )}
          {page.nextCursor && (
            <Link href={`/projects?cursor=${page.nextCursor}`} className="link">
              Older projects
            </Link>
          )}
        </nav>
      </section>
    </main>
  );
}
