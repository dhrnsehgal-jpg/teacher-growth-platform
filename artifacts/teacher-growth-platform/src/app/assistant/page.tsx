import { ActionForm, Field, SelectField } from '@/components/action-form';
import { Card, EmptyState, Shell } from '@/components/shell';
import { actOnSuggestion, generateSuggestion } from '@/app/actions/assistant';
import { KIND_LABEL, externalAssistanceEnabled } from '@/lib/ai/assistant';
import { getCurrentYear, getSessionProfile } from '@/lib/data/growth';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Growth assistant' };

export const dynamic = 'force-dynamic';

interface Suggestion {
  id: string;
  kind: string;
  mode: string;
  headline: string;
  body: string;
  advisory_label: string;
  inputs: { source: string; detail: string }[];
  generated_at: string;
  acted_on: boolean;
  action_note: string | null;
}

export default async function AssistantPage() {
  const profile = await getSessionProfile();
  const year = await getCurrentYear();

  if (!profile || !year) {
    return (
      <Shell path="/assistant" title="Growth Assistant">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const supabase = await createClient();
  const [{ data }, external] = await Promise.all([
    supabase
      .schema('ai')
      .from('suggestion')
      .select(
        'id, kind, mode, headline, body, advisory_label, inputs, generated_at, acted_on, action_note',
      )
      .eq('teacher_profile_id', profile.id)
      .order('generated_at', { ascending: false })
      .limit(10),
    externalAssistanceEnabled(),
  ]);
  const suggestions = (data ?? []) as unknown as Suggestion[];

  // Every declared kind is offered, derived from the label map rather than
  // hand-listed. Five of them used to have no composer and were omitted here,
  // which was honest but left four capabilities the brief names unbuilt; now
  // that all eleven compose, a hand-maintained list could only drift back out
  // of step. An e2e test exercises every one of them.
  const available = Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[];

  return (
    <Shell
      path="/assistant"
      title="Growth Assistant"
      lead="Explanations built from your own records. It can help you understand your development; it cannot assess you, and nothing it produces changes anything."
    >
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card title="What this can and cannot do">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="font-medium">It can</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>Explain a competency gap and how it was scored</li>
                  <li>Explain why a course was recommended</li>
                  <li>Explain a CPD shortfall</li>
                  <li>Summarise your evidence and observation feedback</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">It cannot</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>Change a competency score or create a hidden one</li>
                  <li>Make an appraisal decision or approve an increment</li>
                  <li>Override a manager&rsquo;s judgement</li>
                  <li>State a CBSE or Punjab requirement it cannot cite</li>
                </ul>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Those are not policies someone has to remember. Suggestions live in their own table
              that no engine reads, so there is no path from anything here to a score, an outcome or
              a decision.
            </p>
          </Card>
        </div>

        <Card title="Where your data goes">
          {external ? (
            <p className="text-sm">
              External AI assistance is <span className="font-medium">enabled</span> for this
              school, under recorded controls.
            </p>
          ) : (
            <>
              <p className="text-sm">
                External AI assistance is <span className="font-medium">switched off</span>.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Every suggestion below was composed inside this system from your own records.
                Nothing about you has been sent anywhere. Turning external assistance on requires a
                data-processing agreement, a privacy review and a named person — the database will
                not accept the setting without them.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2 space-y-5">
          {suggestions.length === 0 ? (
            <EmptyState message="No suggestions yet. Ask for one on the right." />
          ) : (
            suggestions.map((s) => (
              <Card
                key={s.id}
                title={s.headline}
                meta={
                  <span className="text-xs text-muted-foreground">
                    {KIND_LABEL[s.kind as keyof typeof KIND_LABEL] ?? s.kind} ·{' '}
                    {s.generated_at.slice(0, 10)}
                  </span>
                }
              >
                <p className="mb-3 rounded-md bg-caution p-2 text-xs font-medium text-caution-foreground">
                  {s.advisory_label}
                </p>
                <p className="text-sm">{s.body}</p>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Evidence this was built from ({s.inputs.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {s.inputs.map((i, n) => (
                      <li key={n}>
                        <span className="font-medium">{i.source}:</span> {i.detail}
                      </li>
                    ))}
                  </ul>
                </details>

                {s.acted_on ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium">You recorded: </span>
                    {s.action_note}
                  </p>
                ) : (
                  <div className="mt-3">
                    <ActionForm
                      action={actOnSuggestion}
                      hidden={{ suggestionId: s.id }}
                      submitLabel="Record what you decided"
                    >
                      <Field
                        name="actionNote"
                        label="What did you decide?"
                        rows={2}
                        placeholder="The judgement is yours; this records what you did with the suggestion."
                      />
                    </ActionForm>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        <div>
          <Card title="Ask the assistant">
            <ActionForm
              action={generateSuggestion}
              hidden={{ teacherProfileId: profile.id }}
              submitLabel="Explain this"
              variant="primary"
            >
              <SelectField
                name="kind"
                label="What would you like explained?"
                options={available.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </ActionForm>
            <p className="mt-3 text-xs text-muted-foreground">
              If there is nothing on record to explain, the assistant says so rather than
              manufacturing advice.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
