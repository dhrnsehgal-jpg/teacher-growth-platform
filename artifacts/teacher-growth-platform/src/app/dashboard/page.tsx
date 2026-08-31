import Link from 'next/link';

import { ComplianceRing } from '@/components/compliance-ring';
import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { SourceBadge } from '@/components/source-badge';
import { getCpdProgress } from '@/lib/data/compliance';
import { getProfessionalGoals } from '@/lib/data/teacher';
import {
  getCompetencyHistory,
  getCurrentYear,
  getGaps,
  getOwnEvidence,
  getRecentFeedback,
  getTopRecommendations,
  getLearningPlan,
  getPlanItems,
  getSessionProfile,
  getTeacherKpiSummary,
  getVerifiedCompetencies,
  nextAction,
  stageIndex,
  PLAN_STAGES,
} from '@/lib/data/growth';

export const metadata = { title: 'Dashboard' };

export const dynamic = 'force-dynamic';

const BAND_CLASS: Record<string, string> = {
  critical: 'bg-primary text-primary-foreground',
  high: 'bg-primary/15 text-primary',
  medium: 'bg-muted text-foreground',
  low: 'bg-transparent text-muted-foreground',
  no_gap: 'bg-transparent text-muted-foreground',
};

export default async function TeacherDashboard() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/dashboard" title="Dashboard">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const [gaps, verified, plan, items, kpis, history, goals, evidence, feedback] = await Promise.all(
    [
      getGaps(profile.id, year.id),
      getVerifiedCompetencies(profile.id),
      getLearningPlan(profile.id, year.id),
      getPlanItems(profile.id),
      getTeacherKpiSummary(profile.id, year.id),
      getCompetencyHistory(profile.id),
      getProfessionalGoals(profile.id, year.id),
      getOwnEvidence(profile.id, year.id),
      getRecentFeedback(profile.id, year.id),
    ],
  );

  const [recommendations, cpdProgress] = await Promise.all([
    getTopRecommendations(profile.id),
    getCpdProgress(profile.id, year.id),
  ]);
  const cpdTotal = cpdProgress.find((r) => r.dimension === 'total') ?? null;

  const openGoals = goals.filter((g) => !['achieved', 'abandoned'].includes(g.status));
  const evidenceAwaiting = evidence.filter((e) =>
    ['submitted', 'under_review', 'returned_for_clarification'].includes(e.status),
  );

  const openGaps = gaps.filter((g) => g.gap_size > 0);
  const atOrAbove = verified.filter((v) => v.verified_ordinal >= v.expected_ordinal).length;
  const improvements = history.filter((h) => h.is_reassessment);
  const activeItems = items.filter(
    (i) => !['reassessed', 'declined', 'abandoned'].includes(i.status),
  );

  // The eight questions the brief requires a teacher to be able to answer at a
  // glance, in order. They replace the four counters that used to sit here:
  // "12 open gaps" is a number, not an answer, and a teacher reading it still
  // has to work out what it means for them. Each answer is a sentence, and the
  // detail stays in the panels below rather than being pulled up into a grid.
  const topGap = openGaps[0];
  const nextItem = activeItems[0];
  const topRec = recommendations[0];

  const answers: { question: string; answer: string; href?: string }[] = [
    {
      question: 'Where am I?',
      answer: verified.length
        ? `${atOrAbove} of your ${verified.length} assessed competencies are at or above what is expected of your post.`
        : 'Nothing has been verified yet, so there is no position to report.',
      href: '/me',
    },
    {
      question: 'Where should I be?',
      answer: topGap
        ? `${topGap.competency_name} is expected at ${topGap.expected_level_name ?? 'a higher level'} for your role and stage.`
        : 'Every expectation set for your post has been met.',
      href: topGap ? `/growth/${topGap.competency_key}` : '/me',
    },
    {
      question: 'What is my gap?',
      answer: topGap
        ? `${openGaps.length} open. The largest is ${topGap.competency_name}, ${topGap.gap_size} level${topGap.gap_size === 1 ? '' : 's'} below expectation.`
        : 'No open gaps.',
      href: topGap ? `/growth/${topGap.competency_key}` : undefined,
    },
    {
      question: 'What should I do next?',
      answer: nextItem
        ? `${nextAction(nextItem).label} — ${nextAction(nextItem).owner === 'teacher' ? 'yours to do' : 'with your reviewer'}.`
        : topGap
          ? 'Choose a recommended activity against your highest priority.'
          : 'Nothing is outstanding.',
      href: '/learning-map',
    },
    {
      question: 'What CPD do I need?',
      answer: topRec
        ? `${topRec.title} is the closest match to your gaps.`
        : 'Recommendations follow an identified gap. None yet.',
      href: topRec ? `/growth/${topRec.competency_key}` : undefined,
    },
    {
      question: 'Am I compliant?',
      answer: cpdTotal
        ? `${Number(cpdTotal.completed_hours)} of ${Number(cpdTotal.required_hours)} CPD hours are credited — ${cpdTotal.state.replace(/_/g, ' ')}.`
        : 'No CPD requirement is in force for you this year.',
      href: '/cpd',
    },
    {
      question: 'Have I improved?',
      answer: improvements.length
        ? `${improvements.length} verified reassessment${improvements.length === 1 ? '' : 's'} so far. A course on its own does not move a level; verified practice does.`
        : 'No reassessment yet. One follows evidence that your development reached your teaching.',
    },
    {
      question: 'What is my next professional step?',
      answer: profile.career_level
        ? `You are at ${profile.career_level.display_name}. Progression is a professional judgement made at appraisal — this system does not calculate it.`
        : 'Your career level is not yet set. Progression is decided at appraisal, not calculated here.',
      href: '/appraisal',
    },
  ];

  return (
    <Shell
      path="/dashboard"
      title={`Welcome, ${profile.user.full_name}`}
      lead={`Your professional growth for ${year.label}. ${profile.teacher_category?.display_name ?? ''}${
        profile.department ? ` · ${profile.department.display_name}` : ''
      }`}
    >
      {/* The eight questions ------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="CPD this year">
          {cpdTotal ? (
            <>
              <ComplianceRing
                completed={Number(cpdTotal.completed_hours)}
                required={Number(cpdTotal.required_hours)}
                label="Hours credited"
              />
              <p className="mt-3 text-xs capitalize text-muted-foreground">
                {cpdTotal.state.replace(/_/g, ' ')} · {Number(cpdTotal.remaining_hours)} hours
                remaining
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No CPD requirement is in force for you this year.
            </p>
          )}
        </Card>

        <div className="min-w-0 lg:col-span-2">
          <Card
            title="Where you stand"
            meta={
              <span className="text-xs text-muted-foreground">
                the short answers · each one opens the detail
              </span>
            }
          >
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {answers.map((a) => (
                <div key={a.question}>
                  <dt className="text-xs font-medium text-muted-foreground">{a.question}</dt>
                  <dd className="mt-0.5 text-sm">
                    {a.href ? (
                      <Link href={a.href} className="underline-offset-4 hover:underline">
                        {a.answer}
                      </Link>
                    ) : (
                      a.answer
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Top gaps -------------------------------------------------------- */}
        <Card
          title="Development priorities"
          meta={
            <span className="text-xs text-muted-foreground">
              Ranked by the gap engine · every priority is explained
            </span>
          }
        >
          {openGaps.length === 0 ? (
            <EmptyState message="No open gaps. Every assessed competency is at or above its expected level." />
          ) : (
            <ul className="divide-y rounded-md border">
              {openGaps.slice(0, 5).map((g) => (
                <li key={g.id} className="p-5 transition-colors hover:bg-muted/10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/growth/${g.competency_key}`}
                        className="text-title font-semibold tracking-tight underline-offset-4 hover:underline"
                      >
                        {g.competency_name}
                      </Link>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {g.standard_name} &bull; {g.domain_name}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge
                        framework={g.source_framework}
                        alignment={g.source_alignment}
                        externalReference={g.external_reference}
                      />
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          BAND_CLASS[g.priority_band_key] ?? ''
                        }`}
                      >
                        {g.priority_label ?? g.priority_band_key}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-muted/20 p-3 text-sm border border-muted/50">
                    <span className="font-medium text-muted-foreground">Verified</span>
                    <LevelPill
                      name={g.verified_level_name ?? '—'}
                      ordinal={g.verified_ordinal ?? 0}
                    />
                    <span className="text-muted-foreground/60">→</span>
                    <span className="font-medium text-muted-foreground">Expected</span>
                    <LevelPill name={g.expected_level_name ?? '—'} ordinal={g.expected_ordinal} />
                    <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Gap of {g.gap_size}
                    </span>
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-foreground hover:text-primary transition-colors">
                      Why is this a priority?
                    </summary>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground border-l-2 border-primary/20 pl-4 ml-1">
                      {g.factors.map((f, i) => (
                        <li key={i}>
                          <span className="font-semibold text-foreground">
                            {f.factor} (+{f.points})
                          </span>{' '}
                          — {f.why}
                        </li>
                      ))}
                    </ul>
                  </details>

                  <div className="mt-5">
                    <Link
                      href={`/growth/${g.competency_key}`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      Explore development options <span aria-hidden="true">&rarr;</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Learning map summary -------------------------------------------- */}
        <Card
          title="Learning Map"
          meta={
            <Link href="/learning-map" className="text-xs underline underline-offset-4">
              Open the full map
            </Link>
          }
        >
          {items.length === 0 ? (
            <EmptyState message="Nothing in your plan yet. Choose a recommended activity from one of your priorities above." />
          ) : (
            <ul className="divide-y rounded-md border">
              {items.map((item) => {
                const next = nextAction(item);
                const idx = stageIndex(item.status);
                return (
                  <li key={item.id} className="p-5 transition-colors hover:bg-muted/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body font-semibold">{item.activity_title ?? 'Activity'}</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          <Link href={`/growth/${item.competency_key}`} className="hover:underline hover:text-foreground transition-colors">
                            {item.competency_name}
                          </Link>
                          {item.provider_name ? ` · ${item.provider_name}` : ''}
                        </p>
                      </div>
                      <span className="rounded-button border border-border/50 bg-background px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm">
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* The bar is decoration over a sentence. A `title`
                        attribute is not reliably announced and never reaches a
                        touch user, so the stage is stated in text instead. */}
                    <div
                      className="mt-4 flex flex-wrap gap-1.5"
                      role="img"
                      aria-label={`Stage ${idx + 1} of ${PLAN_STAGES.length}: ${item.status.replace(/_/g, ' ')}`}
                    >
                      {PLAN_STAGES.map((stage, i) => (
                        <span
                          key={stage}
                          aria-hidden="true"
                          className={`h-2 w-8 sm:w-12 rounded-full transition-colors ${
                            i <= idx ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4 rounded-md bg-muted/20 p-3 border border-muted/50">
                      <p className="text-sm">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">Next Step</span>
                        <br />
                        <span className="font-medium">{next.label}</span>{' '}
                        <span className="text-muted-foreground">
                          ({next.owner === 'teacher' ? 'you' : 'your reviewer'})
                        </span>
                      </p>
                      {item.due_on && (
                        <div className="text-right">
                           <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">Due</span>
                           <br />
                           <span className="text-sm font-medium">{item.due_on}</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* KPIs ------------------------------------------------------------ */}
        <Card
          title="KPI progress"
          meta={
            <span className="text-xs text-muted-foreground">
              {kpis.length} assigned · total weight {kpis.reduce((s, k) => s + Number(k.weight), 0)}
            </span>
          }
        >
          {kpis.length === 0 ? (
            <EmptyState message="No KPIs assigned for this year." />
          ) : (
            <ul className="divide-y rounded-md border">
              {kpis.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {k.category_name} · target {k.target}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {k.is_student_outcome_measure && (
                      <span className="rounded-full border bg-caution px-2 py-0.5 text-caution-foreground">
                        Student outcome
                      </span>
                    )}
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      weight {Number(k.weight)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            KPI outcomes are recorded from Stage 4. Stage 3 shows what has been agreed.
          </p>
        </Card>

        {/* Growth trend ---------------------------------------------------- */}
        <Card title="Professional growth trend">
          {history.length === 0 ? (
            <EmptyState message="No verified competency levels recorded yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.verified_at).toLocaleDateString('en-IN')}
                  </span>
                  <span className="font-medium">{h.competency_name}</span>
                  <LevelPill name={h.verified_level_name} ordinal={h.verified_ordinal} />
                  {h.is_reassessment && (
                    <span className="rounded-full border px-2 py-0.5 text-xs">Reassessment</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    verified by {h.verified_by_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {plan && (
          <p className="text-sm text-muted-foreground">
            Your development plan is <strong>{plan.status}</strong>
            {plan.approved_at
              ? ` · approved ${new Date(plan.approved_at).toLocaleDateString('en-IN')}`
              : ''}
            .
          </p>
        )}

        <Card
          title="Recommended CPD"
          meta={
            <span className="text-xs text-muted-foreground">
              deterministic ranking — open a priority for the full reasoning
            </span>
          }
        >
          {recommendations.length === 0 ? (
            <EmptyState message="No recommendations yet. They are generated once a gap is identified." />
          ) : (
            <ul className="divide-y text-sm">
              {recommendations.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/growth/${r.competency_key}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {r.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      score {r.score} · for {r.competency_name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.provider_name}
                    {r.cpd_hours ? ` · ${Number(r.cpd_hours)} CPD hours` : ''}
                    {r.delivery_method ? ` · ${r.delivery_method.replace(/_/g, ' ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="My professional goals"
          meta={
            <span className="text-xs text-muted-foreground">
              {openGoals.length} open of {goals.length}
            </span>
          }
        >
          {goals.length === 0 ? (
            <EmptyState message="No professional goals set for this year." />
          ) : (
            <ul className="divide-y text-sm">
              {goals.map((g) => (
                <li key={g.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{g.title}</span>
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">
                      {g.status.replace(/_/g, ' ')}
                      {g.target_date ? ` · due ${g.target_date}` : ''}
                    </span>
                  </div>
                  {g.description && <p className="mt-1 text-muted-foreground">{g.description}</p>}
                  {g.success_measure && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Success looks like: </span>
                      {g.success_measure}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="My evidence"
          meta={
            <span className="text-xs text-muted-foreground">
              {evidence.length} this year
              {evidenceAwaiting.length > 0 ? ` · ${evidenceAwaiting.length} with the reviewer` : ''}
            </span>
          }
        >
          {evidence.length === 0 ? (
            <EmptyState message="No evidence submitted for this year yet." />
          ) : (
            <ul className="divide-y text-sm">
              {evidence.slice(0, 6).map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{e.title}</span>
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">
                      {e.status.replace(/_/g, ' ')}
                      {e.strength ? ` · ${e.strength}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.evidence_type?.name}
                    {e.occurred_on ? ` · ${e.occurred_on}` : ''}
                  </p>
                  {e.review_note && e.status !== 'verified' && (
                    <p className="mt-1 text-xs text-caution-foreground">{e.review_note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent feedback">
          {feedback.length === 0 ? (
            <EmptyState message="No observations, evidence decisions or impact verifications recorded yet." />
          ) : (
            <ul className="divide-y text-sm">
              {feedback.map((f) => (
                <li key={f.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{f.kind}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {f.author ? `${f.author}` : ''}
                      {f.on ? ` · ${f.on}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{f.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
