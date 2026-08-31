'use client';

import { useActionState } from 'react';

import { retireCompetency, type ActionResult } from './actions';

export function RetireForm({
  competencyId,
  competencyKey,
}: {
  competencyId: string;
  competencyKey: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    retireCompetency,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="competencyId" value={competencyId} />
      <input type="hidden" name="competencyKey" value={competencyKey} />

      <label className="block text-sm font-medium" htmlFor="reason">
        Reason for retiring
      </label>
      <textarea
        id="reason"
        name="reason"
        rows={3}
        minLength={10}
        required
        placeholder="Why is this competency being retired, and what replaces it?"
        className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Retiring keeps the competency and every assessment made against it. It stops appearing in
        new expectations from now on.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {pending ? 'Retiring…' : 'Retire competency'}
      </button>

      {state && (
        <p className={`text-sm ${state.ok ? 'text-muted-foreground' : 'text-caution-foreground'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
