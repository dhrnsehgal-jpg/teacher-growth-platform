import { notFound } from 'next/navigation';

import { ActionForm, Field } from '@/components/action-form';
import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { SourceBadge, SourceLine } from '@/components/source-badge';
import { selectCpd } from '@/app/actions/growth';
import {
  getCompetencyHistory,
  getCurrentYear,
  getGapByCompetency,
  getRatings,
  getRecommendations,
  getSessionProfile,
  getVerifiedCompetencies,
} from '@/lib/data/growth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ competencyKey: string }> }) {
  const { competencyKey } = await params;
  return { title: `${competencyKey.replace(/_/g, ' ')} — my growth` };
}

const SOURCE_LABEL: Record<string, string> = {
  self: 'Your self-assessment',
  supervisor: 'Supervisor assessment',
  observation: 'Classroom observation',
  moderation: 'Moderation',
};

export default async function CompetencyGrowthPage({
  params,
}: {
  params: Promise<{ competencyKey: string }>;
}) {
  const { competencyKey } = await params;
  const profile = await getSessionProfile();
  const year = await getCurrentYear();
  if (!profile || !year) notFound();

  const [gap, ratings, verifiedAll, history] = await Promise.all([
    getGapByCompetency(profile.id, year.id, competencyKey),
    getRatings(profile.id, competencyKey),
    getVerifiedCompetencies(profile.id),
    getCompetencyHistory(profile.id, competencyKey),
  ]);

  const verified = verifiedAll.find((v) => v.competency_key === competencyKey);
  if (!gap && !verified) notFound();

  const recommendations = gap && gap.gap_size > 0 ? await getRecommendations(gap.id) : [];
  const title = gap?.competency_name ?? verified?.competency_name ?? competencyKey;

  return (
    <Shell path={`/growth/${competencyKey}`} title={title} lead={gap?.competency_description}>
      {gap && (
        <div className="mb-6">
          <SourceLine
            framework={gap.source_framework}
            alignment={gap.source_alignment}
            externalReference={gap.external_reference}
          />
        </div>
      )}

      {/* Why is my level what it is? ---------------------------------------- */}
      <Card
        title="How your verified level was reached"
        className="mt-6"
      >
        {!verified ? (
          <EmptyState message="This competency has not yet been verified." />
        ) : (
          <>
            <ScrollRegion label="Assessment history">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <tr>
                    <th scope="col" className="pb-2 pr-4">Input</th>
                    <th scope="col" className="pb-2 pr-4">Level</th>
                    <th scope="col" className="pb-2">Reasoning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {ratings.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/10">
                      <td className="py-3 pr-4 align-top">
                        <span className="font-semibold text-foreground">{SOURCE_LABEL[r.source] ?? r.source}</span>
                        <div className="text-xs text-muted-foreground mt-0.5">{r.rated_by_name}</div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <LevelPill name={r.level_name} ordinal={r.level_ordinal} />
                      </td>
                      <td className="py-3 align-top text-muted-foreground">{r.rationale}</td>
                    </tr>
                  ))}
                  <tr className="transition-colors hover:bg-muted/10">
                    <td className="py-3 pr-4 align-top font-semibold text-foreground">Evidence</td>
                    <td className="py-3 pr-4 align-top">
                      <span className="inline-flex rounded-full border border-border/50 bg-background shadow-sm px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-foreground">
                        {verified.evidence_strength}
                      </span>
                    </td>
                    <td className="py-3 align-top text-muted-foreground">
                      {verified.evidence_count} item(s) attached and reviewed.
                    </td>
                  </tr>
                </tbody>
              </table>
            </ScrollRegion>

            <div className="mt-6 rounded-md border border-primary/20 bg-primary/5 p-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 bg-primary/40"></div>
              <p className="text-sm font-semibold text-primary">
                Verified at level {verified.verified_ordinal} by {verified.verified_by_name}
              </p>
              <p className="mt-1.5 text-sm text-foreground/90">{verified.rationale}</p>
            </div>

            <p className="mt-4 text-[11px] font-medium text-muted-foreground max-w-3xl">
              Each input is recorded separately and none is averaged into the others. The verified
              level is a judgement made by a named reviewer against these inputs.
            </p>
          </>
        )}
      </Card>

      {/* The gap ----------------------------------------------------------- */}
      {gap && (
        <div className="mt-6">
          <Card
            title="Your gap"
            meta={
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {gap.priority_label ?? gap.priority_band_key} · {gap.priority_score}/100
              </span>
            }
          >
            {gap.gap_size === 0 ? (
              <>
                <div className="mb-2 flex max-w-lg items-center gap-2 py-4">
                  <div className="flex w-1/3 flex-col items-start">
                    <span className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Verified
                    </span>
                    <LevelPill
                      name={gap.verified_level_name ?? `Level ${gap.verified_ordinal ?? 0}`}
                      ordinal={gap.verified_ordinal ?? 0}
                    />
                  </div>
                  <div className="relative mx-2 mt-4 flex-1 border-t-2 border-dashed border-primary/20">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-background px-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Expectation reached
                    </span>
                  </div>
                  <div className="flex w-1/3 flex-col items-end">
                    <span className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Expected
                    </span>
                    <LevelPill
                      name={gap.expected_level_name ?? `Level ${gap.expected_ordinal}`}
                      ordinal={gap.expected_ordinal}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  You are at or above the expected level for this competency.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 py-4 mb-2 max-w-lg">
                  <div className="flex flex-col items-start w-1/3">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Verified</span>
                    <LevelPill name={gap.verified_level_name ?? `Level ${gap.verified_ordinal ?? 0}`} ordinal={gap.verified_ordinal ?? 0} />
                  </div>
                  <div className="flex-1 border-t-2 border-dashed border-primary/20 relative mt-4 mx-2">
                     <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-[10px] font-bold text-primary uppercase tracking-wider">
                       a gap of {gap.gap_size}
                     </span>
                  </div>
                  <div className="flex flex-col items-end w-1/3">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Expected</span>
                    <LevelPill name={gap.expected_level_name ?? `Level ${gap.expected_ordinal}`} ordinal={gap.expected_ordinal} />
                  </div>
                </div>

                <h3 className="mt-4 text-sm font-semibold text-foreground">Why is this a priority?</h3>
                <ul className="mt-2 space-y-2 text-sm border-l-2 border-primary/20 pl-4 ml-1">
                  {gap.factors.map((f, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-8 shrink-0 text-right font-bold text-foreground">+{f.points}</span>
                      <span>
                        <span className="font-semibold text-foreground">{f.factor}</span>
                        <span className="text-muted-foreground"> — {f.why}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 text-[11px] font-medium text-muted-foreground max-w-3xl">
                  Calculated by {gap.engine_version} on{' '}
                  {new Date(gap.computed_at).toLocaleDateString('en-IN')}. The score is arithmetic,
                  not a judgement generated by a model.
                </p>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Recommendations --------------------------------------------------- */}
      {recommendations.length > 0 && (
        <div className="mt-6">
          <Card
            title="Recommended development"
            meta={
              <span className="text-xs text-muted-foreground">
                Ranked deterministically by {recommendations[0]?.engine_version}
              </span>
            }
          >
            <ul className="space-y-4">
              {recommendations.map((r) => (
                <li key={r.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="mr-2 text-muted-foreground">#{r.rank}</span>
                        {r.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.provider_name} · {r.cpd_hours} CPD hours ·{' '}
                        {r.delivery_method.replace(/_/g, ' ')} ·{' '}
                        {r.cost_amount && Number(r.cost_amount) > 0
                          ? `${r.cost_currency} ${Number(r.cost_amount)}`
                          : 'no cost'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SourceBadge
                        framework={r.recognition}
                        alignment={r.recognition_alignment}
                        externalReference={r.external_reference}
                      />
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        score {r.score}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>

                  <details className="mt-3" open={r.rank === 1}>
                    <summary className="cursor-pointer text-sm font-medium">
                      Why this course?
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {r.reasons.map((reason, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="w-10 shrink-0 text-right font-medium">
                            +{reason.points}
                          </span>
                          <span>
                            <span className="font-medium">{reason.factor}</span>
                            <span className="text-muted-foreground"> — {reason.why}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>

                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium">Evidence you will need to provide: </span>
                    {r.evidence_requirement}
                  </p>

                  <div className="mt-3">
                    <ActionForm
                      action={selectCpd}
                      hidden={{ gapId: r.gap_id, activityId: r.activity_id }}
                      submitLabel="Add to my Learning Map"
                      variant={r.rank === 1 ? 'primary' : 'default'}
                    >
                      <Field
                        name="rationale"
                        label="Why are you choosing this? (optional)"
                        rows={2}
                        required={false}
                        placeholder="Recorded on your plan so the choice is explainable later."
                      />
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* History ----------------------------------------------------------- */}
      <div className="mt-6">
        <Card title="Competency movement over time">
          {history.length === 0 ? (
            <EmptyState message="No verified levels recorded yet." />
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {new Date(h.verified_at).toLocaleDateString('en-IN')}
                  </span>
                  <LevelPill name={h.verified_level_name} ordinal={h.verified_ordinal} />
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    {h.is_reassessment && <strong className="text-foreground">Reassessed. </strong>}
                    {h.rationale}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </Shell>
  );
}
