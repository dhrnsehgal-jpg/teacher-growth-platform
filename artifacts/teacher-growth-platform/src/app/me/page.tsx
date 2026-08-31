import Link from 'next/link';

import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { getAccessLog } from '@/lib/data/audit';
import { ProgressBar } from '@/components/progress-bar';
import { SourceBadge } from '@/components/source-badge';
import { getCpdProgress, getCpdRecords, STATE_CLASS, STATE_LABEL } from '@/lib/data/compliance';
import {
  getCurrentAcademicYear,
  getEvidenceRequirements,
  getOwnProfile,
  getProfessionalGoals,
  getResolvedTargets,
  getTeacherKpis,
  getTeachingAssignments,
} from '@/lib/data/teacher';

export const metadata = { title: 'My profile' };

export const dynamic = 'force-dynamic';

/**
 * Teacher Professional Profile.
 *
 * Stage 2 answers the first of the ten questions — "what is expected of me?" —
 * and deliberately shows NO assessment results. There is nothing to report yet,
 * and inventing a score would be worse than an empty section.
 */
export default async function MyProfilePage() {
  const profile = await getOwnProfile();
  const year = await getCurrentAcademicYear();

  if (!profile || !year) {
    return (
      <Shell path="/me" title="My Professional Profile">
        <EmptyState message="Sign in with a staff account to see your professional profile." />
      </Shell>
    );
  }

  const [
    targets,
    kpis,
    assignments,
    goals,
    evidenceRequirements,
    cpdProgress,
    cpdRecords,
    accessLog,
  ] = await Promise.all([
    getResolvedTargets(profile.id, year.id),
    getTeacherKpis(profile.id, year.id),
    getTeachingAssignments(profile.id, year.id),
    getProfessionalGoals(profile.id, year.id),
    getEvidenceRequirements(year.id),
    getCpdProgress(profile.id, year.id),
    getCpdRecords(profile.id, year.id),
    getAccessLog(profile.id),
  ]);

  const cpdTotal = cpdProgress.find((p) => p.dimension === 'total') ?? null;
  const cpdSplits = cpdProgress.filter(
    (p) => p.dimension === 'source_class' || p.dimension === 'category',
  );

  const byStandard = new Map<string, typeof targets>();
  for (const t of targets) {
    if (!byStandard.has(t.standard_name)) byStandard.set(t.standard_name, []);
    byStandard.get(t.standard_name)!.push(t);
  }

  const totalWeight = kpis.reduce((sum, k) => sum + Number(k.weight), 0);

  return (
    <Shell
      path="/me"
      title={profile.user.full_name}
      lead={`Professional profile for the ${year.label} academic year.`}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Post">
          <p className="text-sm">{profile.teacher_category?.display_name ?? 'Not recorded'}</p>
        </Card>
        <Card title="Department">
          <p className="text-sm">{profile.department?.display_name ?? 'Not recorded'}</p>
        </Card>
        <Card title="Career level">
          <p className="text-sm">{profile.career_level?.display_name ?? 'Not recorded'}</p>
        </Card>
        <Card title="Leadership responsibility">
          <p className="text-sm">{profile.has_leadership_responsibility ? 'Yes' : 'No'}</p>
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card title="Subjects, classes and stages taught">
          {assignments.length === 0 ? (
            <EmptyState message="No teaching assignments recorded for this year." />
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {assignments.map((a, i) => (
                <li key={i} className="rounded-full border px-3 py-1">
                  {[
                    a.subject?.display_name,
                    a.class_level?.display_name,
                    a.school_stage?.display_name,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="What is expected of me"
          meta={
            <span className="text-xs text-muted-foreground">
              {targets.length} competencies · resolved for your post, stage and career level
            </span>
          }
        >
          {targets.length === 0 ? (
            <EmptyState message="No competency expectations resolved. The framework may not be configured for this year." />
          ) : (
            <div className="space-y-6">
              {[...byStandard.entries()].map(([standard, items]) => (
                <div key={standard}>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">{standard}</h3>
                  <ul className="divide-y rounded-md border">
                    {items.map((t) => (
                      <li
                        key={t.competency_id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/admin/framework/${t.competency_key}`}
                            className="text-sm font-medium underline-offset-4 hover:underline"
                          >
                            {t.competency_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{t.domain_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SourceBadge
                            framework={t.source_framework}
                            alignment={t.source_alignment}
                            externalReference={t.external_reference}
                          />
                          <LevelPill name={t.target_level_name} ordinal={t.target_ordinal} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="My KPIs"
          meta={
            <span className="text-xs text-muted-foreground">
              {kpis.length} assigned · total weight {totalWeight}
            </span>
          }
        >
          {kpis.length === 0 ? (
            <EmptyState message="No KPIs assigned for this year." />
          ) : (
            <ul className="divide-y rounded-md border">
              {kpis.map((k) => (
                <li key={k.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-medium">{k.name}</span>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {k.is_student_outcome_measure && (
                        <span className="rounded-full border bg-caution px-2 py-0.5 text-caution-foreground">
                          Student outcome
                        </span>
                      )}
                      <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                        weight {Number(k.weight)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{k.description}</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      <dt className="inline font-medium">Target: </dt>
                      <dd className="inline">{k.target}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Reviewer: </dt>
                      <dd className="inline">{k.reviewer_name ?? 'Not yet named'}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Data source: </dt>
                      <dd className="inline">{k.data_source}</dd>
                    </div>
                    {k.evidence_requirement && (
                      <div>
                        <dt className="inline font-medium">Evidence: </dt>
                        <dd className="inline">{k.evidence_requirement}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="My professional goals">
          {goals.length === 0 ? (
            <EmptyState message="No goals set for this year." />
          ) : (
            <ul className="divide-y rounded-md border">
              {goals.map((g) => (
                <li key={g.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-medium">{g.title}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {g.status}
                    </span>
                  </div>
                  {g.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                  )}
                  {g.success_measure && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium">Success measure: </span>
                      {g.success_measure}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Evidence requirements">
          {evidenceRequirements.length === 0 ? (
            <EmptyState message="No evidence requirements configured for this year. Evidence may still be submitted voluntarily." />
          ) : (
            <ul className="space-y-2 text-sm">
              {evidenceRequirements.map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{r.evidence_type?.name}</span>
                  <span className="text-muted-foreground"> — at least {r.minimum_count}</span>
                  {r.description && (
                    <span className="text-muted-foreground"> · {r.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Continuous professional development"
          meta={
            cpdTotal && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_CLASS[cpdTotal.state]}`}
              >
                {STATE_LABEL[cpdTotal.state]}
              </span>
            )
          }
        >
          {!cpdTotal ? (
            <EmptyState message="No CPD requirement is configured for this academic year." />
          ) : (
            <>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">
                  {Number(cpdTotal.completed_hours)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  / {Number(cpdTotal.required_hours)} hours
                </span>
              </div>
              <ProgressBar
                completed={cpdTotal.completed_hours}
                required={cpdTotal.required_hours}
                state={cpdTotal.state}
              />
              <ul className="mt-3 space-y-1 text-sm">
                {cpdSplits.map((row) => (
                  <li key={row.item_key} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {Number(row.completed_hours)} / {Number(row.required_hours)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="mt-5 text-sm font-medium">Training record</h3>
          {cpdRecords.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing recorded for this year yet.
            </p>
          ) : (
            <ScrollRegion label="Service record" className="mt-2">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      Programme
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Provider
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Dates
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Domain
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Source
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Hours
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Certificate
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Approval
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cpdRecords.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="py-2">{r.title}</td>
                      <td className="py-2 text-muted-foreground">{r.provider_name ?? '—'}</td>
                      <td className="py-2 text-muted-foreground">
                        {r.activity_from}
                        {r.activity_to !== r.activity_from ? ` – ${r.activity_to}` : ''}
                      </td>
                      <td className="py-2 text-muted-foreground">{r.category_name}</td>
                      <td className="py-2 text-muted-foreground">
                        {r.source_type_name}
                        {!r.counts_toward_requirement && (
                          <span className="block text-xs">not counted toward CBSE</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.status === 'verified'
                          ? Number(r.credited_hours ?? 0)
                          : `${Number(r.claimed_hours)} claimed`}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {r.certificate_evidence_id ? 'On file' : '—'}
                      </td>
                      <td className="py-2 capitalize text-muted-foreground">
                        {r.status.replace(/_/g, ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            This is the service record of professional development: what was attended, from whom,
            when, for how long, against which CBSE domain, and who approved it.{' '}
            <Link href="/cpd" className="underline underline-offset-2">
              Record CPD or see the full position
            </Link>
            .
          </p>
        </Card>

        {/* Who has looked at this teacher's file ------------------------- */}
        <Card
          title="Who has opened your record"
          meta={
            <span className="text-xs text-muted-foreground">
              {accessLog.length === 0 ? 'nobody yet' : `${accessLog.length} recorded`}
            </span>
          }
        >
          {accessLog.length === 0 ? (
            <EmptyState message="Nobody else has opened your pay or appraisal record." />
          ) : (
            <ul className="divide-y text-sm">
              {accessLog.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <span>
                    <span className="font-medium">{a.actor_name ?? 'A member of staff'}</span>{' '}
                    opened your {a.record_type.replace(/_/g, ' ')}
                    {a.purpose ? ` — ${a.purpose.replace(/_/g, ' ')}` : ''}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(a.occurred_at).toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Opening your own record is not logged — it is not an access worth investigating, and
            logging it would bury the ones that are. This list is therefore always other people.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
