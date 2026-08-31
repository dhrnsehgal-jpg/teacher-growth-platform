import { ActionForm, Field, SelectField, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { ScrollRegion } from '@/components/scroll-region';
import { createEvidenceRequirement } from '@/app/actions/admin';
import {
  getEvidenceRequirementRows,
  getEvidenceTypes,
  getRoles,
  getSchoolStages,
  getTeacherCategories,
  hasPermission,
} from '@/lib/data/admin';
import { getCurrentYear } from '@/lib/data/growth';

export const metadata = { title: 'Evidence rules' };

export const dynamic = 'force-dynamic';

export default async function EvidenceAdminPage() {
  const year = await getCurrentYear();
  if (!year) {
    return (
      <Shell path="/admin/evidence" title="Evidence Requirements">
        <EmptyState message="No academic year is current." />
      </Shell>
    );
  }

  const [rows, canManage] = await Promise.all([
    getEvidenceRequirementRows(year.id),
    hasPermission('competency.manage'),
  ]);
  const [types, categories, stages, roles] = canManage
    ? await Promise.all([getEvidenceTypes(), getTeacherCategories(), getSchoolStages(), getRoles()])
    : [[], [], [], []];

  const blank = { value: '', label: 'Everyone' };

  function scope(r: (typeof rows)[number]): string {
    const parts: string[] = [];
    if (r.teacher_category_name) parts.push(r.teacher_category_name);
    if (r.school_stage_name) parts.push(r.school_stage_name);
    if (r.role_key) parts.push(r.role_key.replace(/_/g, ' '));
    return parts.length ? parts.join(' · ') : 'Everyone';
  }

  return (
    <Shell
      path="/admin/evidence"
      title="Evidence Requirements"
      lead={`How much evidence of each type is expected in ${year.label}, and from whom.`}
    >
      <div className="mb-8">
        <Card title="These are school policy">
          <p className="text-sm text-muted-foreground">
            CBSE does not set evidence requirements. Everything configured here is the
            school&rsquo;s own expectation, recorded as such, and it is shown to teachers with that
            label. Nothing is seeded: an unmet requirement nobody agreed to would be worse than none
            at all.
          </p>
        </Card>
      </div>

      <Card title={`Configured for ${year.label}`}>
        {rows.length === 0 ? (
          <EmptyState message="No evidence requirements configured. Evidence may still be submitted voluntarily." />
        ) : (
          <ScrollRegion label="Evidence requirements">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-2 font-medium">
                    Evidence type
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Applies to
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Minimum
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Guidance
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="py-2">{r.evidence_type_name ?? '—'}</td>
                    <td className="py-2 text-muted-foreground">{scope(r)}</td>
                    <td className="py-2 text-right tabular-nums">{r.minimum_count}</td>
                    <td className="py-2 text-muted-foreground">{r.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Card>

      {canManage && (
        <div className="mt-8 max-w-xl">
          <Card title="Configure a requirement">
            <ActionForm
              action={createEvidenceRequirement}
              submitLabel="Add requirement"
              variant="primary"
            >
              <SelectField
                name="evidenceTypeId"
                label="Evidence type"
                options={types.map((t) => ({ value: t.id, label: t.label }))}
              />
              <TextField name="minimumCount" label="Minimum count" placeholder="1" />
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
                name="roleKey"
                label="Role"
                options={[blank, ...roles.map((r) => ({ value: r.key, label: r.label }))]}
              />
              <Field
                name="description"
                label="Guidance"
                required={false}
                rows={2}
                placeholder="What should a teacher submit, and what makes it good enough?"
              />
            </ActionForm>
          </Card>
        </div>
      )}
    </Shell>
  );
}
