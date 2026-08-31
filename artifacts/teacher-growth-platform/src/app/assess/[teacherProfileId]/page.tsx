import { notFound } from 'next/navigation';

import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { ActionForm, Field, SelectField, TextField, LEVEL_OPTIONS } from '@/components/action-form';
import {
  recordObservation,
  submitSupervisorRating,
  verifyCompetencyLevel,
} from '@/app/actions/assessment';
import { createClient } from '@/lib/supabase/server';
import {
  getAssessableCompetencies,
  getCurrentYear,
  getRatings,
  getVerifiedCompetencies,
} from '@/lib/data/growth';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Assess a teacher' };

const SOURCE_LABEL: Record<string, string> = {
  self: 'Self-assessment',
  supervisor: 'Supervisor',
  observation: 'Observation',
  moderation: 'Moderation',
};

/**
 * Supervisor assessment.
 *
 * Reachable only for staff within the reviewer's authorised scope — RLS returns
 * nothing otherwise, and the page 404s rather than showing an empty shell.
 */
export default async function AssessPage({
  params,
}: {
  params: Promise<{ teacherProfileId: string }>;
}) {
  const { teacherProfileId } = await params;
  const year = await getCurrentYear();
  if (!year) notFound();

  const supabase = await createClient();
  const { data: teacher } = await supabase
    .schema('core')
    .from('teacher_profile')
    .select(
      `id, employee_code,
       user:user_id!inner(full_name),
       department:primary_department_id(display_name),
       teacher_category:teacher_category_id(display_name)`,
    )
    .eq('id', teacherProfileId)
    .maybeSingle();

  if (!teacher) notFound();
  const t = teacher as unknown as {
    id: string;
    employee_code: string | null;
    user: { full_name: string };
    department: { display_name: string } | null;
    teacher_category: { display_name: string } | null;
  };

  const [competencies, ratings, verified] = await Promise.all([
    getAssessableCompetencies(teacherProfileId, year.id),
    getRatings(teacherProfileId),
    getVerifiedCompetencies(teacherProfileId),
  ]);

  const ratingsFor = (key: string) => ratings.filter((r) => r.competency_key === key);
  const verifiedFor = (key: string) => verified.find((v) => v.competency_key === key);

  return (
    <Shell
      path={`/assess/${teacherProfileId}`}
      title={`Assess ${t.user.full_name}`}
      lead={`${t.teacher_category?.display_name ?? ''}${
        t.department ? ` · ${t.department.display_name}` : ''
      } · ${year.label}. Each input is recorded separately. Verifying a level is a judgement you make against them, and it is kept permanently.`}
    >
      {competencies.length === 0 ? (
        <EmptyState message="No competency expectations resolve for this teacher." />
      ) : (
        <div className="space-y-6">
          {competencies.map((c) => {
            const existing = ratingsFor(c.competency_key);
            const v = verifiedFor(c.competency_key);
            const supervisorRating = existing.find((r) => r.source === 'supervisor');

            return (
              <Card
                key={c.competency_id}
                title={c.competency_name}
                meta={
                  <div className="flex flex-wrap items-center gap-2">
                    {v && (
                      <>
                        <span className="text-xs text-muted-foreground">verified</span>
                        <LevelPill name={v.verified_level_name} ordinal={v.verified_ordinal} />
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">expected</span>
                    <LevelPill name={c.target_level_name} ordinal={c.target_ordinal} />
                  </div>
                }
              >
                <p className="text-xs text-muted-foreground">
                  {c.standard_name} · {c.domain_name}
                </p>

                {/* The inputs so far ------------------------------------- */}
                {existing.length > 0 ? (
                  <ScrollRegion label="Assessments recorded" className="mt-4">
                    <table className="w-full min-w-[30rem] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th scope="col" className="py-1 pr-4 font-medium">
                            Input
                          </th>
                          <th scope="col" className="py-1 pr-4 font-medium">
                            Level
                          </th>
                          <th scope="col" className="py-1 font-medium">
                            Reasoning
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {existing.map((r) => (
                          <tr key={r.id}>
                            <td className="py-2 pr-4 align-top">
                              {SOURCE_LABEL[r.source] ?? r.source}
                              <div className="text-xs text-muted-foreground">{r.rated_by_name}</div>
                            </td>
                            <td className="py-2 pr-4 align-top">
                              <LevelPill name={r.level_name} ordinal={r.level_ordinal} />
                            </td>
                            <td className="py-2 align-top text-muted-foreground">{r.rationale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No ratings recorded yet for this competency.
                  </p>
                )}

                <div className="mt-5 grid gap-6 lg:grid-cols-2">
                  {/* Supervisor rating ---------------------------------- */}
                  <div className="rounded-md border p-4">
                    <h3 className="text-sm font-semibold">
                      {supervisorRating ? 'Amend your rating' : 'Your rating'}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Amending inserts a new rating and supersedes the old one, which stays on the
                      record.
                    </p>
                    <div className="mt-3">
                      <ActionForm
                        action={submitSupervisorRating}
                        hidden={{ teacherProfileId, competencyId: c.competency_id }}
                        submitLabel={supervisorRating ? 'Amend rating' : 'Record rating'}
                        variant={supervisorRating ? 'default' : 'primary'}
                      >
                        <SelectField
                          name="ordinal"
                          label="Level"
                          options={LEVEL_OPTIONS}
                          defaultValue={String(supervisorRating?.level_ordinal ?? c.target_ordinal)}
                        />
                        <Field
                          name="rationale"
                          label="What have you seen?"
                          rows={3}
                          placeholder="At least 15 characters. Shown to the teacher."
                        />
                      </ActionForm>
                    </div>
                  </div>

                  {/* Observation ---------------------------------------- */}
                  <div className="rounded-md border p-4">
                    <h3 className="text-sm font-semibold">Record a classroom observation</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The narrative is required: an observation without one is a number nobody can
                      question.
                    </p>
                    <div className="mt-3">
                      <ActionForm
                        action={recordObservation}
                        hidden={{ teacherProfileId, competencyId: c.competency_id }}
                        submitLabel="Record observation"
                      >
                        <TextField name="observedOn" label="Date observed (YYYY-MM-DD)" />
                        <TextField name="focus" label="Focus" required={false} />
                        <SelectField
                          name="ordinal"
                          label="Level observed"
                          options={LEVEL_OPTIONS}
                          defaultValue={String(Math.max(c.target_ordinal - 1, 1))}
                        />
                        <Field
                          name="narrative"
                          label="What did you see?"
                          rows={3}
                          placeholder="At least 20 characters."
                        />
                      </ActionForm>
                    </div>
                  </div>
                </div>

                {/* Verification ------------------------------------------ */}
                <div className="mt-5 rounded-md border p-4">
                  <h3 className="text-sm font-semibold">
                    {v ? 'Re-verify the level' : 'Verify the level'}
                  </h3>
                  {v ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Currently level {v.verified_ordinal}, verified by {v.verified_by_name}. A new
                      verification supersedes it; the existing record is kept.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      A judgement made against the inputs above, not a calculation. Requires at
                      least one recorded rating.
                    </p>
                  )}
                  <div className="mt-3">
                    <ActionForm
                      action={verifyCompetencyLevel}
                      hidden={{ teacherProfileId, competencyId: c.competency_id }}
                      submitLabel={v ? 'Record new verified level' : 'Verify level'}
                      variant="primary"
                    >
                      <SelectField
                        name="ordinal"
                        label="Verified level"
                        options={LEVEL_OPTIONS}
                        defaultValue={String(v?.verified_ordinal ?? c.target_ordinal)}
                      />
                      <SelectField
                        name="evidenceStrength"
                        label="Evidence strength"
                        defaultValue={v?.evidence_strength ?? 'none'}
                        options={[
                          { value: 'none', label: 'None' },
                          { value: 'weak', label: 'Weak' },
                          { value: 'adequate', label: 'Adequate' },
                          { value: 'strong', label: 'Strong' },
                        ]}
                      />
                      <Field
                        name="rationale"
                        label="Rationale — why this level, given the inputs?"
                        rows={3}
                        placeholder="At least 20 characters. This is what the teacher is shown."
                      />
                    </ActionForm>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
