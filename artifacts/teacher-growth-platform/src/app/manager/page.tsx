import Link from 'next/link';

import { ActionForm, Field, SelectField } from '@/components/action-form';
import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { decidePlanItem, reassess, verifyApplication } from '@/app/actions/growth';
import {
  getCurrentYear,
  getEvidenceAwaitingReview,
  getPendingAssessments,
  getProfileNames,
  getSessionProfile,
  getSupervisedTeachers,
  getTeamGaps,
  getTeamPlanItems,
  getUpcomingReviews,
} from '@/lib/data/growth';

export const metadata = { title: 'Manager' };

export const dynamic = 'force-dynamic';

export default async function ManagerDashboard() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/manager" title="Manager Dashboard">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const [team, items, gaps, evidence, pending, upcoming] = await Promise.all([
    getSupervisedTeachers(profile.id),
    getTeamPlanItems(),
    getTeamGaps(year.id),
    getEvidenceAwaitingReview(),
    getPendingAssessments(),
    getUpcomingReviews(year.id),
  ]);

  const teamIds = new Set(team.map((t) => t.id));
  const teamItems = items.filter((i) => teamIds.has(i.teacher_profile_id));
  const teamGaps = gaps.filter((g) => teamIds.has(g.teacher_profile_id ?? ''));

  const names = await getProfileNames([
    ...new Set([
      ...teamItems.map((i) => i.teacher_profile_id),
      ...evidence.map((e) => e.teacher_profile_id),
      ...pending.map((p) => p.teacher_profile_id),
    ]),
  ]);

  const awaitingApproval = teamItems.filter((i) => i.status === 'proposed');
  const awaitingVerification = teamItems.filter((i) => i.status === 'applied');
  const awaitingReassessment = teamItems.filter((i) => i.status === 'impact_verified');
  const inProgress = teamItems.filter((i) =>
    ['approved', 'in_progress', 'completed', 'reflected'].includes(i.status),
  );

  if (team.length === 0) {
    return (
      <Shell
        path="/manager"
        title="Manager Dashboard"
        lead="No staff are within your authorised scope."
      >
        <EmptyState message="You do not currently supervise any staff. Scope is set by your role assignment." />
      </Shell>
    );
  }

  return (
    <Shell
      path="/manager"
      title="Manager Dashboard"
      lead={`Staff within your authorised scope for ${year.label}. You see only the people your role assignment reaches.`}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Assigned teachers">
          <p className="text-2xl font-semibold">{team.length}</p>
        </Card>
        <Card title="Awaiting approval">
          <p className="text-2xl font-semibold">{awaitingApproval.length}</p>
          <p className="text-xs text-muted-foreground">development items</p>
        </Card>
        <Card title="Evidence to verify">
          <p className="text-2xl font-semibold">{evidence.length + awaitingVerification.length}</p>
          <p className="text-xs text-muted-foreground">items awaiting review</p>
        </Card>
        <Card title="Ready to reassess">
          <p className="text-2xl font-semibold">{awaitingReassessment.length}</p>
          <p className="text-xs text-muted-foreground">impact verified</p>
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        {/* Approvals -------------------------------------------------------- */}
        <Card title="Development items awaiting approval">
          {awaitingApproval.length === 0 ? (
            <EmptyState message="Nothing awaiting approval." />
          ) : (
            <ul className="space-y-4">
              {awaitingApproval.map((item) => (
                <li key={item.id} className="rounded-md border p-4">
                  <p className="font-medium">
                    {names.get(item.teacher_profile_id) ?? 'Teacher'} — {item.activity_title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.competency_name}
                    {item.provider_name ? ` · ${item.provider_name}` : ''}
                    {item.cpd_hours ? ` · ${Number(item.cpd_hours)} CPD hours` : ''}
                  </p>
                  {item.selection_rationale && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Their reason: </span>
                      {item.selection_rationale}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-6">
                    <ActionForm
                      action={decidePlanItem}
                      hidden={{ itemId: item.id, decision: 'approve' }}
                      submitLabel="Approve"
                      variant="primary"
                    >
                      <Field name="note" label="Note (optional)" rows={2} required={false} />
                    </ActionForm>
                    <ActionForm
                      action={decidePlanItem}
                      hidden={{ itemId: item.id, decision: 'decline' }}
                      submitLabel="Decline"
                    >
                      <Field
                        name="note"
                        label="Reason for declining (required)"
                        rows={2}
                        placeholder="At least 10 characters — this is shown to the teacher."
                      />
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Verification ----------------------------------------------------- */}
        <Card title="Application awaiting verification">
          {awaitingVerification.length === 0 ? (
            <EmptyState message="Nothing awaiting verification." />
          ) : (
            <ul className="space-y-4">
              {awaitingVerification.map((item) => (
                <li key={item.id} className="rounded-md border p-4">
                  <p className="font-medium">
                    {names.get(item.teacher_profile_id) ?? 'Teacher'} — {item.competency_name}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Reflection: </span>
                    <span className="text-muted-foreground">{item.reflection}</span>
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Applied: </span>
                    <span className="text-muted-foreground">{item.application_summary}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.evidence_count} evidence item(s) attached.
                  </p>

                  <div className="mt-3">
                    <ActionForm
                      action={verifyApplication}
                      hidden={{ itemId: item.id }}
                      submitLabel="Verify application"
                      variant="primary"
                    >
                      <SelectField
                        name="strength"
                        label="Evidence strength"
                        defaultValue="adequate"
                        options={[
                          { value: 'weak', label: 'Weak' },
                          { value: 'adequate', label: 'Adequate' },
                          { value: 'strong', label: 'Strong' },
                        ]}
                      />
                      <Field
                        name="note"
                        label="What did you verify?"
                        rows={2}
                        placeholder="At least 10 characters. Recorded against the evidence and the plan item."
                      />
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Reassessment ----------------------------------------------------- */}
        <Card
          title="Ready for reassessment"
          meta={
            <span className="text-xs text-muted-foreground">
              Only reachable once impact has been verified
            </span>
          }
        >
          {awaitingReassessment.length === 0 ? (
            <EmptyState message="Nothing ready for reassessment." />
          ) : (
            <ul className="space-y-4">
              {awaitingReassessment.map((item) => (
                <li key={item.id} className="rounded-md border p-4">
                  <p className="font-medium">
                    {names.get(item.teacher_profile_id) ?? 'Teacher'} — {item.competency_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Verified by {item.impact_verified_by_name}: {item.impact_verification_note}
                  </p>
                  <div className="mt-3">
                    <ActionForm
                      action={reassess}
                      hidden={{ itemId: item.id }}
                      submitLabel="Record reassessment"
                      variant="primary"
                    >
                      <SelectField
                        name="newOrdinal"
                        label="New verified level"
                        defaultValue="3"
                        options={[
                          { value: '1', label: '1 — Foundation' },
                          { value: '2', label: '2 — Developing' },
                          { value: '3', label: '3 — Proficient' },
                          { value: '4', label: '4 — Advanced' },
                          { value: '5', label: '5 — Expert / Lead' },
                        ]}
                      />
                      <Field
                        name="rationale"
                        label="Rationale for the new level"
                        placeholder="At least 20 characters. This is shown to the teacher and kept permanently."
                      />
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Team ------------------------------------------------------------- */}
        <Card title="Assigned teachers">
          <ul className="divide-y rounded-md border">
            {team.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{t.user.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.teacher_category?.display_name}
                    {t.department ? ` · ${t.department.display_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{t.employee_code}</span>
                  <Link
                    href={`/assess/${t.id}`}
                    className="rounded-md border px-2 py-1 text-xs font-medium"
                  >
                    Assess
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Priority gaps ----------------------------------------------------- */}
        <Card title="Priority gaps across your team">
          {teamGaps.length === 0 ? (
            <EmptyState message="No open gaps recorded for your team." />
          ) : (
            <ul className="divide-y rounded-md border">
              {teamGaps.slice(0, 8).map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <Link
                      href={`/growth/${g.competency_key}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {g.competency_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{g.domain_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <LevelPill
                      name={g.verified_level_name ?? '—'}
                      ordinal={g.verified_ordinal ?? 0}
                    />
                    <span className="text-xs text-muted-foreground">→ {g.expected_ordinal}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                      {g.priority_label}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Development in progress ------------------------------------------- */}
        <Card title="Development in progress">
          {inProgress.length === 0 ? (
            <EmptyState message="No development currently under way." />
          ) : (
            <ul className="divide-y rounded-md border">
              {inProgress.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {names.get(i.teacher_profile_id) ?? 'Teacher'} — {i.activity_title}
                    </p>
                    <p className="text-xs text-muted-foreground">{i.competency_name}</p>
                  </div>
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {i.status.replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Pending assessments">
          {pending.length === 0 ? (
            <EmptyState message="No open assessment cycles." />
          ) : (
            <ul className="divide-y rounded-md border">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span className="text-sm">{names.get(p.teacher_profile_id) ?? 'Teacher'}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.status.replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Upcoming reviews"
          meta={
            <span className="text-xs text-muted-foreground">
              {upcoming.filter((u) => u.overdue).length > 0
                ? `${upcoming.filter((u) => u.overdue).length} overdue`
                : 'nothing overdue'}
            </span>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState message="Nothing with a date on it is due. Assessment cycles and plan items appear here once they have one." />
          ) : (
            <ul className="divide-y text-sm">
              {upcoming.map((u) => (
                <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{u.what}</span>
                    {u.who && <span className="text-muted-foreground"> · {u.who}</span>}
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {u.kind === 'cycle' ? 'assessment cycle' : 'development plan'}
                    </span>
                  </span>
                  <span
                    className={
                      u.overdue
                        ? 'shrink-0 text-xs font-medium text-caution-foreground'
                        : 'shrink-0 text-xs text-muted-foreground'
                    }
                  >
                    {u.overdue ? 'overdue ' : 'due '}
                    {u.due}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
