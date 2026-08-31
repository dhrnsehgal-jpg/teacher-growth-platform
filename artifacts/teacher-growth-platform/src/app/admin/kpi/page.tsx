import { ActionForm, CheckField, Field, SelectField, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { assignKpi, createKpiTemplate } from '@/app/actions/admin';
import {
  getKpiCategories,
  getKpiTemplates,
  getStaffOptions,
  hasPermission,
} from '@/lib/data/admin';
import { listKpiTemplates } from '@/lib/data/framework';

export const metadata = { title: 'KPI templates' };

export const dynamic = 'force-dynamic';

export default async function KpiAdminPage() {
  const templates = await listKpiTemplates();
  const [canManage, canAssign] = await Promise.all([
    hasPermission('kpi.manage'),
    hasPermission('kpi.assign'),
  ]);
  const [categories, assignable, staff] = await Promise.all([
    canManage ? getKpiCategories() : Promise.resolve([]),
    canAssign ? getKpiTemplates() : Promise.resolve([]),
    canAssign ? getStaffOptions() : Promise.resolve([]),
  ]);

  const byCategory = new Map<string, typeof templates>();
  for (const t of templates) {
    const key = t.category.name;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(t);
  }

  const studentOutcomeCount = templates.filter((t) => t.is_student_outcome_measure).length;

  return (
    <Shell
      path="/admin/kpi"
      title="KPI Templates"
      lead="Agreed, measurable responsibilities for a review period. Distinct from competencies, which describe professional capability rather than agreed outcomes."
    >
      {(canManage || canAssign) && (
        <div className="mb-8 grid gap-5 lg:grid-cols-2">
          {canManage && (
            <Card title="Create a KPI template">
              <p className="mb-3 text-xs text-muted-foreground">
                A template is reusable. Assigning it to a teacher copies its terms onto their
                record, so a later template edit never rewrites an agreement already made.
              </p>
              <ActionForm
                action={createKpiTemplate}
                submitLabel="Create template"
                variant="primary"
              >
                <SelectField
                  name="categoryId"
                  label="Category"
                  options={categories.map((c) => ({ value: c.id, label: c.label }))}
                />
                <TextField name="key" label="Key" placeholder="formative_assessment_coverage" />
                <TextField name="name" label="Name" />
                <Field
                  name="description"
                  label="Description"
                  rows={2}
                  placeholder="Copied onto every teacher this is assigned to — it is what they read when agreeing to it."
                />
                <TextField name="metric" label="What is measured" />
                <TextField
                  name="unit"
                  label="Unit"
                  required={false}
                  placeholder="%, count, rating"
                />
                <SelectField
                  name="direction"
                  label="Direction"
                  options={[
                    { value: 'increase', label: 'Higher is better' },
                    { value: 'decrease', label: 'Lower is better' },
                    { value: 'maintain', label: 'Maintain' },
                    { value: 'qualitative', label: 'Qualitative' },
                  ]}
                />
                <SelectField
                  name="frequency"
                  label="Frequency"
                  defaultValue="annual"
                  options={[
                    { value: 'continuous', label: 'Continuous' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'termly', label: 'Termly' },
                    { value: 'semester', label: 'Semester' },
                    { value: 'annual', label: 'Annual' },
                  ]}
                />
                <TextField name="defaultTarget" label="Default target" required={false} />
                <TextField name="defaultWeight" label="Default weight" required={false} />
                <TextField
                  name="dataSource"
                  label="Data source"
                  placeholder="Where the number comes from"
                />
                <Field name="evidenceRequirement" label="Evidence requirement" rows={2} />
                <CheckField
                  name="isStudentOutcomeMeasure"
                  label="This is a student-outcome measure"
                  hint="Flagged so it can never become the sole determinant of teacher effectiveness."
                />
              </ActionForm>
            </Card>
          )}

          {canAssign && (
            <Card title="Assign a KPI">
              <p className="mb-3 text-xs text-muted-foreground">
                Assigned for the current academic year. A reviewer is required — a KPI with nobody
                accountable for reviewing it is not an agreement.
              </p>
              {assignable.length === 0 || staff.length === 0 ? (
                <EmptyState message="No templates or staff in scope to assign." />
              ) : (
                <ActionForm action={assignKpi} submitLabel="Assign KPI">
                  <SelectField
                    name="templateId"
                    label="KPI template"
                    options={assignable.map((t) => ({
                      value: t.id,
                      label: `${t.category} · ${t.name}`,
                    }))}
                  />
                  <SelectField
                    name="teacherProfileId"
                    label="Teacher"
                    options={staff.map((p) => ({
                      value: p.id,
                      label: p.department ? `${p.name} (${p.department})` : p.name,
                    }))}
                  />
                  <SelectField
                    name="reviewerUserId"
                    label="Reviewer"
                    options={staff.map((p) => ({ value: p.userId, label: p.name }))}
                  />
                  <TextField
                    name="target"
                    label="Target"
                    required={false}
                    placeholder="Leave blank to use the template default"
                  />
                  <TextField name="weight" label="Weight" required={false} />
                </ActionForm>
              )}
            </Card>
          )}
        </div>
      )}

      <Card title="Student-outcome measures">
        <p className="text-sm text-muted-foreground">
          {studentOutcomeCount} of {templates.length} templates draw on student outcomes. School
          policy caps their combined share of any teacher&rsquo;s KPI weight, so examination results
          can never be the sole or dominant determinant of teacher effectiveness. That cap is the
          school&rsquo;s own rule, not a CBSE or State requirement.
        </p>
      </Card>

      <div className="mt-6 space-y-8">
        {templates.length === 0 ? (
          <EmptyState message="No KPI templates visible. Sign in with an account that belongs to a school, or run the seed." />
        ) : (
          [...byCategory.entries()].map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-3 text-lg font-semibold">{category}</h2>
              <ul className="divide-y rounded-lg border">
                {items.map((t) => (
                  <li key={t.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <span className="font-medium">{t.name}</span>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {t.is_student_outcome_measure && (
                          <span className="rounded-full border bg-caution px-2 py-0.5 text-caution-foreground">
                            Student outcome
                          </span>
                        )}
                        <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                          {t.frequency}
                        </span>
                        {t.default_weight !== null && (
                          <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                            default weight {Number(t.default_weight)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>
                        <dt className="inline font-medium">Metric: </dt>
                        <dd className="inline">
                          {t.metric}
                          {t.unit ? ` (${t.unit})` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">Data source: </dt>
                        <dd className="inline">{t.data_source}</dd>
                      </div>
                      {t.default_target && (
                        <div>
                          <dt className="inline font-medium">Default target: </dt>
                          <dd className="inline">{t.default_target}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline font-medium">Direction: </dt>
                        <dd className="inline">{t.direction}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Shell>
  );
}
