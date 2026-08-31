import { ActionForm, Field, SelectField, TextField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { advanceChangeRequest, raiseChangeRequest } from '@/app/actions/regulatory';
import { hasPermission } from '@/lib/data/admin';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Regulatory register' };

export const dynamic = 'force-dynamic';

const STAGES = [
  ['received', 'Received'],
  ['source_recorded', 'Source recorded'],
  ['under_review', 'Under review'],
  ['applicability_determined', 'Applicability determined'],
  ['version_created', 'Rule version created'],
  ['activated', 'Activated'],
  ['superseded_previous', 'Previous version superseded'],
] as const;

interface ChangeRequest {
  id: string;
  title: string;
  summary: string | null;
  received_on: string;
  received_from: string | null;
  source_url: string | null;
  stage: string;
  review_note: string | null;
  applicability_determination: string | null;
  applicability_note: string | null;
  effective_from: string | null;
}

export default async function RegulatoryChangePage() {
  const supabase = await createClient();
  const [{ data }, canManage] = await Promise.all([
    supabase
      .schema('regulatory')
      .from('change_request')
      .select(
        'id, title, summary, received_on, received_from, source_url, stage, review_note, applicability_determination, applicability_note, effective_from',
      )
      .order('received_on', { ascending: false }),
    hasPermission('regulatory.manage'),
  ]);
  const changes = (data ?? []) as unknown as ChangeRequest[];

  function nextStage(current: string): string | null {
    const i = STAGES.findIndex(([k]) => k === current);
    if (i === -1 || i === STAGES.length - 1) return null;
    return STAGES[i + 1]![0];
  }

  return (
    <Shell
      path="/admin/regulatory"
      title="Regulatory Change"
      lead="Carrying a circular or rule from arrival to activation, with a named person at every stage that changes what the platform treats as true."
    >
      <div className="mb-5">
        <Card title="Activation is a human act">
          <p className="text-sm text-muted-foreground">
            A requirement becomes enforced for this school only when a signed-in person holding{' '}
            <code className="text-xs">regulatory.manage</code> does it. The database refuses
            otherwise — there is no path by which anything automated, including the growth
            assistant, can activate a rule.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Every stage past recording the source requires a written conclusion, and the whole trail
            is append-only.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {changes.length === 0 ? (
            <EmptyState message="No regulatory changes are being tracked." />
          ) : (
            changes.map((c) => {
              const idx = STAGES.findIndex(([k]) => k === c.stage);
              const next = nextStage(c.stage);
              return (
                <Card
                  key={c.id}
                  title={c.title}
                  meta={
                    <span className="text-xs capitalize text-muted-foreground">
                      {c.stage.replace(/_/g, ' ')}
                    </span>
                  }
                >
                  {c.summary && <p className="text-sm">{c.summary}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Received {c.received_on}
                    {c.received_from ? ` from ${c.received_from}` : ''}
                    {c.effective_from ? ` · effective ${c.effective_from}` : ''}
                  </p>
                  {c.source_url && (
                    <p className="mt-1 break-all text-xs text-muted-foreground">{c.source_url}</p>
                  )}

                  <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {STAGES.map(([k, label], i) => (
                      <li
                        key={k}
                        className={
                          c.stage === 'rejected'
                            ? 'text-muted-foreground line-through'
                            : i <= idx
                              ? 'font-medium'
                              : 'text-muted-foreground'
                        }
                      >
                        {label}
                      </li>
                    ))}
                  </ol>

                  {c.applicability_note && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      <span className="font-medium">
                        Applicability {c.applicability_determination?.replace(/_/g, ' ')}:{' '}
                      </span>
                      {c.applicability_note}
                    </p>
                  )}
                  {c.review_note && (
                    <p className="mt-1 text-xs text-muted-foreground">{c.review_note}</p>
                  )}

                  {canManage && next && c.stage !== 'rejected' && (
                    <div className="mt-4 border-t pt-3">
                      <ActionForm
                        action={advanceChangeRequest}
                        hidden={{ changeId: c.id, nextStage: next }}
                        submitLabel={`Move to ${next.replace(/_/g, ' ')}`}
                      >
                        {!['received', 'source_recorded'].includes(next) && (
                          <Field name="reviewNote" label="What did you conclude?" rows={2} />
                        )}
                        {next === 'applicability_determined' && (
                          <>
                            <SelectField
                              name="applicability"
                              label="Does it apply to this school?"
                              options={[
                                {
                                  value: 'potentially_applicable',
                                  label: 'Potentially applicable',
                                },
                                { value: 'verified', label: 'Yes — verified as applying' },
                                { value: 'not_applicable', label: 'No — not applicable' },
                                {
                                  value: 'requires_verification',
                                  label: 'Still requires verification',
                                },
                              ]}
                            />
                            <Field name="applicabilityNote" label="Why?" rows={2} />
                          </>
                        )}
                        {next === 'version_created' && (
                          <TextField name="effectiveFrom" label="Effective from (YYYY-MM-DD)" />
                        )}
                      </ActionForm>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        <div>
          {canManage && (
            <Card title="Record a new circular or rule">
              <ActionForm action={raiseChangeRequest} submitLabel="Record it" variant="primary">
                <TextField name="title" label="Title" />
                <Field
                  name="summary"
                  label="What does it appear to say?"
                  required={false}
                  rows={3}
                />
                <TextField name="receivedFrom" label="Received from" required={false} />
                <TextField name="sourceUrl" label="Source URL" required={false} />
              </ActionForm>
              <p className="mt-3 text-xs text-muted-foreground">
                A URL or a person is required. A regulatory change with no citable origin is a
                rumour, and this platform will not track one.
              </p>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
