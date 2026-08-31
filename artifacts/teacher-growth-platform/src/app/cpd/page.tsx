import { ActionForm, Field, SelectField, TextField } from '@/components/action-form';
import { ProgressBar } from '@/components/progress-bar';
import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { recordCpd } from '@/app/actions/compliance';
import {
  getActivityRules,
  getCapGroups,
  getCpdCategories,
  getCpdProgress,
  getCpdRecords,
  getCpdSourceTypes,
  getRequirementVersion,
  STATE_CLASS,
  STATE_LABEL,
  type ProgressRow,
} from '@/lib/data/compliance';
import { getCurrentYear, getSessionProfile } from '@/lib/data/growth';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'My CPD' };

export const dynamic = 'force-dynamic';

function hours(n: number) {
  return Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1);
}

function Row({ row }: { row: ProgressRow }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{row.label}</span>
        <span className="shrink-0 text-sm tabular-nums">
          <span className="font-medium">{hours(row.completed_hours)}</span>
          <span className="text-muted-foreground"> / {hours(row.required_hours)}</span>
        </span>
      </div>
      <ProgressBar
        completed={row.completed_hours}
        required={row.required_hours}
        state={row.state}
      />
    </div>
  );
}

export default async function CpdPage() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/cpd" title="My CPD">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: schoolRow } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select('school_id')
    .eq('id', profile.id)
    .maybeSingle();
  const schoolId = (schoolRow as unknown as { school_id: string } | null)?.school_id ?? '';

  const [progress, records, categories, sourceTypes, version] = await Promise.all([
    getCpdProgress(profile.id, year.id),
    getCpdRecords(profile.id, year.id),
    getCpdCategories(),
    getCpdSourceTypes(),
    getRequirementVersion(schoolId, year.id),
  ]);

  if (!version) {
    return (
      <Shell path="/cpd" title="My CPD" lead={`Academic year ${year.label}`}>
        <EmptyState message="No CPD requirement is configured for this academic year. Until one is bound the platform shows no target — inventing one would be worse than showing nothing." />
      </Shell>
    );
  }

  const [rules, capGroups] = await Promise.all([
    getActivityRules(version.id),
    getCapGroups(version.id),
  ]);

  const total = progress.find((p) => p.dimension === 'total');
  const bySource = progress.filter((p) => p.dimension === 'source_class');
  const byCategory = progress.filter((p) => p.dimension === 'category');
  const matrix = progress.filter((p) => p.dimension === 'category_source');

  const verified = records.filter((r) => r.status === 'verified');
  const pending = records.filter((r) => r.status === 'submitted');
  const returned = records.filter((r) => r.status === 'returned_for_clarification');
  const notCounting = verified.filter((r) => !r.counts_toward_requirement);

  return (
    <Shell
      path="/cpd"
      title="My CPD"
      lead={`Continuous professional development for ${year.label}, against the requirement in force for this year.`}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {total && (
            <Card
              title="Annual CPD"
              meta={
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_CLASS[total.state]}`}
                >
                  {STATE_LABEL[total.state]}
                </span>
              }
            >
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {hours(total.completed_hours)}
                </span>
                <span className="text-lg tabular-nums text-muted-foreground">
                  / {hours(total.required_hours)} hours
                </span>
              </div>
              <ProgressBar
                completed={total.completed_hours}
                required={total.required_hours}
                state={total.state}
              />
              <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Completed</dt>
                  <dd className="tabular-nums">{hours(total.completed_hours)} hours</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Remaining</dt>
                  <dd className="tabular-nums">{hours(total.remaining_hours)} hours</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{STATE_LABEL[total.state]}</dd>
                </div>
              </dl>
            </Card>
          )}

          <Card title="By source">
            <div className="space-y-4">
              {bySource.map((row) => (
                <Row key={row.item_key} row={row} />
              ))}
            </div>
          </Card>

          <Card title="By domain">
            <div className="space-y-4">
              {byCategory.map((row) => (
                <Row key={row.item_key} row={row} />
              ))}
            </div>
          </Card>

          <Card
            title="Where the shortfall sits"
            meta={<span className="text-xs text-muted-foreground">domain &times; source</span>}
          >
            <ScrollRegion label="Where the shortfall sits">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      Domain
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Source
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Done
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Required
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Remaining
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.item_key} className="border-t">
                      <td className="py-2">{row.label}</td>
                      <td className="py-2 text-muted-foreground">
                        {row.source_class === 'board_or_government'
                          ? 'CBSE / Government'
                          : 'In-house / School Complex'}
                      </td>
                      <td className="py-2 text-right tabular-nums">{hours(row.completed_hours)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {hours(row.required_hours)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.remaining_hours > 0 ? hours(row.remaining_hours) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>

          <Card title="My CPD record">
            {records.length === 0 ? (
              <EmptyState message="Nothing recorded for this year yet." />
            ) : (
              <ul className="divide-y text-sm">
                {records.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span className="shrink-0 tabular-nums">
                        {r.status === 'verified'
                          ? `${hours(r.credited_hours ?? 0)} h credited`
                          : `${hours(r.claimed_hours)} h claimed`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.category_name} · {r.source_type_name} · {r.activity_from}
                      {r.activity_to !== r.activity_from ? ` to ${r.activity_to}` : ''} ·{' '}
                      <span className="capitalize">{r.status.replace(/_/g, ' ')}</span>
                      {r.activity_rule_name ? ' · credited under an activity rule' : ''}
                      {!r.counts_toward_requirement
                        ? ' · source not counted toward the CBSE requirement'
                        : ''}
                    </p>
                    {r.competency_link_count > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Linked to {r.competency_link_count}{' '}
                        {r.competency_link_count === 1 ? 'competency' : 'competencies'}. Linking
                        does not change the hours.
                      </p>
                    )}
                    {r.review_note && r.status !== 'verified' && (
                      <p className="mt-1 text-xs text-caution-foreground">{r.review_note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Record CPD">
            <p className="mb-3 text-xs text-muted-foreground">
              Hours you enter are a claim. They count once a reviewer verifies the record.
            </p>
            <ActionForm action={recordCpd} submitLabel="Submit for verification" variant="primary">
              <TextField name="title" label="What did you attend?" />
              <SelectField
                name="categoryId"
                label="CPD domain"
                options={categories.map((c) => ({ value: c.id, label: c.display_name }))}
              />
              <SelectField
                name="sourceTypeId"
                label="Source"
                options={sourceTypes.map((s) => ({
                  value: s.id,
                  label: s.counts_toward_requirement
                    ? s.display_name
                    : `${s.display_name} (not counted)`,
                }))}
              />
              <TextField name="providerName" label="Provider" required={false} />
              <TextField name="activityFrom" label="Date (YYYY-MM-DD)" />
              <TextField name="activityTo" label="End date, if longer" required={false} />
              <TextField name="hours" label="Hours attended" required={false} />
              <SelectField
                name="activityRuleId"
                label="Or claim under an activity rule"
                options={[
                  { value: '', label: 'Not an activity claim' },
                  ...rules.map((r) => ({
                    value: r.id,
                    label: `${r.permitted_activity.slice(0, 55)}… (${hours(r.hour_credit)} h)`,
                  })),
                ]}
              />
              <Field name="description" label="Notes" required={false} rows={2} />
            </ActionForm>
          </Card>

          <Card title="The rule in force">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Requirement</dt>
                <dd>{version.title}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="tabular-nums">{hours(version.total_hours)} hours per year</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">
                  {version.classification} · {version.verification_status.replace(/_/g, ' ')}
                </dd>
              </div>
              {version.clause_reference && (
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="text-xs">{version.clause_reference}</dd>
                </div>
              )}
            </dl>
            {version.applicability !== 'verified' && version.applicability_note && (
              <p className="mt-3 rounded-md bg-caution p-3 text-xs text-caution-foreground">
                {version.applicability_note}
              </p>
            )}
          </Card>

          {capGroups.length > 0 && (
            <Card title="Caps">
              {capGroups.map((g) => (
                <div key={g.id} className="text-sm">
                  <p>
                    <span className="font-medium">{g.display_name}</span>: at most{' '}
                    <span className="tabular-nums">{hours(g.cap_hours)}</span> hours a year in
                    total.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{g.cap_basis}</p>
                </div>
              ))}
            </Card>
          )}

          {(pending.length > 0 || returned.length > 0 || notCounting.length > 0) && (
            <Card title="Needs attention">
              <ul className="space-y-2 text-sm">
                {pending.length > 0 && (
                  <li>
                    {pending.length} record{pending.length === 1 ? '' : 's'} awaiting verification —
                    those hours are not counted yet.
                  </li>
                )}
                {returned.length > 0 && (
                  <li className="text-caution-foreground">
                    {returned.length} returned for clarification.
                  </li>
                )}
                {notCounting.length > 0 && (
                  <li className="text-muted-foreground">
                    {notCounting.length} verified record{notCounting.length === 1 ? '' : 's'} from a
                    source not classified as counting toward the CBSE requirement.
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
