import { Card, EmptyState, Shell } from '@/components/shell';
import {
  getCareerEvents,
  getEmploymentGate,
  getQualifications,
  getServicePolicies,
  getServiceRecord,
} from '@/lib/data/employment';
import { getSessionProfile } from '@/lib/data/growth';

export const metadata = { title: 'Service record' };

export const dynamic = 'force-dynamic';

export default async function ServiceRecordPage() {
  const profile = await getSessionProfile();
  if (!profile) {
    return (
      <Shell path="/service" title="My Service Record">
        <EmptyState message="No teacher profile is linked to this account." />
      </Shell>
    );
  }

  const [record, gate, policies] = await Promise.all([
    getServiceRecord(profile.id),
    getEmploymentGate(),
    getServicePolicies(),
  ]);

  if (!record) {
    return (
      <Shell path="/service" title="My Service Record">
        <EmptyState message="No service record has been created for you." />
      </Shell>
    );
  }

  const [events, qualifications] = await Promise.all([
    getCareerEvents(record.id),
    getQualifications(record.id),
  ]);

  return (
    <Shell
      path="/service"
      title="My Service Record"
      lead="Your professional and service record. It holds what the school needs for the authorised purpose and nothing beyond it — no salary, no bank details."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card title="Appointment">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Employee ID</dt>
                <dd>{record.employee_id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Designation</dt>
                <dd>{record.designation?.display_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Appointed</dt>
                <dd>{record.appointment_date}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Letter reference</dt>
                <dd>{record.appointment_letter_reference ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Employment category</dt>
                <dd>{record.employment_category ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Probation</dt>
                <dd className="capitalize">{record.probation_state.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Confirmed</dt>
                <dd>{record.confirmed_on ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Prior experience</dt>
                <dd>
                  {record.prior_experience_months
                    ? `${Math.floor(record.prior_experience_months / 12)} years`
                    : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Career history">
            {events.length === 0 ? (
              <EmptyState message="No career events recorded." />
            ) : (
              <ul className="divide-y text-sm">
                {events.map((e) => (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium capitalize">
                        {e.event_type.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {e.effective_on}
                        {e.reference ? ` · ${e.reference}` : ''}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{e.summary}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Append-only. A correction is a new event, because a service record whose past can be
              edited cannot evidence anything.
            </p>
          </Card>

          <Card title="Qualifications">
            {qualifications.length === 0 ? (
              <EmptyState message="No qualifications recorded." />
            ) : (
              <ul className="divide-y text-sm">
                {qualifications.map((q) => (
                  <li key={q.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{q.qualification}</span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">
                        {q.verification_status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[q.awarding_body, q.subject_or_field, q.awarded_year]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {q.verification_note && (
                      <p className="mt-1 text-xs text-muted-foreground">{q.verification_note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Which service rules apply">
            <div className="mb-3 rounded-md bg-caution p-3 text-xs text-caution-foreground">
              {gate.serviceRuleMessage}
            </div>
            <ul className="space-y-3 text-sm">
              {policies.map((p) => (
                <li key={p.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{p.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {p.classification.replace(/_/g, ' ')} ·{' '}
                    {p.verification_status.replace(/_/g, ' ')} · applicability{' '}
                    {p.applicability.replace(/_/g, ' ')}
                  </p>
                  {p.applicability_note && (
                    <p className="mt-1 text-xs text-muted-foreground">{p.applicability_note}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Being located in Punjab does not by itself make a Punjab Government rule apply to this
              school. Each one above is recorded, unread, and undetermined.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
