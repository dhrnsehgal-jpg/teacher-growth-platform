import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { ActionForm, Field, SelectField, LEVEL_OPTIONS } from '@/components/action-form';
import { submitSelfRating } from '@/app/actions/assessment';
import {
  getAssessableCompetencies,
  getCurrentYear,
  getRatings,
  getSessionProfile,
} from '@/lib/data/growth';

export const metadata = { title: 'Self-assessment' };

export const dynamic = 'force-dynamic';

/**
 * Teacher self-assessment.
 *
 * Self-assessment is expected and valuable; self-VERIFICATION is not, and is
 * refused by the database. What a teacher records here is one input among
 * several, shown beside the others rather than averaged into them.
 */
export default async function SelfAssessmentPage() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/self-assessment" title="Self-assessment">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const [competencies, ratings] = await Promise.all([
    getAssessableCompetencies(profile.id, year.id),
    getRatings(profile.id),
  ]);

  const mine = new Map(
    ratings.filter((r) => r.source === 'self').map((r) => [r.competency_key, r]),
  );

  const byStandard = new Map<string, typeof competencies>();
  for (const c of competencies) {
    if (!byStandard.has(c.standard_name)) byStandard.set(c.standard_name, []);
    byStandard.get(c.standard_name)!.push(c);
  }

  return (
    <Shell
      path="/self-assessment"
      title="My self-assessment"
      lead={`Rate your own practice for ${year.label}. Your rating sits beside your supervisor's and any observation — none of them is averaged away. Amending a rating keeps the earlier one on the record.`}
    >
      <div className="space-y-8">
        {[...byStandard.entries()].map(([standard, items]) => (
          <div key={standard}>
            <h2 className="mb-3 text-lg font-semibold">{standard}</h2>
            <div className="space-y-4">
              {items.map((c) => {
                const existing = mine.get(c.competency_key);
                return (
                  <Card
                    key={c.competency_id}
                    title={c.competency_name}
                    meta={
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">expected</span>
                        <LevelPill name={c.target_level_name} ordinal={c.target_ordinal} />
                      </div>
                    }
                  >
                    <p className="text-xs text-muted-foreground">{c.domain_name}</p>

                    {existing && (
                      <div className="mt-3 rounded-md border p-3 text-sm">
                        <p className="font-medium">
                          Your current rating: level {existing.level_ordinal} ({existing.level_name}
                          )
                        </p>
                        <p className="mt-1 text-muted-foreground">{existing.rationale}</p>
                      </div>
                    )}

                    <div className="mt-4">
                      <ActionForm
                        action={submitSelfRating}
                        hidden={{ competencyId: c.competency_id }}
                        submitLabel={existing ? 'Amend my rating' : 'Record my rating'}
                        variant={existing ? 'default' : 'primary'}
                      >
                        <SelectField
                          name="ordinal"
                          label="Where would you place your practice?"
                          options={LEVEL_OPTIONS}
                          defaultValue={String(
                            existing?.level_ordinal ?? Math.max(c.target_ordinal - 1, 1),
                          )}
                        />
                        <Field
                          name="rationale"
                          label="Why? What does your practice actually look like?"
                          rows={3}
                          placeholder="At least 15 characters. This is shown to your reviewer."
                        />
                      </ActionForm>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
