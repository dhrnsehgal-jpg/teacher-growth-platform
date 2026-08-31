import Link from 'next/link';

import { ActionForm, Field, SelectField, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import {
  advanceImprovementAction,
  createImprovementAction,
  rateStandard,
  recordEvidenceGap,
} from '@/app/actions/sqaaf';
import {
  COVERAGE_LABEL,
  evidenceKind,
  getEvidenceGaps,
  getEvidenceMap,
  getFrameworkVersion,
  getImprovementActions,
  getPerformanceLevels,
  getRatings,
  getReadiness,
  getSelfAssessment,
  getStandards,
  getSubmissionWindow,
} from '@/lib/data/sqaaf';
import { getCurrentYear } from '@/lib/data/growth';

export const metadata = { title: 'SQAAF' };

export const dynamic = 'force-dynamic';

const PRIORITY_CLASS: Record<string, string> = {
  high: 'bg-caution text-caution-foreground',
  medium: 'bg-muted text-foreground',
  low: 'bg-transparent text-muted-foreground',
};

export default async function SqaafPage() {
  const year = await getCurrentYear();
  const version = await getFrameworkVersion();

  if (!year || !version) {
    return (
      <Shell path="/sqaaf" title="SQAAF">
        <EmptyState message="The SQAAF framework has not been loaded for this school." />
      </Shell>
    );
  }

  const [assessment, standards, levels, window] = await Promise.all([
    getSelfAssessment(year.id),
    getStandards(),
    getPerformanceLevels(version.id),
    getSubmissionWindow(year.id),
  ]);

  const [readiness, ratings, actions, gaps, mapped] = assessment
    ? await Promise.all([
        getReadiness(assessment.id),
        getRatings(assessment.id),
        getImprovementActions(assessment.id),
        getEvidenceGaps(assessment.id),
        getEvidenceMap(assessment.id),
      ])
    : [[], [], [], [], []];

  const ratingByStandard = new Map(ratings.map((r) => [r.standard_id, r]));
  const gapByStandard = new Map(gaps.map((g) => [g.standard_id, g]));
  const mapCount = new Map<string, number>();
  const verifiedCount = new Map<string, number>();
  for (const m of mapped) {
    mapCount.set(m.standard_id, (mapCount.get(m.standard_id) ?? 0) + 1);
    if (m.is_verified)
      verifiedCount.set(m.standard_id, (verifiedCount.get(m.standard_id) ?? 0) + 1);
  }

  const relevant = standards.filter((s) => s.platform_relevant);
  const domains = [...new Map(standards.map((s) => [s.domain_number, s])).values()].sort(
    (a, b) => a.domain_number - b.domain_number,
  );

  const levelOptions = levels.map((l) => ({
    value: l.id,
    label: `${l.roman_label} — ${l.display_name}`,
  }));

  return (
    <Shell
      path="/sqaaf"
      title="SQAAF"
      lead={`${version.edition_label}. ${version.total_standards} standards across seven domains, ${version.total_marks} marks. Self-assessment for ${year.label}.`}
    >
      {!assessment && (
        <div className="mb-5">
          <EmptyState message="No self-assessment has been opened for this academic year yet." />
        </div>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card title="What this platform can evidence">
          <ul className="space-y-2 text-sm">
            {domains.map((d) => (
              <li key={d.domain_number} className="flex items-start justify-between gap-3">
                <span>
                  {d.domain_number}. {d.domain_name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {COVERAGE_LABEL[d.platform_coverage]}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Three domains are marked as not covered. That is a statement, not an omission: a teacher
            growth platform holds no evidence about buildings, governance or stakeholder
            satisfaction surveys, and pretending otherwise would produce a self-assessment the
            school could not defend.
          </p>
        </Card>

        <Card title="Submission">
          {window?.verification_status === 'verified' && window.opens_on ? (
            <p className="text-sm">
              Window: {window.opens_on} to {window.closes_on}.
            </p>
          ) : (
            <>
              <p className="text-sm">Submission window not verified for this year.</p>
              {window?.source_note && (
                <p className="mt-2 text-xs text-muted-foreground">{window.source_note}</p>
              )}
            </>
          )}
          <p className="mt-3 rounded-md bg-muted p-3 text-xs">
            This platform does not submit to CBSE. It produces a readiness pack for a person to file
            on the SQAA Portal, and records that they did.
          </p>
          <Link
            href="/sqaaf/readiness-pack"
            className="mt-3 inline-block text-sm underline underline-offset-2"
          >
            Generate readiness pack
          </Link>
        </Card>

        <Card title="The scale">
          <ul className="space-y-1.5 text-sm">
            {levels.map((l) => (
              <li key={l.id}>
                <span className="font-medium">
                  Level {l.roman_label} — {l.display_name}
                </span>
                <span className="text-muted-foreground"> ({Number(l.score)})</span>
                {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {assessment && (
        <div className="mb-5">
          <Card title="Evidence readiness by domain">
            <ScrollRegion label="Evidence readiness by domain">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      Domain
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Standards
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Rated
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      We can evidence
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Verified
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Unverified
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Outstanding
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.map((d) => (
                    <tr key={d.domain_id} className="border-t">
                      <td className="py-2">
                        {d.domain_number}. {d.domain_name}
                        {d.platform_coverage === 'none' && (
                          <span className="ml-2 text-xs text-muted-foreground">not covered</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{d.standards_total}</td>
                      <td className="py-2 text-right tabular-nums">{d.standards_rated}</td>
                      <td className="py-2 text-right tabular-nums">
                        {d.standards_platform_relevant}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {d.standards_with_verified_evidence}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {d.standards_with_unverified_evidence_only > 0
                          ? d.standards_with_unverified_evidence_only
                          : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {d.platform_relevant_without_evidence > 0
                          ? d.platform_relevant_without_evidence
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Standards this platform can evidence"
          meta={<span className="text-xs text-muted-foreground">{relevant.length} standards</span>}
        >
          <ul className="divide-y text-sm">
            {relevant.map((s) => {
              const rating = ratingByStandard.get(s.standard_id);
              const count = mapCount.get(s.standard_id) ?? 0;
              const verified = verifiedCount.get(s.standard_id) ?? 0;
              const gap = gapByStandard.get(s.standard_id);
              return (
                <li key={s.standard_id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{s.standard_code}</span>
                    {rating?.level && (
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {rating.level.display_name}
                        {rating.aspirational && ` → ${rating.aspirational.display_name}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1">{s.statement}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.domain_number}. {s.domain_name} · {s.sub_domain_name}
                  </p>
                  {s.relevance_note && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Evidence here: </span>
                      {s.relevance_note}
                    </p>
                  )}
                  <p className="mt-1 text-xs">
                    {verified > 0 ? (
                      <span className="text-muted-foreground">
                        {verified} verified item{verified === 1 ? '' : 's'}
                        {count > verified && ` · ${count - verified} not yet verified`}
                      </span>
                    ) : count > 0 ? (
                      <span className="text-caution-foreground">
                        {count} mapped, none verified yet
                      </span>
                    ) : (
                      <span className="text-caution-foreground">no evidence mapped</span>
                    )}
                    {gap && <span className="text-caution-foreground"> · gap recorded</span>}
                  </p>
                  {rating && (
                    <p className="mt-1 text-xs text-muted-foreground">{rating.rationale}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-5">
          {assessment && (
            <>
              <Card title="Rate a standard">
                <ActionForm action={rateStandard} submitLabel="Record rating" variant="primary">
                  <SelectField
                    name="standardId"
                    label="Standard"
                    options={relevant.map((s) => ({
                      value: s.standard_id,
                      label: `${s.standard_code} — ${s.statement.slice(0, 60)}…`,
                    }))}
                  />
                  <SelectField name="levelId" label="Current level" options={levelOptions} />
                  <SelectField
                    name="aspirationalLevelId"
                    label="Aspirational level"
                    options={levelOptions}
                  />
                  <SelectField
                    name="priority"
                    label="Prioritized area"
                    options={[
                      { value: 'high', label: 'High' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'low', label: 'Low' },
                    ]}
                  />
                  <Field
                    name="rationale"
                    label="Rationale"
                    placeholder="What is the evidence for this level, and what is missing for the next one?"
                  />
                </ActionForm>
              </Card>

              <Card title="Record an evidence gap">
                <ActionForm action={recordEvidenceGap} submitLabel="Record gap">
                  <SelectField
                    name="standardId"
                    label="Standard"
                    options={relevant.map((s) => ({
                      value: s.standard_id,
                      label: `${s.standard_code} — ${s.statement.slice(0, 60)}…`,
                    }))}
                  />
                  <Field name="description" label="What evidence is missing?" />
                </ActionForm>
              </Card>

              <Card title="Add an improvement action">
                <ActionForm action={createImprovementAction} submitLabel="Add to plan">
                  <SelectField
                    name="standardId"
                    label="Standard"
                    options={relevant.map((s) => ({
                      value: s.standard_id,
                      label: `${s.standard_code} — ${s.statement.slice(0, 60)}…`,
                    }))}
                  />
                  <SelectField
                    name="priority"
                    label="Priority"
                    options={[
                      { value: 'high', label: 'High' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'low', label: 'Low' },
                    ]}
                  />
                  <TextField name="areaOfImprovement" label="Area of improvement" />
                  <Field name="proposedAction" label="Proposed action" />
                  <TextField name="targetDate" label="Target date (YYYY-MM-DD)" required={false} />
                </ActionForm>
              </Card>
            </>
          )}
        </div>
      </div>

      {assessment && (
        <div className="mt-5">
          <Card
            title="Self-improvement plan"
            meta={
              <span className="text-xs text-muted-foreground">
                CBSE Annexure F columns, plus target date, evidence and review
              </span>
            }
          >
            {actions.length === 0 ? (
              <EmptyState message="No improvement actions recorded yet." />
            ) : (
              <ul className="space-y-4">
                {actions.map((a) => (
                  <li key={a.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {a.standard_code} — {a.area_of_improvement}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CLASS[a.priority]}`}
                      >
                        {a.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{a.proposed_action}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.domain_number}. {a.domain_name}
                      {a.current_level_name &&
                        ` · ${a.current_level_name}${a.aspirational_level_name ? ` → ${a.aspirational_level_name}` : ''}`}
                      {a.convenor_name && ` · convenor ${a.convenor_name}`}
                      {a.target_date && ` · due ${a.target_date}`}
                      {' · '}
                      <span className="capitalize">{a.status.replace(/_/g, ' ')}</span>
                      {a.is_overdue && <span className="text-caution-foreground"> · overdue</span>}
                    </p>
                    {a.team_note && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.team_note}</p>
                    )}
                    {!['completed', 'abandoned'].includes(a.status) && (
                      <div className="mt-3">
                        <ActionForm
                          action={advanceImprovementAction}
                          hidden={{ actionId: a.id }}
                          submitLabel="Update"
                        >
                          <SelectField
                            name="nextStatus"
                            label="Move to"
                            options={
                              a.status === 'proposed'
                                ? [
                                    { value: 'approved', label: 'Approved' },
                                    { value: 'abandoned', label: 'Abandoned' },
                                  ]
                                : a.status === 'approved'
                                  ? [
                                      { value: 'in_progress', label: 'In progress' },
                                      { value: 'abandoned', label: 'Abandoned' },
                                    ]
                                  : a.status === 'in_progress'
                                    ? [
                                        {
                                          value: 'evidence_submitted',
                                          label: 'Evidence submitted',
                                        },
                                        { value: 'abandoned', label: 'Abandoned' },
                                      ]
                                    : a.status === 'evidence_submitted'
                                      ? [
                                          { value: 'under_review', label: 'Under review' },
                                          { value: 'in_progress', label: 'Back to in progress' },
                                        ]
                                      : [
                                          { value: 'completed', label: 'Completed' },
                                          { value: 'in_progress', label: 'Back to in progress' },
                                        ]
                            }
                          />
                          <Field name="note" label="Note" required={false} rows={2} />
                        </ActionForm>
                      </div>
                    )}
                    {a.review_note && a.status === 'completed' && (
                      <p className="mt-2 text-xs text-muted-foreground">{a.review_note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {assessment && mapped.length > 0 && (
        <div className="mt-5">
          <Card title="Mapped evidence">
            <ul className="divide-y text-sm">
              {mapped.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{m.standard_code}</span>{' '}
                    <span className="text-muted-foreground">{evidenceKind(m)}</span>
                    <span
                      className={
                        m.is_verified
                          ? ' ml-2 rounded-full border px-2 py-0.5 text-xs'
                          : ' ml-2 rounded-full bg-caution px-2 py-0.5 text-xs text-caution-foreground'
                      }
                    >
                      {m.evidence_status.replace(/_/g, ' ')}
                    </span>
                  </span>
                  {m.note && <span className="text-xs text-muted-foreground">{m.note}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Each row references a record that already exists elsewhere in the platform. Nothing is
              copied, so a CPD record used here is the same record the teacher sees on their own
              page — and its status is read from that record, not stored here. Only verified
              evidence counts toward readiness.
            </p>
          </Card>
        </div>
      )}
    </Shell>
  );
}
