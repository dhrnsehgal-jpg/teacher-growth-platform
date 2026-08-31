import { ActionForm, CheckField, Field, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { updateGrowthWeights, updateReadinessRequirement } from '@/app/actions/admin';
import { hasPermission } from '@/lib/data/admin';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Growth model' };

export const dynamic = 'force-dynamic';

interface Component {
  id: string;
  key: string;
  display_name: string;
  source: string;
  weight_percent: number;
  definition: string;
}

interface Requirement {
  id: string;
  display_name: string;
  source: string;
  weight_percent: number;
  threshold: number | null;
  threshold_note: string;
  is_mandatory: boolean;
}

export default async function GrowthAdminPage() {
  const supabase = await createClient();

  const [{ data: model }, { data: readinessModel }, canManageGrowth, canManagePay] =
    await Promise.all([
      supabase
        .schema('appraisal')
        .from('growth_model')
        .select('id, key, version, name, classification, disclaimer, effective_from')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .schema('pay')
        .from('readiness_model')
        .select('id, key, version, name, disclaimer')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      hasPermission('appraisal.finalise'),
      hasPermission('pay_framework.manage'),
    ]);

  const growthModel = model as unknown as {
    id: string;
    name: string;
    version: number;
    classification: string;
    disclaimer: string;
    effective_from: string;
  } | null;
  const payModel = readinessModel as unknown as {
    id: string;
    name: string;
    version: number;
    disclaimer: string;
  } | null;

  const [{ data: comps }, { data: reqs }] = await Promise.all([
    growthModel
      ? supabase
          .schema('appraisal')
          .from('growth_component')
          .select('id, key, display_name, source, weight_percent, definition')
          .eq('model_id', growthModel.id)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
    payModel
      ? supabase
          .schema('pay')
          .from('readiness_requirement')
          .select(
            'id, display_name, source, weight_percent, threshold, threshold_note, is_mandatory',
          )
          .eq('model_id', payModel.id)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
  ]);

  const components = (comps ?? []) as unknown as Component[];
  const requirements = (reqs ?? []) as unknown as Requirement[];

  return (
    <Shell
      path="/admin/growth"
      title="Growth & Readiness Models"
      lead="The weights behind the professional growth score, and the thresholds behind increment readiness. Both are school policy."
    >
      <div className="mb-5">
        <Card title="These are the school's own numbers">
          <p className="rounded-md bg-caution p-3 text-sm font-medium text-caution-foreground">
            {growthModel?.disclaimer ??
              'DEMO SCHOOL POLICY — NOT A CBSE OR PUNJAB GOVERNMENT FORMULA.'}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            No CBSE or Punjab Government growth-score formula has been established. Everything below
            is the school&rsquo;s decision, open to change by the school, and every score the model
            produces carries these words beside it.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Professional growth weights"
          meta={
            growthModel && (
              <span className="text-xs text-muted-foreground">
                {growthModel.name} · v{growthModel.version}
              </span>
            )
          }
        >
          {!growthModel || components.length === 0 ? (
            <EmptyState message="No growth model is configured." />
          ) : !canManageGrowth ? (
            <ul className="divide-y text-sm">
              {components.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 py-2">
                  <span>{c.display_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Number(c.weight_percent)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                All weights are submitted together and must total 100 — the model is refused
                otherwise, so there is no half-saved state.
              </p>
              <ActionForm
                action={updateGrowthWeights}
                hidden={{ modelId: growthModel.id }}
                submitLabel="Save weights"
                variant="primary"
              >
                {components.map((c) => (
                  <TextField
                    key={c.id}
                    name={`weight_${c.id}`}
                    label={`${c.display_name} (%)`}
                    defaultValue={String(Number(c.weight_percent))}
                  />
                ))}
              </ActionForm>
              <p className="mt-3 text-xs text-muted-foreground">
                Scores already computed keep the model version they were made under. Changing a
                weight cannot alter what a past appraisal was told.
              </p>
            </>
          )}
        </Card>

        <Card
          title="Increment readiness thresholds"
          meta={
            payModel && (
              <span className="text-xs text-muted-foreground">
                {payModel.name} · v{payModel.version}
              </span>
            )
          }
        >
          {!payModel || requirements.length === 0 ? (
            <EmptyState message="No readiness model is configured." />
          ) : (
            <ul className="space-y-4">
              {requirements.map((r) => (
                <li key={r.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {r.display_name}
                      {r.is_mandatory && (
                        <span className="ml-2 rounded-full bg-caution px-2 py-0.5 text-xs text-caution-foreground">
                          mandatory
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      weight {Number(r.weight_percent)}% · threshold{' '}
                      {r.threshold === null ? 'none' : Number(r.threshold)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.threshold_note}</p>
                  {canManagePay && (
                    <div className="mt-3">
                      <ActionForm
                        action={updateReadinessRequirement}
                        hidden={{ requirementId: r.id }}
                        submitLabel="Update"
                      >
                        <TextField
                          name="threshold"
                          label="Threshold"
                          required={false}
                          defaultValue={r.threshold === null ? '' : String(Number(r.threshold))}
                        />
                        <Field
                          name="thresholdNote"
                          label="What this threshold means"
                          rows={2}
                          defaultValue={r.threshold_note}
                        />
                        <CheckField name="isMandatory" label="Mandatory" />
                      </ActionForm>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
