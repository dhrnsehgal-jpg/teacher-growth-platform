import Link from 'next/link';

import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { getCurrentYear } from '@/lib/data/growth';
import {
  evidenceKind,
  getEvidenceGaps,
  getEvidenceMap,
  getFrameworkVersion,
  getImprovementActions,
  getRatings,
  getReadiness,
  getSelfAssessment,
  getStandards,
  getSubmissionWindow,
} from '@/lib/data/sqaaf';

export const metadata = { title: 'SQAAF readiness pack' };

export const dynamic = 'force-dynamic';

/**
 * The school's SQAAF readiness pack.
 *
 * This is the deliberate alternative to filing anything with CBSE. The platform
 * assembles what it holds — ratings with their rationales, the evidence map, the
 * gaps and the improvement plan — and a person takes it to the SQAA Portal.
 *
 * Automating a regulatory submission on a school's behalf would mean the
 * platform asserting, in the school's name, that its self-assessment is
 * complete and true. That is the school's assertion to make.
 */
export default async function ReadinessPackPage() {
  const year = await getCurrentYear();
  const version = await getFrameworkVersion();

  if (!year || !version) {
    return (
      <Shell path="/sqaaf/readiness-pack" title="SQAAF readiness pack">
        <EmptyState message="The SQAAF framework has not been loaded for this school." />
      </Shell>
    );
  }

  const assessment = await getSelfAssessment(year.id);
  if (!assessment) {
    return (
      <Shell path="/sqaaf/readiness-pack" title="SQAAF readiness pack">
        <EmptyState message="No self-assessment has been opened for this academic year." />
      </Shell>
    );
  }

  const [standards, ratings, mapped, gaps, actions, readiness, window] = await Promise.all([
    getStandards(),
    getRatings(assessment.id),
    getEvidenceMap(assessment.id),
    getEvidenceGaps(assessment.id),
    getImprovementActions(assessment.id),
    getReadiness(assessment.id),
    getSubmissionWindow(year.id),
  ]);

  const byStandard = new Map(standards.map((s) => [s.standard_id, s]));
  const mapByStandard = new Map<string, typeof mapped>();
  for (const m of mapped) {
    mapByStandard.set(m.standard_id, [...(mapByStandard.get(m.standard_id) ?? []), m]);
  }
  const verifiedMapped = mapped.filter((m) => m.is_verified);

  const totalRated = ratings.length;
  const scored = ratings.reduce((sum, r) => sum + Number(r.level?.score ?? 0), 0);
  const notCovered = readiness.filter((d) => d.platform_coverage === 'none');

  return (
    <Shell
      path="/sqaaf/readiness-pack"
      title="SQAAF readiness pack"
      lead={`${version.edition_label} · ${year.label}. Everything this platform holds for the self-assessment, assembled for a person to take to the SQAA Portal.`}
    >
      <div className="mb-5">
        <Card title="Before you file this">
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-medium">This pack is partial by design.</span> It covers{' '}
              {totalRated} of {version.total_standards} standards — the ones a teacher growth
              platform holds evidence for. The remaining standards need evidence from elsewhere in
              the school.
            </li>
            {notCovered.length > 0 && (
              <li>
                <span className="font-medium">Not covered here at all:</span>{' '}
                {notCovered.map((d) => d.domain_name).join(', ')}.
              </li>
            )}
            <li>
              <span className="font-medium">Only verified evidence is counted.</span> A mapped
              record whose own status is still draft, submitted or under review is listed with that
              status and does not count a standard as evidenced.
            </li>
            <li>
              <span className="font-medium">Nothing has been sent to CBSE.</span> Filing on the SQAA
              Portal is a person&rsquo;s act, and the platform records only that it happened.
            </li>
            {window?.verification_status !== 'verified' && (
              <li className="text-caution-foreground">
                The submission window for this year is unverified. Confirm the dates on the SQAA
                Portal before relying on any deadline.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 sm:grid-cols-3">
        <Card title="Standards rated">
          <p className="text-3xl font-semibold tabular-nums">
            {totalRated}
            <span className="text-lg text-muted-foreground"> / {version.total_standards}</span>
          </p>
        </Card>
        <Card title="Score on rated standards">
          <p className="text-3xl font-semibold tabular-nums">
            {scored}
            <span className="text-lg text-muted-foreground">
              {' '}
              / {totalRated * version.max_level_score}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Not a SQAAF score. A domain score needs every standard in the domain rated.
          </p>
        </Card>
        <Card title="Verified evidence items">
          <p className="text-3xl font-semibold tabular-nums">
            {verifiedMapped.length}
            <span className="text-lg text-muted-foreground"> / {mapped.length} mapped</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mapped.length - verifiedMapped.length > 0
              ? `${mapped.length - verifiedMapped.length} mapped but not yet verified · `
              : ''}
            {gaps.length} recorded gap{gaps.length === 1 ? '' : 's'}
          </p>
        </Card>
      </div>

      <div className="mb-5">
        <Card title="Ratings and their evidence">
          {ratings.length === 0 ? (
            <EmptyState message="No standards have been rated yet." />
          ) : (
            <ul className="divide-y">
              {ratings.map((r) => {
                const std = byStandard.get(r.standard_id);
                const evidence = mapByStandard.get(r.standard_id) ?? [];
                return (
                  <li key={r.id} className="py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {std?.standard_code} — {std?.statement}
                      </span>
                      {r.level && (
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
                          Level {r.level.level_number} · {r.level.display_name}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {std?.domain_number}. {std?.domain_name} · {std?.sub_domain_name}
                    </p>
                    <p className="mt-2 text-sm">{r.rationale}</p>
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Evidence: </span>
                      {evidence.length === 0 ? (
                        <span className="text-caution-foreground">
                          none mapped — the rating rests on the rationale alone
                        </span>
                      ) : (
                        <>
                          {evidence
                            .map(
                              (m) =>
                                `${evidenceKind(m)} [${m.evidence_status.replace(/_/g, ' ')}]${m.note ? ` (${m.note})` : ''}`,
                            )
                            .join('; ')}
                          {evidence.every((m) => !m.is_verified) && (
                            <span className="text-caution-foreground">
                              {' '}
                              — none of it verified yet
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {gaps.length > 0 && (
        <div className="mb-5">
          <Card title="Evidence gaps">
            <ul className="divide-y text-sm">
              {gaps.map((g) => {
                const std = byStandard.get(g.standard_id);
                return (
                  <li key={g.id} className="py-3">
                    <span className="font-medium">{std?.standard_code}</span>
                    <p className="mt-1">{g.description}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      <Card title="Self-improvement plan">
        {actions.length === 0 ? (
          <EmptyState message="No improvement actions recorded." />
        ) : (
          <ScrollRegion label="Self-improvement plan">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-2 font-medium">
                    Standard
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Maturity
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Aspirational
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Priority
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Area of improvement
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Proposed action
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Convenor
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Target
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id} className="border-t align-top">
                    <td className="py-2">{a.standard_code}</td>
                    <td className="py-2">{a.current_level_name ?? '—'}</td>
                    <td className="py-2">{a.aspirational_level_name ?? '—'}</td>
                    <td className="py-2 capitalize">{a.priority}</td>
                    <td className="py-2">{a.area_of_improvement}</td>
                    <td className="py-2">{a.proposed_action}</td>
                    <td className="py-2">{a.convenor_name ?? '—'}</td>
                    <td className="py-2">{a.target_date ?? '—'}</td>
                    <td className="py-2 capitalize">{a.status.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          The first seven columns are CBSE&rsquo;s Annexure F template. Target date and status are
          this platform&rsquo;s additions, so an action can be tracked rather than only listed.
        </p>
      </Card>

      <p className="mt-5 text-sm">
        <Link href="/sqaaf" className="underline underline-offset-2">
          Back to SQAAF
        </Link>
      </p>
    </Shell>
  );
}
