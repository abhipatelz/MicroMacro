import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { listProjectsForUser, listTeamsForFilter } from '@/lib/projectList';
import { listLifecycles } from '@/lib/lifecycles';
import ProjectsClient from './ProjectsClient';

/**
 * Server-rendered projects list. The initial set of active projects, the
 * team filter options, and the lifecycle options are all resolved on the
 * server, so the HTML already contains rows on the first paint and no
 * API round-trip is needed before LCP.
 */
export default async function ProjectsPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  const [projects, teams] = await Promise.all([
    listProjectsForUser(jwt.sub, jwt.role, {
      statuses: ['planning', 'in_progress', 'on_hold'],
    }),
    listTeamsForFilter(),
  ]);

  return (
    <ProjectsClient
      initialData={{
        projects,
        teams,
        lifecycles: listLifecycles(),
      }}
    />
  );
}
