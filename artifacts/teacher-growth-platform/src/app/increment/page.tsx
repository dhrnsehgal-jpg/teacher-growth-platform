import { ActionForm, Field, SelectField } from '@/components/action-form';
import { ProgressBar } from '@/components/progress-bar';
import { Card, EmptyState, Shell } from '@/components/shell';
import {
  recomputeReadiness,
  recordApproval,
  recordIncrementRecommendation,
} from '@/app/actions/employment';
import { hasPermission } from '@/lib/data/admin';
import {
  getApprovals,
  getApprovalSteps,
  getEmploymentGate,
  getPayFrameworks,
  getRecommendation,
} from '@/lib/data/employment';
import { getCurrentYear, getSessionProfile } from '@/lib/data/growth';

export const metadata = { title: 'Increment recommendations' };

export const dynamic = 'force-dynamic';

export default async function IncrementPage() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/increment" title="Increment Readiness">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const [gate, recommendation, steps, frameworks, canRecommend] = await Promise.all([
    getEmploymentGate(),
    getRecommendation(profile.id, year.id),
    getApprovalSteps(),
    getPayFrameworks(),
    hasPermission('increment.recommend'),
  ]);

  const approvals = recommendation ? await getApprovals(recommendation.id) : [];
  const approvalByStage = new Map(approvals.map((a) => [a.stage, a]));

  return (
    <Shell
      path="/increment"
      title="Increment Readiness"
      lead="Readiness and a recommendation — never an automatic salary decision. The final decision is made by a person and recorded as one."
    >
      {!gate.enabled && (
        <div className="mb-5 rounded-lg border bg-caution p-4 text-sm text-caution-foreground">
          <p className="font-medium">{gate.serviceRuleMessage}</p>
          <p className="mt-2">{gate.fundingMessage}</p>
          <p className="mt-2 text-xs">
            The school&rsquo;s funding status is recorded as <strong>{gate.fundingStatus}</strong>.
            Readiness below is still computed, because it is a development indicator — but no
            entitlement can be recorded and no final decision taken until the status is confirmed by
            an authorised person.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {!recommendation ? (
            <Card title="Readiness">
              <EmptyState message="Readiness has not been computed for you this year." />
            </Card>
          ) : (
            <>
              <Card
                title="Increment readiness"
                meta={
                  <span className="text-xs text-muted-foreground">
                    {recommendation.engine_version}
                  </span>
                }
              >
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="text-3xl font-semibold tabular-nums">
                    {Number(recommendation.readiness_percent).toFixed(0)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Requirements complete: {recommendation.requirements_met}/
                    {recommendation.requirements_total}
                  </span>
                </div>
                <ProgressBar
                  completed={Number(recommendation.readiness_percent)}
                  required={100}
                  state={Number(recommendation.readiness_percent) >= 100 ? 'compliant' : 'at_risk'}
                />
                <p className="mt-3 rounded-md bg-caution p-2 text-xs font-medium text-caution-foreground">
                  {recommendation.disclaimer}
                </p>
              </Card>

              <Card title="Outstanding">
                {recommendation.outstanding.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Every configured requirement is met.
                  </p>
                ) : (
                  <ul className="divide-y text-sm">
                    {recommendation.outstanding.map((o) => (
                      <li key={o.requirement} className="py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">
                            {o.requirement}
                            {o.mandatory && (
                              <span className="ml-2 rounded-full bg-caution px-2 py-0.5 text-xs text-caution-foreground">
                                mandatory
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {Number(o.value)}
                            {o.threshold !== null ? ` of ${Number(o.threshold)} required` : ''}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{o.detail}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Approval chain">
                <p className="mb-3 text-xs text-muted-foreground">
                  Each stage is an independent check. One person cannot complete two of them, and no
                  teacher can decide anything about their own increment.
                </p>
                <ol className="space-y-3 text-sm">
                  {steps.map((s) => {
                    const done = approvalByStage.get(s.stage);
                    return (
                      <li
                        key={s.stage}
                        className="flex flex-wrap items-start justify-between gap-2"
                      >
                        <span>
                          <span className="tabular-nums text-muted-foreground">
                            {s.step_order}.{' '}
                          </span>
                          <span className={done ? 'font-medium' : ''}>{s.display_name}</span>
                          {s.note && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {s.note}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs capitalize text-muted-foreground">
                          {done ? `${done.decision} · ${done.decided_at.slice(0, 10)}` : 'pending'}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Card>

              {recommendation.outcome && (
                <Card title="Recommendation">
                  <p className="text-sm font-medium capitalize">
                    {recommendation.outcome.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {recommendation.outcome_rationale}
                  </p>
                </Card>
              )}
            </>
          )}

          <Card title="Pay frameworks on record">
            <ul className="divide-y text-sm">
              {frameworks.map((f) => (
                <li key={f.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{f.name}</span>
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">
                      {f.applicability.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {f.applicability_note && (
                    <p className="mt-1 text-xs text-muted-foreground">{f.applicability_note}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              This platform holds no salary figures. It records which arrangement applies and on
              whose authority — not what anyone is paid.
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          {canRecommend && recommendation && (
            <>
              <Card title="Recompute readiness">
                <ActionForm
                  action={recomputeReadiness}
                  hidden={{ teacherProfileId: profile.id }}
                  submitLabel="Recompute"
                >
                  <p className="text-xs text-muted-foreground">
                    Deterministic. Recomputing changes the figure only if the underlying evidence
                    has changed.
                  </p>
                </ActionForm>
              </Card>

              <Card title="Record a recommendation">
                <p className="mb-3 text-xs text-muted-foreground">
                  The readiness figure is evidence for a judgement. It is not the judgement, which
                  is why a rationale is required whatever the number says.
                </p>
                <ActionForm
                  action={recordIncrementRecommendation}
                  hidden={{ recommendationId: recommendation.id }}
                  submitLabel="Record recommendation"
                  variant="primary"
                >
                  <SelectField
                    name="outcome"
                    label="Outcome"
                    options={[
                      { value: 'recommended', label: 'Recommended' },
                      {
                        value: 'recommended_with_conditions',
                        label: 'Recommended with conditions',
                      },
                      { value: 'defer_pending_requirements', label: 'Defer pending requirements' },
                      { value: 'not_recommended', label: 'Not recommended' },
                    ]}
                  />
                  <Field name="rationale" label="Reasoning" />
                </ActionForm>
              </Card>

              <Card title="Record an approval decision">
                <ActionForm
                  action={recordApproval}
                  hidden={{ recommendationId: recommendation.id }}
                  submitLabel="Record decision"
                >
                  <SelectField
                    name="stage"
                    label="Stage"
                    options={steps.map((s) => ({ value: s.stage, label: s.display_name }))}
                  />
                  <SelectField
                    name="decision"
                    label="Decision"
                    options={[
                      { value: 'endorsed', label: 'Endorsed' },
                      { value: 'returned', label: 'Returned' },
                      { value: 'declined', label: 'Declined' },
                      { value: 'approved', label: 'Approved' },
                    ]}
                  />
                  <Field name="note" label="Note" required={false} rows={2} />
                </ActionForm>
              </Card>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
