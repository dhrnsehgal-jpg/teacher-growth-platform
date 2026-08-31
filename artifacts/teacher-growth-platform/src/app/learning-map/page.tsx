import Link from 'next/link';

import { ActionForm, Field, FileField, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { advanceParticipation, submitApplication, submitReflection } from '@/app/actions/growth';
import {
  getCurrentYear,
  getEvidenceFileUrl,
  getLearningPlan,
  getPlanItemEvidence,
  getPlanItems,
  getSessionProfile,
  nextAction,
  stageIndex,
  PLAN_STAGES,
  type EvidenceRow,
  type PlanItemDetail,
} from '@/lib/data/growth';

export const metadata = { title: 'Learning Map' };

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  proposed: 'Proposed',
  approved: 'Approved',
  in_progress: 'Learning',
  completed: 'Completed',
  reflected: 'Reflected',
  applied: 'Applied',
  impact_verified: 'Impact verified',
  reassessed: 'Reassessed',
};

/** The teacher-owned action for the item's current stage, if any. */
function TeacherActions({ item }: { item: PlanItemDetail }) {
  switch (item.status) {
    case 'approved':
      return (
        <ActionForm
          action={advanceParticipation}
          hidden={{ itemId: item.id, to: 'in_progress' }}
          submitLabel="Start this activity"
          variant="primary"
        />
      );

    case 'in_progress':
      return (
        <ActionForm
          action={advanceParticipation}
          hidden={{ itemId: item.id, to: 'completed' }}
          submitLabel="Mark as completed"
          variant="primary"
        >
          <Field
            name="note"
            label="Anything to note about attendance or completion? (optional)"
            rows={2}
            required={false}
          />
        </ActionForm>
      );

    case 'completed':
      return (
        <div className="space-y-3">
          <p className="rounded-md border bg-caution p-3 text-sm text-caution-foreground">
            Completing the activity has <strong>not</strong> changed your competency level, and it
            will not on its own. Record what you took from it, then apply it in practice and show
            the result.
          </p>
          <ActionForm
            action={submitReflection}
            hidden={{ itemId: item.id }}
            submitLabel="Record reflection"
            variant="primary"
          >
            <Field
              name="reflection"
              label="What did you take from this, and what will you change?"
              placeholder="At least 30 characters."
            />
          </ActionForm>
        </div>
      );

    case 'reflected':
      return (
        <ActionForm
          action={submitApplication}
          hidden={{ itemId: item.id }}
          submitLabel="Submit application and evidence"
          variant="primary"
        >
          <Field
            name="summary"
            label="How did you apply this in practice?"
            placeholder="At least 30 characters."
          />
          <TextField
            name="evidenceTitle"
            label="Evidence title"
            placeholder="e.g. Revised Class VII assessment plan"
          />
          <Field
            name="evidenceDescription"
            label="What does the evidence show? (optional)"
            rows={2}
            required={false}
          />
          <FileField
            name="file"
            label="Attach the file (optional)"
            hint="Up to 50 MB. Stored privately — only you and reviewers within your scope can open it."
          />
        </ActionForm>
      );

    case 'applied':
      return (
        <p className="text-sm text-muted-foreground">
          Submitted. Your reviewer needs to verify the application in practice before the competency
          can be reassessed.
        </p>
      );

    case 'impact_verified':
      return (
        <p className="text-sm text-muted-foreground">
          Application verified. Your reviewer can now reassess the competency.
        </p>
      );

    case 'proposed':
      return <p className="text-sm text-muted-foreground">Awaiting approval from your reviewer.</p>;

    case 'declined':
      return (
        <p className="text-sm text-caution-foreground">
          Declined: {item.approval_note ?? 'no reason recorded'}
        </p>
      );

    default:
      return null;
  }
}

export default async function LearningMapPage() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/learning-map" title="Learning Map">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const [plan, items] = await Promise.all([
    getLearningPlan(profile.id, year.id),
    getPlanItems(profile.id),
  ]);

  // Evidence, with a short-lived signed URL for anything actually uploaded.
  // The bucket is private, so this is the only way to open a file — and signing
  // happens with the caller's session, meaning the storage policies have
  // already decided whether they may.
  const evidenceByItem = new Map<
    string,
    (EvidenceRow & { url: string | null; reason: string | null })[]
  >();
  for (const item of items) {
    const rows = await getPlanItemEvidence(item.id);
    const withUrls = await Promise.all(
      rows.map(async (e) => ({
        ...e,
        // Asks the database whether the file may be served, rather than
        // deciding here. Unscanned files come back with a reason, not a URL.
        ...(await getEvidenceFileUrl(e.id)),
      })),
    );
    evidenceByItem.set(item.id, withUrls);
  }

  return (
    <Shell
      path="/learning-map"
      title="My Learning Map"
      lead={`Individual Professional Development Plan for ${year.label}. Development moves from a gap, through learning and application, to verified impact — and only then to reassessment.`}
    >
      {items.length === 0 ? (
        <EmptyState
          message="Nothing here yet. Open a development priority on your dashboard and choose a recommended activity."
          action={
            <Link
              href="/dashboard"
              className="inline-flex min-h-10 items-center justify-center rounded-button bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Explore development priorities
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {items.map((item) => {
            const next = nextAction(item);
            const idx = stageIndex(item.status);
            return (
              <Card
                key={item.id}
                title={item.activity_title ?? 'Development activity'}
                meta={
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {STAGE_LABEL[item.status] ?? item.status}
                  </span>
                }
              >
                <p className="text-sm text-muted-foreground">
                  <Link
                    href={`/growth/${item.competency_key}`}
                    className="underline underline-offset-4"
                  >
                    {item.competency_name}
                  </Link>
                  {item.provider_name ? ` · ${item.provider_name}` : ''}
                  {item.cpd_hours ? ` · ${Number(item.cpd_hours)} CPD hours` : ''}
                </p>

                {/* Milestones ------------------------------------------------ */}
                <div className="mt-6 mb-4 relative hidden sm:block">
                  <div className="absolute left-0 top-1.5 w-full h-1 bg-muted rounded-full" aria-hidden="true" />
                  <ol className="relative flex justify-between">
                    {PLAN_STAGES.map((stage, i) => {
                      const isReached = i <= idx;
                      const isCurrent = i === idx;
                      return (
                        <li key={stage} className="flex flex-col items-center w-full relative">
                          <span className="sr-only">
                            {isReached ? 'Reached: ' : 'Not yet reached: '}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`z-10 h-4 w-4 rounded-full border-[3px] border-background ${
                              isReached ? 'bg-primary' : 'bg-muted-foreground/30'
                            } ${isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                          />
                          <span
                            className={`mt-2 text-[10px] text-center uppercase tracking-wider ${
                              isReached ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
                            }`}
                          >
                            {STAGE_LABEL[stage]}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {/* Mobile Milestones fallback */}
                <ol className="mt-4 flex sm:hidden flex-wrap gap-x-1 gap-y-2">
                  {PLAN_STAGES.map((stage, i) => (
                    <li key={stage} className="flex flex-col items-start">
                      <span className="sr-only">
                        {i <= idx ? 'Reached: ' : 'Not yet reached: '}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-10 rounded-full ${
                          i <= idx ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                      <span
                        className={`mt-1 text-[10px] uppercase tracking-wider ${
                          i <= idx ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
                        }`}
                      >
                        {STAGE_LABEL[stage]}
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md bg-primary/5 p-3 border border-primary/10">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-primary">Next Step</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {next.label}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/20 p-3 border border-border/50">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Owner</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {item.owner_name ?? '—'} <span className="text-xs text-muted-foreground font-normal">({next.owner === 'teacher' ? 'you' : 'reviewer'})</span>
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/20 p-3 border border-border/50">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Due Date</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {item.due_on ?? 'Not set'}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/20 p-3 border border-border/50">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evidence</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {item.verified_evidence_count} / {item.evidence_count} verified
                      {item.evidence_count === 0 ? ' — outstanding' : ''}
                    </dd>
                  </div>
                </div>

                {/* The record so far ---------------------------------------- */}
                {(item.selection_rationale ||
                  item.reflection ||
                  item.application_summary ||
                  item.impact_verification_note) && (
                  <div className="mt-4 space-y-2 rounded-md border p-3 text-sm">
                    {item.selection_rationale && (
                      <p>
                        <span className="font-medium">Why chosen: </span>
                        <span className="text-muted-foreground">{item.selection_rationale}</span>
                      </p>
                    )}
                    {item.reflection && (
                      <p>
                        <span className="font-medium">Reflection: </span>
                        <span className="text-muted-foreground">{item.reflection}</span>
                      </p>
                    )}
                    {item.application_summary && (
                      <p>
                        <span className="font-medium">Applied: </span>
                        <span className="text-muted-foreground">{item.application_summary}</span>
                      </p>
                    )}
                    {item.impact_verification_note && (
                      <p>
                        <span className="font-medium">
                          Verified by {item.impact_verified_by_name}:{' '}
                        </span>
                        <span className="text-muted-foreground">
                          {item.impact_verification_note}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {(evidenceByItem.get(item.id) ?? []).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium">Evidence</h3>
                    <ul className="mt-2 divide-y rounded-md border text-sm">
                      {(evidenceByItem.get(item.id) ?? []).map((e) => (
                        <li
                          key={e.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{e.title}</p>
                            {e.review_note && (
                              <p className="text-xs text-muted-foreground">{e.review_note}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border px-2 py-0.5">
                              {e.status.replace(/_/g, ' ')}
                            </span>
                            {e.strength && (
                              <span className="rounded-full border px-2 py-0.5">{e.strength}</span>
                            )}
                            {e.url ? (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border px-2 py-1 font-medium underline-offset-4 hover:underline"
                              >
                                Open {e.file_name ?? 'file'}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">
                                {e.reason ?? 'no file attached'}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <TeacherActions item={item} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {plan && (
        <p className="mt-6 text-sm text-muted-foreground">
          Plan status: <strong>{plan.status}</strong>.
        </p>
      )}
    </Shell>
  );
}
