import { notFound } from 'next/navigation';

import {
  ActionForm,
  CheckField,
  Field,
  SelectField,
  SourceFields,
  TextField,
} from '@/components/action-form';
import { Card, EmptyState, LevelPill, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { SourceBadge, SourceLine } from '@/components/source-badge';
import { createIndicator, createTarget, updateCompetency } from '@/app/actions/admin';
import {
  getCareerLevels,
  getProficiencyScales,
  getRoles,
  getSchoolStages,
  getSubjects,
  getTeacherCategories,
  hasPermission,
} from '@/lib/data/admin';
import { getCompetencyDetail, type TargetRow } from '@/lib/data/framework';
import { RetireForm } from './retire-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ competencyKey: string }> }) {
  const { competencyKey } = await params;
  return { title: `${competencyKey.replace(/_/g, ' ')} — framework` };
}

/** Human description of who a target row applies to. */
function targetScope(t: TargetRow): string {
  const parts: string[] = [];
  if (t.teacher_category_name) parts.push(t.teacher_category_name);
  if (t.school_stage_name) parts.push(t.school_stage_name);
  if (t.subject_name) parts.push(t.subject_name);
  if (t.career_level_name) parts.push(`${t.career_level_name} career level`);
  if (t.role_key) parts.push(t.role_key.replace(/_/g, ' '));
  if (t.requires_leadership) parts.push('posts with leadership responsibility');
  return parts.length ? parts.join(' · ') : 'Everyone (school-wide baseline)';
}

export default async function CompetencyDetailPage({
  params,
}: {
  params: Promise<{ competencyKey: string }>;
}) {
  const { competencyKey } = await params;
  const detail = await getCompetencyDetail(competencyKey);
  if (!detail) notFound();

  const { competency, indicators, descriptors, targets, evidenceTypes } = detail;

  const canManage = await hasPermission('competency.manage');
  const [categories, stages, careerLevels, subjects, roles, scales] = canManage
    ? await Promise.all([
        getTeacherCategories(),
        getSchoolStages(),
        getCareerLevels(),
        getSubjects(),
        getRoles(),
        getProficiencyScales(),
      ])
    : [[], [], [], [], [], []];

  // Targets are set against the school's operating scale, not a reference one.
  const schoolScale = scales.find((sc) => sc.key === 'school_five_point') ?? scales[0];
  const blank = { value: '', label: 'Any' };

  return (
    <Shell
      path={`/admin/framework/${competencyKey}`}
      title={competency.name}
      lead={competency.description}
    >
      <div className="mb-8 space-y-2">
        <SourceLine
          framework={competency.source_framework}
          alignment={competency.source_alignment}
          externalReference={competency.external_reference}
        />
        <p className="text-sm text-muted-foreground">
          {competency.domain.standard.name} · {competency.domain.name}
        </p>
        {competency.status === 'retired' && (
          <p className="rounded-md border bg-caution p-3 text-sm text-caution-foreground">
            Retired. {competency.retirement_reason} It remains on record and past assessments
            against it are unaffected.
          </p>
        )}
      </div>

      {competency.rationale && (
        <Card title="Why this competency exists">
          <p className="text-sm text-muted-foreground">{competency.rationale}</p>
        </Card>
      )}

      <div className="mt-6 space-y-6">
        <Card title={`Behavioural indicators (${indicators.length})`}>
          {indicators.length === 0 ? (
            <EmptyState message="No indicators defined yet." />
          ) : (
            <ul className="space-y-3">
              {indicators.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3">
                  <span className="max-w-2xl text-sm">{i.statement}</span>
                  <SourceBadge
                    framework={i.source_framework}
                    alignment={i.source_alignment}
                    externalReference={i.external_reference}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Proficiency descriptors">
          {descriptors.length === 0 ? (
            <EmptyState message="No descriptors defined yet." />
          ) : (
            <dl className="space-y-3">
              {descriptors.map((d) => (
                <div key={d.proficiency_level.key} className="flex flex-wrap gap-3">
                  <dt className="w-40 shrink-0">
                    <LevelPill
                      name={d.proficiency_level.name}
                      ordinal={d.proficiency_level.ordinal}
                    />
                  </dt>
                  <dd className="max-w-2xl text-sm text-muted-foreground">{d.descriptor}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <Card
          title="Targets"
          meta={
            <span className="text-xs text-muted-foreground">
              The most specific matching target wins
            </span>
          }
        >
          {targets.length === 0 ? (
            <EmptyState message="No targets set for this competency." />
          ) : (
            <ScrollRegion label="Expected levels by role and stage">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Applies to
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Target
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Rationale
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {targets.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-4">{targetScope(t)}</td>
                      <td className="py-2 pr-4">
                        <LevelPill name={t.level_name} ordinal={t.level_ordinal} />
                      </td>
                      <td className="py-2 text-muted-foreground">{t.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
        </Card>

        <Card title="Suggested evidence">
          {evidenceTypes.length === 0 ? (
            <EmptyState message="No evidence suggestions recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {evidenceTypes.map((e) => (
                <li key={e.evidence_type_key}>
                  <span className="font-medium">{e.evidence_type_key.replace(/_/g, ' ')}</span>
                  {e.is_required && (
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">Required</span>
                  )}
                  {e.guidance && <span className="ml-2 text-muted-foreground">— {e.guidance}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canManage && competency.status === 'active' && (
          <>
            <Card title="Add an indicator">
              <p className="mb-3 text-xs text-muted-foreground">
                An indicator is an observable behaviour, not a judgement. &ldquo;Uses formative
                assessment evidence to adapt subsequent instruction&rdquo; — not &ldquo;is a good
                teacher&rdquo;.
              </p>
              <ActionForm
                action={createIndicator}
                hidden={{ competencyId: competency.id, competencyKey: competency.key }}
                submitLabel="Add indicator"
              >
                <TextField name="key" label="Key" placeholder="adapts_from_formative_evidence" />
                <Field
                  name="statement"
                  label="Indicator statement"
                  placeholder="What would you see this teacher doing?"
                />
                <Field name="description" label="Further detail" required={false} rows={2} />
                <TextField name="weight" label="Weight" required={false} />
                <SourceFields defaultFramework={competency.source_framework} />
              </ActionForm>
            </Card>

            {schoolScale && (
              <Card title="Set an expected level">
                <p className="mb-3 text-xs text-muted-foreground">
                  Leave a dimension as &ldquo;Any&rdquo; to widen the target. Leaving them all as
                  Any sets a school-wide baseline — the most specific matching target wins.
                </p>
                <ActionForm
                  action={createTarget}
                  hidden={{ competencyId: competency.id, competencyKey: competency.key }}
                  submitLabel="Set target"
                  variant="primary"
                >
                  <SelectField
                    name="targetLevelId"
                    label="Expected level"
                    options={schoolScale.levels.map((l) => ({
                      value: l.id,
                      label: `${l.ordinal} — ${l.name}`,
                    }))}
                  />
                  <SelectField
                    name="teacherCategoryId"
                    label="Teacher category"
                    options={[blank, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
                  />
                  <SelectField
                    name="schoolStageId"
                    label="Stage"
                    options={[blank, ...stages.map((c) => ({ value: c.id, label: c.label }))]}
                  />
                  <SelectField
                    name="subjectId"
                    label="Subject"
                    options={[blank, ...subjects.map((c) => ({ value: c.id, label: c.label }))]}
                  />
                  <SelectField
                    name="careerLevelId"
                    label="Career level"
                    options={[blank, ...careerLevels.map((c) => ({ value: c.id, label: c.label }))]}
                  />
                  <SelectField
                    name="roleKey"
                    label="Role"
                    options={[blank, ...roles.map((r) => ({ value: r.key, label: r.label }))]}
                  />
                  <CheckField
                    name="requiresLeadership"
                    label="Only for posts with leadership responsibility"
                  />
                  <CheckField
                    name="isMandatory"
                    label="Mandatory"
                    hint="Mandatory competencies score higher in the gap engine."
                  />
                  <Field
                    name="rationale"
                    label="Why is this expected?"
                    placeholder="A teacher is entitled to the reasoning behind an expectation."
                  />
                </ActionForm>
              </Card>
            )}

            <Card title="Edit this competency">
              <p className="mb-3 text-xs text-muted-foreground">
                Wording only. The key, the domain and the source labels are fixed — changing a key
                breaks every reference to it, and changing a source label rewrites the claim about
                where the standard came from. Either is a retirement and a replacement.
              </p>
              <ActionForm
                action={updateCompetency}
                hidden={{ competencyId: competency.id, competencyKey: competency.key }}
                submitLabel="Save changes"
              >
                <TextField name="name" label="Name" defaultValue={competency.name} />
                <Field
                  name="description"
                  label="Description"
                  defaultValue={competency.description}
                />
                <Field
                  name="rationale"
                  label="Why this competency exists"
                  required={false}
                  rows={2}
                  defaultValue={competency.rationale ?? ''}
                />
              </ActionForm>
            </Card>

            <Card title="Retire this competency">
              <RetireForm competencyId={competency.id} competencyKey={competency.key} />
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
