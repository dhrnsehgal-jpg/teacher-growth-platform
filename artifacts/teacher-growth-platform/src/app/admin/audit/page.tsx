import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { getAuditActions, getAuditLog } from '@/lib/data/audit';
import { hasPermission } from '@/lib/data/admin';

export const metadata = { title: 'Audit log' };

export const dynamic = 'force-dynamic';

const SCHEMA_LABEL: Record<string, string> = {
  appraisal: 'Appraisal',
  assessment: 'Assessment',
  competency: 'Competency framework',
  compliance: 'CPD compliance',
  core: 'People and roles',
  evidence: 'Evidence',
  growth: 'Growth and learning plans',
  kpi: 'KPIs',
  pay: 'Pay and increments',
  regulatory: 'Regulatory register',
  sqaaf: 'SQAAF',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; schema?: string }>;
}) {
  const canRead = await hasPermission('audit.read');
  if (!canRead) {
    return (
      <Shell path="/admin/audit" title="Audit log">
        <EmptyState message="You do not have permission to read the audit log." />
      </Shell>
    );
  }

  const params = await searchParams;
  const [entries, actions] = await Promise.all([
    getAuditLog({ action: params.action, schema: params.schema }),
    getAuditActions(),
  ]);
  const schemas = [...new Set(entries.map((e) => e.entity_schema))].sort();

  return (
    <Shell
      path="/admin/audit"
      title="Audit log"
      lead="What was recorded, who recorded it, and when. Entries are written by the database as changes happen and cannot be edited or removed from here."
    >
      <form className="mb-5 flex flex-wrap items-end gap-4" method="get">
        <div>
          <label htmlFor="action" className="block text-sm font-medium">
            Area of activity
          </label>
          <select
            id="action"
            name="action"
            defaultValue={params.action ?? ''}
            className="mt-1 rounded-md border border-input bg-transparent p-2 text-sm"
          >
            <option value="">All activity</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="schema" className="block text-sm font-medium">
            Part of the system
          </label>
          <select
            id="schema"
            name="schema"
            defaultValue={params.schema ?? ''}
            className="mt-1 rounded-md border border-input bg-transparent p-2 text-sm"
          >
            <option value="">Everywhere</option>
            {schemas.map((s) => (
              <option key={s} value={s}>
                {SCHEMA_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
          Apply
        </button>
      </form>

      <Card
        title="Recorded activity"
        meta={
          <span className="text-xs text-muted-foreground">
            {entries.length} most recent · newest first
          </span>
        }
      >
        {entries.length === 0 ? (
          <EmptyState message="No audit entries match this filter." />
        ) : (
          <ScrollRegion label="Audit entries">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">
                Audit entries, newest first, showing what happened, who did it and when.
              </caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="pb-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    What happened
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Where
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Who
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-3 font-medium">{e.action.replace(/[._]/g, ' ')}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {SCHEMA_LABEL[e.entity_schema] ?? e.entity_schema}
                      <span className="block text-xs">{e.entity_table}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {e.actor_name ?? 'System'}
                      {e.actor_role_key && (
                        <span className="block text-xs capitalize text-muted-foreground">
                          {e.actor_role_key.replace(/_/g, ' ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {e.reason ?? <span className="text-xs">not stated</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          The trail is append-only in the database, so nothing shown here can be altered or deleted
          through the application. Records of who opened an individual teacher&rsquo;s pay or
          appraisal file are kept separately and are visible to that teacher on their own profile.
        </p>
      </Card>
    </Shell>
  );
}
