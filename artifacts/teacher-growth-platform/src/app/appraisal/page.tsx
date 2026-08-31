import { ActionForm, Field, SelectField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { respondToAppraisal, submitRepresentation } from '@/app/actions/employment';
import {
  getGrowthScore,
  getOwnAppraisal,
  getRepresentations,
  getTeacherResponses,
} from '@/lib/data/employment';
import { getCurrentYear, getSessionProfile } from '@/lib/data/growth';

export const metadata = { title: 'Appraisal' };

export const dynamic = 'force-dynamic';

const STAGES = [
  ['self_assessment', 'Self-assessment'],
  ['competency_review', 'Competency review'],
  ['kpi_review', 'KPI review'],
  ['classroom_observation', 'Classroom observation'],
  ['evidence_review', 'Evidence review'],
  ['cpd_compliance', 'CPD compliance'],
  ['cpd_impact', 'CPD impact'],
  ['professional_goals', 'Professional goals'],
  ['supervisor_review', 'Supervisor review'],
  ['appraisal_discussion', 'Appraisal discussion'],
  ['final_recommendation', 'Final recommendation'],
  ['teacher_acknowledgement', 'Your acknowledgement'],
  ['authorised_approval', 'Authorised approval'],
  ['closed', 'Closed'],
] as const;

export default async function AppraisalPage() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/appraisal" title="My Appraisal">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const appraisal = await getOwnAppraisal(profile.id);
  if (!appraisal) {
    return (
      <Shell path="/appraisal" title="My Appraisal" lead={`Academic year ${year.label}`}>
        <EmptyState message="No appraisal has been opened for you this year." />
      </Shell>
    );
  }

  const [responses, growth, representations] = await Promise.all([
    getTeacherResponses(appraisal.id),
    getGrowthScore(appraisal.id),
    getRepresentations(appraisal.id),
  ]);

  const stageIndex = STAGES.findIndex(([k]) => k === appraisal.stage);
  const canRespond = stageIndex >= STAGES.findIndex(([k]) => k === 'final_recommendation');

  return (
    <Shell
      path="/appraisal"
      title="My Appraisal"
      lead={`${appraisal.cycle?.name ?? year.label}. You can see every input, the reasoning behind the outcome, and how to challenge it.`}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card title="Where this has reached">
            <ol className="space-y-1.5 text-sm">
              {STAGES.map(([key, label], i) => (
                <li key={key} className="flex items-center gap-2">
                  <span className="sr-only">
                    {i < stageIndex ? 'Done: ' : i === stageIndex ? 'Current step: ' : 'To come: '}
                  </span>
                  <span
                    aria-hidden="true"
                    className={
                      i < stageIndex
                        ? 'inline-block h-2 w-2 shrink-0 rounded-full bg-foreground'
                        : i === stageIndex
                          ? 'inline-block h-2 w-2 shrink-0 rounded-full bg-caution-foreground'
                          : 'inline-block h-2 w-2 shrink-0 rounded-full bg-muted'
                    }
                  />
                  <span className={i === stageIndex ? 'font-medium' : 'text-muted-foreground'}>
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {growth && (
            <Card
              title="Why this score?"
              meta={
                <span className="text-xs text-muted-foreground">
                  {growth.score.engine_version} · model v{growth.score.model_version}
                </span>
              }
            >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {Number(growth.score.total_percent).toFixed(1)}%
                </span>
                <span className="text-sm text-muted-foreground">professional growth</span>
              </div>
              <p className="mb-4 rounded-md bg-caution p-2 text-xs font-medium text-caution-foreground">
                {growth.score.disclaimer}
              </p>
              <ScrollRegion label="Appraisal components">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">
                        Component
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Weight
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Result
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Points
                      </th>
                      <th scope="col" className="pb-2 font-medium">
                        Evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {growth.components.map((c) => (
                      <tr key={c.id} className="border-t align-top">
                        <td className="py-2">{c.component_name}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {Number(c.weight_percent)}%
                        </td>
                        <td className="py-2 text-right tabular-nums">{Number(c.raw_result)}%</td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {Number(c.weighted_points)}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {c.evidence_summary}
                          <span className="mt-0.5 block">{c.basis}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            </Card>
          )}

          {appraisal.discussion_note && (
            <Card
              title="Appraisal discussion"
              meta={
                <span className="text-xs text-muted-foreground">
                  {appraisal.discussion_held_on}
                </span>
              }
            >
              <p className="text-sm">{appraisal.discussion_note}</p>
            </Card>
          )}

          {appraisal.recommendation && (
            <Card
              title="Final recommendation"
              meta={
                <span className="text-xs text-muted-foreground">
                  {appraisal.recommended_at?.slice(0, 10)}
                </span>
              }
            >
              <p className="text-sm font-medium">{appraisal.recommendation}</p>
              {appraisal.recommendation_rationale && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {appraisal.recommendation_rationale}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Once made, a recommendation is frozen. If it is later revised, both it and the
                revision stay on your file.
              </p>
            </Card>
          )}

          <Card title="Your responses">
            {responses.length === 0 ? (
              <EmptyState message="You have not responded yet." />
            ) : (
              <ul className="divide-y text-sm">
                {responses.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium capitalize">{r.status.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.responded_at.slice(0, 10)}
                      </span>
                    </div>
                    {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {representations.length > 0 && (
            <Card title="Representations">
              <ul className="space-y-4">
                {representations.map((rep) => (
                  <li key={rep.id} className="rounded-md border p-4 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium capitalize">
                        {rep.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        submitted {rep.submitted_at.slice(0, 10)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Original decision</p>
                    <p className="text-sm">{rep.original_recommendation}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Your grounds</p>
                    <p className="text-sm">{rep.grounds}</p>
                    {rep.outcome_reason && (
                      <>
                        <p className="mt-2 text-xs text-muted-foreground">Review outcome</p>
                        <p className="text-sm">{rep.outcome_reason}</p>
                      </>
                    )}
                    {rep.revised_recommendation && (
                      <>
                        <p className="mt-2 text-xs text-muted-foreground">Revised position</p>
                        <p className="text-sm">{rep.revised_recommendation}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {canRespond && (
            <Card title="Respond">
              <p className="mb-3 text-xs text-muted-foreground">
                Acknowledging is not agreeing. Every response you make stays on the file, including
                comments and requests for clarification.
              </p>
              <ActionForm
                action={respondToAppraisal}
                hidden={{ appraisalId: appraisal.id }}
                submitLabel="Record response"
                variant="primary"
              >
                <SelectField
                  name="status"
                  label="Response"
                  options={[
                    { value: 'reviewed', label: 'I have reviewed it' },
                    { value: 'acknowledged', label: 'I acknowledge it' },
                    { value: 'comments_submitted', label: 'I want to add comments' },
                    { value: 'clarification_requested', label: 'I am requesting clarification' },
                  ]}
                />
                <Field name="comment" label="Comment" required={false} rows={3} />
              </ActionForm>
            </Card>
          )}

          {appraisal.recommendation && (
            <Card title="Challenge this outcome">
              <p className="mb-3 text-xs text-muted-foreground">
                A representation is reviewed by someone independent of the person who made the
                decision. The original is never deleted.
              </p>
              <ActionForm
                action={submitRepresentation}
                hidden={{ appraisalId: appraisal.id }}
                submitLabel="Submit representation"
              >
                <Field
                  name="grounds"
                  label="Grounds"
                  placeholder="What is wrong with the outcome, and what evidence supports that?"
                />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
