import { ActionForm, Field, SelectField, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { createProficiencyLevel } from '@/app/actions/admin';
import { getProficiencyScales, hasPermission } from '@/lib/data/admin';

export const metadata = { title: 'Proficiency scales' };

export const dynamic = 'force-dynamic';

export default async function ProficiencyAdminPage() {
  const [scales, canManage] = await Promise.all([
    getProficiencyScales(),
    hasPermission('competency.manage'),
  ]);

  return (
    <Shell
      path="/admin/proficiency"
      title="Proficiency Levels"
      lead="The scales competency expectations are set against. A school holds more than one: its own operating scale, plus the reference scales of any framework it maps to."
    >
      <div className="mb-8">
        <Card title="Why there is more than one scale">
          <p className="text-sm text-muted-foreground">
            The five-point scale below is the school&rsquo;s own product descriptor. Where an
            external framework uses its own terminology — NPST&rsquo;s three levels, for example —
            that scale is recorded separately rather than translated, so a level is never quietly
            reported in the wrong vocabulary.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Assessments and targets must use the same scale. The database refuses a verified level
            and an expected level drawn from different ones.
          </p>
        </Card>
      </div>

      {scales.length === 0 ? (
        <EmptyState message="No proficiency scales visible." />
      ) : (
        <div className="space-y-6">
          {scales.map((scale) => (
            <Card
              key={scale.id}
              title={scale.name}
              meta={
                <span className="text-xs text-muted-foreground">
                  {scale.framework_name} · {scale.levels.length} levels
                </span>
              }
            >
              {scale.levels.length === 0 ? (
                <EmptyState message="No levels defined on this scale yet." />
              ) : (
                <ul className="divide-y text-sm">
                  {scale.levels.map((l) => (
                    <li key={l.id} className="py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="tabular-nums text-muted-foreground">{l.ordinal}</span>
                        <span className="font-medium">{l.name}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{l.descriptor}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {canManage && scales.length > 0 && (
        <div className="mt-8 max-w-xl">
          <Card title="Define a level">
            <p className="mb-3 text-xs text-muted-foreground">
              Every level needs a descriptor. A level named but not described cannot be applied
              consistently by two different assessors, which is the whole point of having a scale.
            </p>
            <ActionForm action={createProficiencyLevel} submitLabel="Add level" variant="primary">
              <SelectField
                name="scaleId"
                label="Scale"
                options={scales.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.framework_name})`,
                }))}
              />
              <TextField name="ordinal" label="Ordinal" placeholder="1" />
              <TextField name="key" label="Key" placeholder="proficient" />
              <TextField name="name" label="Name" placeholder="Proficient" />
              <Field
                name="descriptor"
                label="Descriptor"
                placeholder="What does practice at this level actually look like?"
              />
            </ActionForm>
          </Card>
        </div>
      )}
    </Shell>
  );
}
