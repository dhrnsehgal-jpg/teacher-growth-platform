'use client';

import { useActionState, useId } from 'react';
import type { ActionResult } from '@/app/actions/growth';

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * A form bound to one server action, with its result shown inline.
 */
export function ActionForm({
  action,
  hidden,
  submitLabel,
  children,
  variant = 'default',
}: {
  action: Action;
  hidden?: Record<string, string>;
  submitLabel: string;
  children?: React.ReactNode;
  variant?: 'default' | 'primary';
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="space-y-4">{children}</div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className={
            variant === 'primary'
              ? 'inline-flex items-center justify-center rounded-button bg-primary px-4 py-2 text-body font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
              : 'inline-flex items-center justify-center rounded-button border border-input bg-background px-4 py-2 text-body font-medium shadow-card transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
          }
        >
          {pending ? 'Working…' : submitLabel}
        </button>
        {state && (
          <p
            role={state.ok ? 'status' : 'alert'}
            className={`text-body ${state.ok ? 'text-muted-foreground' : 'text-caution-foreground font-medium bg-caution px-3 py-1.5 rounded-button'}`}
          >
            <span className="font-semibold">{state.ok ? 'Done' : 'Not done'} — </span>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

export function Field({
  name,
  label,
  placeholder,
  rows = 3,
  required = true,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  defaultValue?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-body font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && (
          <span className="text-muted-foreground ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="flex w-full rounded-button border border-input bg-transparent px-3 py-2 text-body shadow-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function TextField({
  name,
  label,
  placeholder,
  required = true,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-body font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && (
          <span className="text-muted-foreground ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="flex h-10 w-full rounded-button border border-input bg-transparent px-3 py-2 text-body shadow-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  required = true,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-body font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && (
          <span className="text-muted-foreground ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="flex h-10 w-full rounded-button border border-input bg-background px-3 py-2 text-body shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FileField({
  name,
  label,
  hint,
  required = false,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-body font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && (
          <span className="text-muted-foreground ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        type="file"
        name={name}
        required={required}
        className="flex h-10 w-full rounded-button border border-input bg-transparent px-3 py-2 text-body text-muted-foreground file:border-0 file:bg-transparent file:text-body file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {hint && <p className="text-meta text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const LEVEL_OPTIONS = [
  { value: '1', label: '1 — Foundation' },
  { value: '2', label: '2 — Developing' },
  { value: '3', label: '3 — Proficient' },
  { value: '4', label: '4 — Advanced' },
  { value: '5', label: '5 — Expert / Lead' },
];

export function SourceFields({ defaultFramework = 'school' }: { defaultFramework?: string }) {
  return (
    <div className="space-y-4 rounded-card border border-muted-foreground/20 bg-muted/5 p-4">
      <div className="space-y-1">
        <h4 className="text-body font-medium leading-none">Verification & Alignment</h4>
        <p className="text-meta text-muted-foreground">
          Record where this actually comes from. If you cannot cite a clause, it is derived or
          school-defined — not aligned.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="sourceFramework"
          label="Framework"
          defaultValue={defaultFramework}
          options={[
            { value: 'school', label: 'School-specific' },
            { value: 'npst', label: 'NPST' },
            { value: 'cbse', label: 'CBSE-related' },
            { value: 'punjab', label: 'Punjab-specific' },
            { value: 'other_framework', label: 'Other approved framework' },
          ]}
        />
        <SelectField
          name="sourceAlignment"
          label="Relationship to that framework"
          defaultValue="school_defined"
          options={[
            { value: 'school_defined', label: 'School-defined — our own wording' },
            { value: 'derived', label: 'Derived — built out from it, not quoted' },
            { value: 'aligned', label: 'Aligned — quotes a specific clause (citation required)' },
          ]}
        />
        <div className="sm:col-span-2">
          <TextField
            name="externalReference"
            label="Clause reference"
            required={false}
            placeholder="e.g. NPST 2023, indicator 8.2.2"
          />
        </div>
      </div>
    </div>
  );
}

export function CheckField({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="items-top flex space-x-2">
      <input
        id={id}
        type="checkbox"
        name={name}
        value="true"
        className="peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-0.5"
      />
      <div className="grid gap-1.5 leading-none">
        <label
          htmlFor={id}
          className="text-body font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
        {hint && <p className="text-meta text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
