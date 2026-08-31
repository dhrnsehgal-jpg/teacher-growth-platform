import Link from 'next/link';

import { ActionForm, Field, SelectField, TextField } from '@/components/action-form';
import { ProgressBar } from '@/components/progress-bar';
import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { verifyCpdRecord } from '@/app/actions/compliance';
import {
  getCpdAwaitingReview,
  getSchoolCpdOverview,
  STATE_CLASS,
  STATE_LABEL,
  type TeacherComplianceRow,
} from '@/lib/data/compliance';
import { getCurrentYear, getTeamGaps } from '@/lib/data/growth';
import {
  getEvidenceGaps,
  getImprovementActions,
  getReadiness,
  getSelfAssessment,
} from '@/lib/data/sqaaf';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'CPD compliance' };

export const dynamic = 'force-dynamic';

function hours(n: number) {
  return Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1);
}

/**
 * Stage roll-up. A teacher who teaches two stages counts toward both, so these
 * figures answer "how is CPD going for the people teaching this stage?" and
 * deliberately do not sum to the school total. The card says so.
 */
function groupByStage(rows: TeacherComplianceRow[]) {
  const map = new Map<string, { completed: number; required: number; people: number }>();
  for (const r of rows) {
    if (!r.total) continue;
    const stages = r.stages.length > 0 ? r.stages : ['No stage assigned'];
    for (const stage of stages) {
      const acc = map.get(stage) ?? { completed: 0, required: 0, people: 0 };
      acc.completed += Number(r.total.completed_hours);
      acc.required += Number(r.total.required_hours);
      acc.people += 1;
      map.set(stage, acc);
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Departmental and category roll-ups, computed from the same per-teacher rows. */
function groupBy(rows: TeacherComplianceRow[], key: 'department' | 'category') {
  const map = new Map<string, { completed: number; required: number; people: number }>();
  for (const r of rows) {
    if (!r.total) continue;
    const k = r[key] ?? 'Unassigned';
    const acc = map.get(k) ?? { completed: 0, required: 0, people: 0 };
    acc.completed += Number(r.total.completed_hours);
    acc.required += Number(r.total.required_hours);
    acc.people += 1;
    map.set(k, acc);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default async function CompliancePage() {
  const year = await getCurrentYear();
  if (!year) {
    return (
      <Shell path="/compliance" title="Compliance">
        <EmptyState message="No academic year is current." />
      </Shell>
    );
  }

  const [staff, awaiting, gaps, assessment] = await Promise.all([
    getSchoolCpdOverview(year.id),
    getCpdAwaitingReview(year.id),
    getTeamGaps(year.id),
    getSelfAssessment(year.id),
  ]);

  if (staff.length === 0) {
    return (
      <Shell path="/compliance" title="Compliance">
        <EmptyState message="No staff CPD records are visible to this account." />
      </Shell>
    );
  }

  const [readiness, actions, sqaafGaps] = assessment
    ? await Promise.all([
        getReadiness(assessment.id),
        getImprovementActions(assessment.id),
        getEvidenceGaps(assessment.id),
      ])
    : [[], [], []];
  const openSqaafGaps = sqaafGaps.filter((g) => !g.resolved_at);

  const withTotals = staff.filter((s) => s.total);
  const compliant = withTotals.filter((s) => s.total!.state === 'compliant');
  const atRisk = withTotals.filter(
    (s) => s.total!.state === 'at_risk' || s.total!.state === 'not_met',
  );

  // Which domains and sources are short across the school — the actionable view
  // for whoever plans next term's training calendar.
  const categoryShort = new Map<string, number>();
  const sourceShort = new Map<string, number>();
  for (const s of withTotals) {
    for (const c of s.byCategory) {
      if (c.remaining_hours > 0) categoryShort.set(c.label, (categoryShort.get(c.label) ?? 0) + 1);
    }
    for (const c of s.bySource) {
      if (c.remaining_hours > 0) sourceShort.set(c.label, (sourceShort.get(c.label) ?? 0) + 1);
    }
  }

  const topGaps = [...gaps]
    .filter((g) => g.gap_size > 0)
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 5);

  // Which activities are recommended most often across the school.
  const supabase = await createClient();
  const { data: recRows } = await supabase
    .schema('cpd')
    .from('recommendation_detail')
    .select('title')
    .limit(500);
  const recCount = new Map<string, number>();
  for (const r of (recRows ?? []) as unknown as { title: string }[]) {
    recCount.set(r.title, (recCount.get(r.title) ?? 0) + 1);
  }
  const topRecommended = [...recCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const openActions = actions.filter((a) => !['completed', 'abandoned'].includes(a.status));
  const overdueActions = actions.filter((a) => a.is_overdue);

  return (
    <Shell
      path="/compliance"
      title="Compliance"
      lead={`CPD and SQAAF position for ${year.label}, across everyone in scope.`}
    >
      <div className="mb-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Meeting the requirement">
          <p className="text-3xl font-semibold tabular-nums">
            {compliant.length}
            <span className="text-lg text-muted-foreground"> / {withTotals.length}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            teachers at or above the annual total
          </p>
        </Card>
        <Card title="At risk">
          <p className="text-3xl font-semibold tabular-nums">{atRisk.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            behind the pace the school expects by now
          </p>
        </Card>
        <Card title="Awaiting verification">
          <p className="text-3xl font-semibold tabular-nums">{awaiting.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">CPD records claimed but not credited</p>
        </Card>
        <Card title="Improvement actions open">
          <p className="text-3xl font-semibold tabular-nums">{openActions.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {overdueActions.length > 0 ? `${overdueActions.length} overdue` : 'none overdue'}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card title="CPD by teacher">
            <ScrollRegion label="CPD by teacher">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      Teacher
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Department
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Progress
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Hours
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.teacherProfileId} className="border-t align-middle">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="py-2 text-muted-foreground">{s.department ?? '—'}</td>
                      <td className="w-32 py-2">
                        {s.total && (
                          <ProgressBar
                            completed={s.total.completed_hours}
                            required={s.total.required_hours}
                            state={s.total.state}
                          />
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {s.total
                          ? `${hours(s.total.completed_hours)} / ${hours(s.total.required_hours)}`
                          : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {s.total && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASS[s.total.state]}`}
                          >
                            {STATE_LABEL[s.total.state]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card title="Missing CPD domains">
              {categoryShort.size === 0 ? (
                <p className="text-sm text-muted-foreground">Every domain is met by everyone.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {[...categoryShort.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, count]) => (
                      <li key={label} className="flex justify-between gap-3">
                        <span>{label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {count} short
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card title="Missing source-type hours">
              {sourceShort.size === 0 ? (
                <p className="text-sm text-muted-foreground">Both sides of the split are met.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {[...sourceShort.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, count]) => (
                      <li key={label} className="flex justify-between gap-3">
                        <span>{label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {count} short
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card title="CPD by department">
              <ul className="space-y-3 text-sm">
                {groupBy(staff, 'department').map(([name, agg]) => (
                  <li key={name}>
                    <div className="flex justify-between gap-3">
                      <span>{name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {hours(agg.completed)} / {hours(agg.required)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        completed={agg.completed}
                        required={agg.required}
                        state={agg.completed >= agg.required ? 'compliant' : 'on_track'}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              title="CPD by stage"
              meta={<span className="text-xs text-muted-foreground">teachers may span stages</span>}
            >
              <ul className="space-y-3 text-sm">
                {groupByStage(staff).map(([name, agg]) => (
                  <li key={name}>
                    <div className="flex justify-between gap-3">
                      <span>
                        {name}
                        <span className="text-muted-foreground"> · {agg.people}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {hours(agg.completed)} / {hours(agg.required)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        completed={agg.completed}
                        required={agg.required}
                        state={agg.completed >= agg.required ? 'compliant' : 'on_track'}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                A teacher who teaches more than one stage is counted in each, so these totals do not
                sum to the whole-school figure.
              </p>
            </Card>

            <Card title="CPD by staff category">
              <ul className="space-y-3 text-sm">
                {groupBy(staff, 'category').map(([name, agg]) => (
                  <li key={name}>
                    <div className="flex justify-between gap-3">
                      <span>{name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {hours(agg.completed)} / {hours(agg.required)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        completed={agg.completed}
                        required={agg.required}
                        state={agg.completed >= agg.required ? 'compliant' : 'on_track'}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {awaiting.length > 0 && (
            <Card title="CPD awaiting verification">
              <ul className="space-y-4">
                {awaiting.map((r) => (
                  <li key={r.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{r.title}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {hours(r.claimed_hours)} h claimed
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.teacher_name} · {r.category_name} · {r.source_type_name} ·{' '}
                      {r.activity_from}
                      {r.activity_to !== r.activity_from ? ` to ${r.activity_to}` : ''}
                      {r.activity_rule_name
                        ? ` · claimed under an activity rule (${hours(r.claimed_hours)} h fixed by the rule)`
                        : ''}
                    </p>
                    <div className="mt-3">
                      <ActionForm
                        action={verifyCpdRecord}
                        hidden={{ recordId: r.id }}
                        submitLabel="Record decision"
                      >
                        <SelectField
                          name="decision"
                          label="Decision"
                          options={[
                            { value: 'verify', label: 'Verify and credit' },
                            { value: 'return', label: 'Return for clarification' },
                            { value: 'reject', label: 'Reject' },
                          ]}
                        />
                        <TextField
                          name="creditedHours"
                          label="Hours to credit"
                          required={false}
                          placeholder={String(r.claimed_hours)}
                        />
                        <Field name="note" label="Note" required={false} rows={2} />
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card
            title="SQAAF evidence readiness"
            meta={
              <Link href="/sqaaf" className="text-xs underline underline-offset-2">
                Open SQAAF
              </Link>
            }
          >
            {!assessment ? (
              <p className="text-sm text-muted-foreground">
                No self-assessment has been opened for this year.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {readiness
                  .filter((d) => d.platform_coverage !== 'none')
                  .map((d) => (
                    <li key={d.domain_id}>
                      <div className="flex justify-between gap-3">
                        <span>
                          {d.domain_number}. {d.domain_name}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {d.standards_with_verified_evidence}/{d.standards_platform_relevant}
                        </span>
                      </div>
                      {d.platform_relevant_without_evidence > 0 && (
                        <p className="mt-0.5 text-xs text-caution-foreground">
                          {d.platform_relevant_without_evidence} standard
                          {d.platform_relevant_without_evidence === 1 ? '' : 's'} this platform
                          could evidence but has not
                          {d.standards_with_unverified_evidence_only > 0 &&
                            ` (${d.standards_with_unverified_evidence_only} mapped but unverified)`}
                        </p>
                      )}
                    </li>
                  ))}
                <li className="border-t pt-3 text-xs text-muted-foreground">
                  Domains not listed — Infrastructure, Management and Governance, Beneficiary
                  Satisfaction — are not evidenced by this platform at all, and their evidence must
                  be gathered elsewhere.
                </li>
              </ul>
            )}
          </Card>

          <Card
            title="SQAAF evidence gaps"
            meta={
              <span className="text-xs text-muted-foreground">{openSqaafGaps.length} open</span>
            }
          >
            {!assessment ? (
              <p className="text-sm text-muted-foreground">
                No self-assessment has been opened for this year.
              </p>
            ) : sqaafGaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No evidence gaps recorded. That is not the same as none existing — a gap appears
                here once somebody records it against a standard.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {sqaafGaps.map((g) => (
                  <li key={g.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{g.standard?.code ?? 'Standard'}</span>
                      {g.resolved_at && (
                        <span className="shrink-0 text-xs text-muted-foreground">resolved</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Highest competency gaps">
            {topGaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open gaps in scope.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topGaps.map((g) => (
                  <li key={g.id} className="flex justify-between gap-3">
                    <span>{g.competency_name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {g.priority_score}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Most recommended courses">
            {topRecommended.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recommendations generated yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topRecommended.map(([title, count]) => (
                  <li key={title} className="flex justify-between gap-3">
                    <span>{title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">×{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="CPD impact">
            <p className="text-sm">
              CPD is counted as hours here. Whether it changed practice is a separate question, and
              the platform answers it separately: a competency is reassessed only after application
              in practice has been evidenced and verified.
            </p>
            <Link
              href="/manager"
              className="mt-2 inline-block text-sm underline underline-offset-2"
            >
              See reassessments and verified impact
            </Link>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
