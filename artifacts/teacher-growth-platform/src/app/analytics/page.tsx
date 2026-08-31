import { ActionForm, Field, SelectField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { createCohortPlan } from '@/app/actions/analytics';
import {
  getActivitiesFor,
  getCareerPipeline,
  getCluster,
  getDevelopmentInvestment,
  getHeatmap,
  getKpiTrend,
  getProgrammeImpact,
  getRecommendationDistribution,
  getSchoolSummary,
  getSqaafReadiness,
  getTrainingNeeds,
  type HeatmapRow,
} from '@/lib/data/analytics';
import { getCurrentYear } from '@/lib/data/growth';

export const metadata = { title: 'Analytics' };

export const dynamic = 'force-dynamic';

/** The five-point scale rendered as tone, not colour alone. */
function cell(row: HeatmapRow | undefined) {
  if (!row) return { text: '·', className: 'text-muted-foreground', label: 'not assessed' };
  if (row.meets_expectation) {
    return {
      text: String(row.verified_ordinal),
      className: 'bg-foreground text-background',
      label: `${row.verified_level}, at or above the expected ${row.expected_level}`,
    };
  }
  if (row.gap_size >= 2) {
    return {
      text: String(row.verified_ordinal),
      className: 'bg-caution text-caution-foreground font-semibold',
      label: `${row.verified_level}, ${row.gap_size} levels below the expected ${row.expected_level}`,
    };
  }
  return {
    text: String(row.verified_ordinal),
    className: 'bg-muted text-foreground',
    label: `${row.verified_level}, one level below the expected ${row.expected_level}`,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    department?: string;
    category?: string;
    stage?: string;
    subject?: string;
    level?: string;
    manager?: string;
    competency?: string;
  }>;
}) {
  const params = await searchParams;
  const year = await getCurrentYear();

  if (!year) {
    return (
      <Shell path="/analytics" title="Leadership Analytics">
        <EmptyState message="No academic year is current." />
      </Shell>
    );
  }

  const [rows, allRows, needs, impact, summary, kpiTrend, investment, pipeline, increments, sqaaf] =
    await Promise.all([
      getHeatmap(year.id, {
        department: params.department,
        teacherCategory: params.category,
        careerLevel: params.level,
        schoolStage: params.stage,
        subject: params.subject,
        manager: params.manager,
      }),
      // Unfiltered, so the filter options stay complete rather than collapsing
      // to whatever the current selection left behind.
      getHeatmap(year.id),
      getTrainingNeeds(year.id),
      getProgrammeImpact(),
      getSchoolSummary(year.id),
      getKpiTrend(),
      getDevelopmentInvestment(year.id),
      getCareerPipeline(),
      getRecommendationDistribution(year.id),
      getSqaafReadiness(year.id),
    ]);

  if (rows.length === 0) {
    return (
      <Shell path="/analytics" title="Leadership Analytics">
        <EmptyState message="No assessed competencies are visible to this account." />
      </Shell>
    );
  }

  // Matrix assembly. Teachers down, competencies across.
  const teachers = [...new Map(rows.map((r) => [r.teacher_profile_id, r])).values()].sort((a, b) =>
    a.teacher_name.localeCompare(b.teacher_name),
  );
  const competencies = [...new Map(rows.map((r) => [r.competency_key, r])).values()].sort((a, b) =>
    a.competency_name.localeCompare(b.competency_name),
  );
  const at = new Map(rows.map((r) => [`${r.teacher_profile_id}|${r.competency_key}`, r]));

  /** Distinct options for a scalar dimension, from the unfiltered rows. */
  function optionsOf(key: keyof HeatmapRow, labelKey: keyof HeatmapRow) {
    const seen = new Map<string, string>();
    for (const r of allRows) {
      const value = r[key];
      if (typeof value === 'string' && value) {
        seen.set(value, (r[labelKey] as string | null) ?? value);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  /** The same, for the array dimensions — stage, subject, manager. */
  function arrayOptionsOf(keys: keyof HeatmapRow, labels: keyof HeatmapRow) {
    const seen = new Map<string, string>();
    for (const r of allRows) {
      const ks = (r[keys] ?? []) as string[];
      const ls = (r[labels] ?? []) as string[];
      ks.forEach((k, i) => seen.set(k, ls[i] ?? k));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  // The six dimensions the brief names.
  const FILTERS: { name: string; label: string; selected?: string; options: [string, string][] }[] =
    [
      {
        name: 'department',
        label: 'Department',
        selected: params.department,
        options: optionsOf('department_key', 'department'),
      },
      {
        name: 'stage',
        label: 'Stage',
        selected: params.stage,
        options: arrayOptionsOf('school_stage_keys', 'school_stages'),
      },
      {
        name: 'subject',
        label: 'Subject',
        selected: params.subject,
        options: arrayOptionsOf('subject_keys', 'subjects'),
      },
      {
        name: 'category',
        label: 'Teacher category',
        selected: params.category,
        options: optionsOf('teacher_category_key', 'teacher_category'),
      },
      {
        name: 'level',
        label: 'Career level',
        selected: params.level,
        options: optionsOf('career_level_key', 'career_level'),
      },
      {
        name: 'manager',
        label: 'Manager',
        selected: params.manager,
        options: arrayOptionsOf('manager_user_ids', 'managers'),
      },
    ];

  const selectedNeed = params.competency
    ? needs.find((n) => n.competency_key === params.competency)
    : undefined;
  const [cluster, activities] = params.competency
    ? await Promise.all([
        getCluster(year.id, params.competency),
        getActivitiesFor(params.competency),
      ])
    : [[], []];

  return (
    <Shell
      path="/analytics"
      title="Leadership Analytics"
      lead={`Where development is needed across the school in ${year.label}. Aggregated by cohort — this is not a ranking of teachers.`}
    >
      <div className="mb-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Meeting expectation">
          <p className="text-3xl font-semibold tabular-nums">
            {summary.meetingExpectation}
            <span className="text-lg text-muted-foreground"> / {summary.assessedCompetencies}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            assessed competencies across {summary.staff} staff
          </p>
        </Card>
        <Card title="Open gaps">
          <p className="text-3xl font-semibold tabular-nums">{summary.openGaps}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.highOrCritical} high or critical
          </p>
        </Card>
        <Card title="Verified improvement">
          <p className="text-3xl font-semibold tabular-nums">{summary.reassessments}</p>
          <p className="mt-1 text-xs text-muted-foreground">reassessments after evidenced impact</p>
        </Card>
        <Card title="Training needs identified">
          <p className="text-3xl font-semibold tabular-nums">{needs.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">cohort-level development priorities</p>
        </Card>
      </div>

      <div className="mb-5">
        <Card
          title="Training needs analysis"
          meta={
            <span className="text-xs text-muted-foreground">
              groups of 3+ where 40% or more share a gap
            </span>
          }
        >
          {needs.length === 0 ? (
            <EmptyState message="No cohort-level need meets the threshold. Individual gaps are on the heatmap below." />
          ) : (
            <ul className="divide-y text-sm">
              {needs.slice(0, 8).map((n) => (
                <li key={`${n.competency_key}-${n.stage}-${n.department}`} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-3xl">{n.statement}</p>
                    <a
                      href={`/analytics?competency=${n.competency_key}`}
                      className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium underline-offset-4 hover:underline"
                    >
                      Build cohort plan
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.high_or_critical} of them high or critical
                    {n.avg_priority ? ` · average priority ${Number(n.avg_priority)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Each statement is assembled from the counts beside it, so it cannot assert anything the
            data does not support. The share is against teachers assessed on that competency, not
            against all staff — a different and larger claim.
          </p>
        </Card>
      </div>

      {selectedNeed && (
        <div className="mb-5">
          <Card
            title={`Cohort plan — ${selectedNeed.competency_name}`}
            meta={
              <a href="/analytics" className="text-xs underline underline-offset-2">
                Clear
              </a>
            }
          >
            <p className="text-sm">{selectedNeed.statement}</p>

            <h3 className="mt-4 text-sm font-medium">The cohort ({cluster.length})</h3>
            <ul className="mt-1 flex flex-wrap gap-2 text-xs">
              {cluster.map((c) => (
                <li key={c.teacher_profile_id} className="rounded-full border px-2 py-0.5">
                  {c.teacher_name}
                  <span className="text-muted-foreground"> · gap {c.gap_size}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-4 text-sm font-medium">Relevant CPD</h3>
            {activities.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No catalogue activity is mapped to this competency yet.
              </p>
            ) : (
              <div className="mt-2 max-w-xl">
                <ActionForm
                  action={createCohortPlan}
                  hidden={{ competencyKey: selectedNeed.competency_key }}
                  submitLabel={`Add to ${cluster.length} learning plans`}
                  variant="primary"
                >
                  <SelectField
                    name="activityId"
                    label="Activity"
                    options={activities.map((a) => ({
                      value: a.id,
                      label: `${a.title} — ${a.provider_name}${a.cpd_hours ? ` (${Number(a.cpd_hours)} h)` : ''}`,
                    }))}
                  />
                  <Field
                    name="rationale"
                    label="Why this cohort needs this"
                    rows={2}
                    placeholder="Copied onto every teacher's plan — they are entitled to the reasoning."
                  />
                </ActionForm>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Each item is created as <em>proposed</em> and still needs the teacher&rsquo;s own
              manager to approve it. Cohort planning changes who gets offered what; it does not
              change what counts as improvement.
            </p>
          </Card>
        </div>
      )}

      <div className="mb-5">
        <Card
          title="Competency heatmap"
          meta={
            <span className="text-xs text-muted-foreground">
              {teachers.length} staff · {competencies.length} competencies
            </span>
          }
        >
          {/* A form rather than links: with six dimensions the filters have to
              combine, and a link that replaces the whole query string can only
              ever apply one at a time. */}
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
            {FILTERS.map((f) => (
              <div key={f.name}>
                <label htmlFor={`filter-${f.name}`} className="block text-xs font-medium">
                  {f.label}
                </label>
                <select
                  id={`filter-${f.name}`}
                  name={f.name}
                  defaultValue={f.selected ?? ''}
                  className="mt-1 rounded-md border border-input bg-transparent p-1.5 text-sm"
                >
                  <option value="">All</option>
                  {f.options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="submit" className="rounded-md border px-3 py-1.5 text-sm font-medium">
              Apply
            </button>
            <a href="/analytics" className="py-1.5 text-sm underline underline-offset-4">
              Clear
            </a>
          </form>

          <ScrollRegion label="Competency heatmap">
            <table className="w-full text-xs">
              <caption className="sr-only">
                Verified proficiency level for each teacher against each competency. Cells show the
                level reached; the accessible description states how it compares with expectation.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 bg-background py-2 pr-3 text-left font-medium"
                  >
                    Teacher
                  </th>
                  {competencies.map((c) => (
                    <th
                      key={c.competency_key}
                      scope="col"
                      className="px-1 py-2 text-left align-bottom font-medium"
                    >
                      <span className="block max-w-[7rem] leading-tight">{c.competency_name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.teacher_profile_id} className="border-t">
                    <th
                      scope="row"
                      className="sticky left-0 whitespace-nowrap bg-background py-1.5 pr-3 text-left font-normal"
                    >
                      {t.teacher_name}
                      <span className="block text-muted-foreground">{t.department}</span>
                    </th>
                    {competencies.map((c) => {
                      const v = cell(at.get(`${t.teacher_profile_id}|${c.competency_key}`));
                      return (
                        <td key={c.competency_key} className="px-1 py-1.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded ${v.className}`}
                            title={`${t.teacher_name} — ${c.competency_name}: ${v.label}`}
                          >
                            <span aria-hidden="true">{v.text}</span>
                            <span className="sr-only">
                              {t.teacher_name}, {c.competency_name}: {v.label}
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <p className="mt-3 text-xs text-muted-foreground">
            The number is the verified level. Filled means at or above expectation; shaded means one
            level below; highlighted means two or more. Every cell carries a written description for
            screen readers, so the meaning does not rest on colour.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="CPD associated with verified improvement">
          {impact.length === 0 ? (
            <EmptyState message="No CPD activity has been selected yet." />
          ) : (
            <ScrollRegion label="CPD associated with verified improvement">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      Programme
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Selected
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Applied
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Impact verified
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {impact.map((p) => (
                    <tr key={p.activity_id} className="border-t">
                      <td className="py-2">
                        {p.activity_title}
                        <span className="block text-xs text-muted-foreground">
                          {p.provider_name}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.times_selected}</td>
                      <td className="py-2 text-right tabular-nums">{p.times_applied}</td>
                      <td className="py-2 text-right tabular-nums">{p.times_impact_verified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
          <p className="mt-3 rounded-md bg-muted p-3 text-xs">
            <span className="font-medium">This is association, not cause.</span> A teacher who
            improved after a course also taught a full year, was observed, read, and talked to
            colleagues. These counts cannot separate those, and no figure here should be read as a
            programme <em>producing</em> improvement. Attendance is shown separately from
            application precisely because completing a course demonstrates nothing on its own.
          </p>
        </Card>

        <div className="space-y-5">
          <Card title="Teachers with the most high-priority gaps">
            {summary.needingSupport.length === 0 ? (
              <p className="text-sm text-muted-foreground">No high-priority gaps in scope.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {summary.needingSupport.map((t) => (
                  <li key={t.teacher_profile_id} className="flex justify-between gap-3">
                    <span>{t.teacher_name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t.high} high or critical
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              A statement about where support should go, not about who is good at their job. It is
              visible only to people who can already see these teachers&rsquo; records.
            </p>
          </Card>

          <Card title="Verified improvement this year">
            {summary.strongGrowth.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reassessments recorded yet. A reassessment follows evidenced impact, so it takes
                most of a cycle to appear.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {summary.strongGrowth.map((t) => (
                  <li key={t.teacher_profile_id} className="flex justify-between gap-3">
                    <span>{t.teacher_name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t.reassessments} reassessed
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* The remaining items the analytics brief enumerates ---------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="What the school measures"
          meta={<span className="text-xs text-muted-foreground">KPI coverage and weighting</span>}
        >
          {kpiTrend.length === 0 ? (
            <EmptyState message="No KPIs are assigned for any year." />
          ) : (
            <ScrollRegion label="KPI coverage by category">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">
                  KPI coverage and weighting by category and year, with how much weight rests on
                  student-outcome measures.
                </caption>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="pb-2 font-medium">
                      Year
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Category
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      KPIs
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Teachers
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Student-outcome weight
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {kpiTrend.map((k) => (
                    <tr key={`${k.academic_year}-${k.category_name}`}>
                      <td className="py-2 text-muted-foreground">{k.academic_year}</td>
                      <td className="py-2">{k.category_name}</td>
                      <td className="py-2 text-right tabular-nums">{k.kpis_assigned}</td>
                      <td className="py-2 text-right tabular-nums">{k.teachers_covered}</td>
                      <td className="py-2 text-right tabular-nums">
                        {Number(k.student_outcome_weight ?? 0)} of {Number(k.total_weight ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            No achievement figure is shown because the platform stores none. The last column is the
            one to watch: student examination outcomes must never be the sole determinant of teacher
            effectiveness, and this is where that would start to happen.
          </p>
        </Card>

        <Card
          title="Development investment"
          meta={
            <span className="text-xs text-muted-foreground">planned · completed · verified</span>
          }
        >
          {investment.length === 0 ? (
            <EmptyState message="No learning plans yet this year." />
          ) : (
            <ScrollRegion label="Development investment by department">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">
                  Development hours planned, completed, and reaching verified impact, by department.
                </caption>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="pb-2 font-medium">
                      Department
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Staff
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Hours planned
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Completed
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Verified impact
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {investment.map((d) => (
                    <tr key={d.department}>
                      <td className="py-2">{d.department}</td>
                      <td className="py-2 text-right tabular-nums">{d.teachers_with_a_plan}</td>
                      <td className="py-2 text-right tabular-nums">{Number(d.hours_planned)}</td>
                      <td className="py-2 text-right tabular-nums">{Number(d.hours_completed)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {d.items_reaching_verified_impact} of {d.items_planned}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Hours planned is an intention and hours completed is still only attendance. The last
            column is the return: development that reached practice and was verified there.
          </p>
        </Card>

        <Card
          title="Career progression pipeline"
          meta={<span className="text-xs text-muted-foreground">headcount by level</span>}
        >
          {pipeline.length === 0 ? (
            <EmptyState message="No career levels are recorded against staff." />
          ) : (
            <ul className="space-y-2 text-sm">
              {pipeline.map((c) => (
                <li key={c.career_level} className="flex items-center gap-3">
                  <span className="w-40 shrink-0">{c.career_level}</span>
                  <span
                    className="h-2 rounded-full bg-foreground"
                    style={{
                      width: `${Math.max(4, (c.teachers / Math.max(...pipeline.map((x) => x.teachers))) * 60)}%`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.teachers} {c.teachers === 1 ? 'teacher' : 'teachers'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            A distribution, not a queue. Nothing here implies anyone is due to move: progression is
            a judgement made at appraisal, and this platform does not calculate it.
          </p>
        </Card>

        <Card
          title="Increment recommendations"
          meta={<span className="text-xs text-muted-foreground">distribution by outcome</span>}
        >
          {increments.length === 0 ? (
            <EmptyState message="No increment recommendations are visible to this account. Reading them needs a separate permission from appraisal." />
          ) : (
            <ul className="space-y-2 text-sm">
              {increments.map((r) => (
                <li key={r.outcome ?? 'undecided'} className="flex flex-wrap justify-between gap-2">
                  <span className="capitalize">
                    {r.outcome?.replace(/_/g, ' ') ?? 'No outcome recorded yet'}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.recommendations}
                    {r.proposing_withholding > 0
                      ? ` · ${r.proposing_withholding} proposing withholding`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Counts only — no teacher is named here. A recommendation cannot withhold an entitlement
            unless a verified rule expressly permits it, and the employment gates remain closed.
          </p>
        </Card>

        <div className="lg:col-span-2">
          <Card
            title="SQAAF readiness"
            meta={<span className="text-xs text-muted-foreground">by domain, this year</span>}
          >
            {sqaaf.length === 0 ? (
              <EmptyState message="No SQAAF self-assessment exists for this year." />
            ) : (
              <ScrollRegion label="SQAAF readiness by domain">
                <table className="w-full min-w-[34rem] text-sm">
                  <caption className="sr-only">
                    SQAAF domains with how many platform-relevant standards carry verified evidence
                    and how many carry none.
                  </caption>
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th scope="col" className="pb-2 font-medium">
                        Domain
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Platform-relevant
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Verified evidence
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        No evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sqaaf.map((d) => (
                      <tr key={d.domain_number}>
                        <td className="py-2">
                          {d.domain_number}. {d.domain_name}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {d.standards_platform_relevant}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {d.standards_with_verified_evidence}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {d.platform_relevant_without_evidence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              &ldquo;Platform-relevant&rdquo; is the honest denominator: most SQAAF standards are
              about buildings, governance and student outcomes, which this platform holds nothing
              about. It reports readiness for the standards it can evidence and says nothing about
              the rest. The SQAAF requirements themselves are verified but not enforced — the
              school&rsquo;s CBSE affiliation status is unverified.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
