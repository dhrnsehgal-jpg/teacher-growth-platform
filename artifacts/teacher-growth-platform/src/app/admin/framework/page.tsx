import Link from 'next/link';

import { ActionForm, Field, SelectField, SourceFields, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { SourceBadge } from '@/components/source-badge';
import { createCompetency, createFramework } from '@/app/actions/admin';
import { getDomainOptions, hasPermission } from '@/lib/data/admin';
import { listCompetencies, listFrameworks } from '@/lib/data/framework';

export const metadata = { title: 'Competency framework' };

export const dynamic = 'force-dynamic';

export default async function FrameworkAdminPage() {
  const frameworks = await listFrameworks();
  const school = frameworks.find((f) => f.source_framework === 'school');
  const competencies = school ? await listCompetencies(school.key) : [];
  const [canManage, domains] = await Promise.all([
    hasPermission('competency.manage'),
    getDomainOptions(),
  ]);

  // Group by standard, then domain, preserving the framework's own ordering.
  const grouped = new Map<string, Map<string, typeof competencies>>();
  for (const c of competencies) {
    const standard = c.domain.standard.name;
    const domain = c.domain.name;
    if (!grouped.has(standard)) grouped.set(standard, new Map());
    const domains = grouped.get(standard)!;
    if (!domains.has(domain)) domains.set(domain, []);
    domains.get(domain)!.push(c);
  }

  return (
    <Shell
      path="/admin/framework"
      title="Competency Framework"
      lead="The school's operating framework, plus the external frameworks it is mapped against. Every item shows where it actually came from."
    >
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {frameworks.map((f) => (
          <Card
            key={f.id}
            title={f.name}
            meta={
              <SourceBadge
                framework={f.source_framework}
                alignment={f.source_alignment}
                externalReference={f.external_reference}
              />
            }
          >
            <p className="text-sm text-muted-foreground">{f.description}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Version {f.version} · {f.status}
            </p>
          </Card>
        ))}
      </div>

      {canManage && (
        <div className="mb-8 grid gap-5 lg:grid-cols-2">
          <Card title="Add a competency">
            <p className="mb-3 text-xs text-muted-foreground">
              Added to an existing domain. What a teacher is expected to demonstrate — not a task
              they perform.
            </p>
            <ActionForm action={createCompetency} submitLabel="Add competency" variant="primary">
              <SelectField
                name="domainId"
                label="Domain"
                options={domains.map((d) => ({
                  value: d.id,
                  label: `${d.framework_name} · ${d.standard_name} · ${d.name}`,
                }))}
              />
              <TextField name="key" label="Key" placeholder="assessment_for_learning" />
              <TextField name="name" label="Name" />
              <Field
                name="description"
                label="Description"
                placeholder="What does a teacher who has this competency actually do?"
              />
              <Field
                name="rationale"
                label="Why this competency exists"
                required={false}
                rows={2}
              />
              <SourceFields />
            </ActionForm>
          </Card>

          <Card title="Create a framework">
            <p className="mb-3 text-xs text-muted-foreground">
              Created as a draft, with its first standard and domain, so competencies have somewhere
              to live. An empty framework cannot hold anything.
            </p>
            <ActionForm action={createFramework} submitLabel="Create framework">
              <TextField name="key" label="Key" placeholder="school_professional_practice" />
              <TextField name="name" label="Framework name" />
              <Field name="description" label="Description" required={false} rows={2} />
              <TextField name="standardName" label="First standard" />
              <TextField name="domainName" label="First domain within it" />
              <SourceFields />
            </ActionForm>
          </Card>
        </div>
      )}

      {competencies.length === 0 ? (
        <EmptyState message="No competencies visible. Sign in with an account that belongs to a school, or run the seed." />
      ) : (
        <div className="space-y-10">
          {[...grouped.entries()].map(([standard, domains]) => (
            <div key={standard}>
              <h2 className="mb-4 text-lg font-semibold">{standard}</h2>
              <div className="space-y-6">
                {[...domains.entries()].map(([domain, items]) => (
                  <div key={domain}>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">{domain}</h3>
                    <ul className="divide-y rounded-lg border">
                      {items.map((c) => (
                        <li key={c.id} className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <Link
                              href={`/admin/framework/${c.key}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {c.name}
                            </Link>
                            <div className="flex items-center gap-2">
                              {c.status === 'retired' && (
                                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                  Retired
                                </span>
                              )}
                              <SourceBadge
                                framework={c.source_framework}
                                alignment={c.source_alignment}
                                externalReference={c.external_reference}
                              />
                            </div>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
