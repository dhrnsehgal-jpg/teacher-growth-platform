import * as React from 'react';
import { Info, FolderOpen } from 'lucide-react';

export function Card({
  title,
  meta,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-card border bg-background shadow-card transition-all ${className}`}
    >
      {(title || meta) && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/20 px-card py-4">
          {title && <h2 className="text-title font-semibold tracking-tight text-foreground">{title}</h2>}
          {meta && <div className="text-body flex-shrink-0">{meta}</div>}
        </div>
      )}
      <div className="p-card">{children}</div>
    </section>
  );
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-muted-foreground/30 bg-muted/10 p-12 text-center transition-all hover:bg-muted/20">
      <FolderOpen className="mb-4 h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
      <div className="mb-4 max-w-sm text-body font-medium text-muted-foreground">{message}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function LevelPill({ name, ordinal }: { name: string; ordinal: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-button border border-muted-foreground/15 bg-background px-2.5 py-1 text-meta font-medium text-foreground shadow-sm">
      <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-muted/50 text-[10px] font-bold text-muted-foreground">
        {ordinal}
      </span>
      <span>{name}</span>
    </span>
  );
}

export function StatusPill({
  status,
  label,
}: {
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  label?: string;
}) {
  const styles = {
    pending: 'bg-caution/30 text-caution-foreground border-caution-foreground/20',
    approved: 'bg-primary/10 text-primary border-primary/20',
    rejected: 'bg-muted text-muted-foreground border-border',
    draft: 'bg-transparent border-dashed border-muted-foreground/40 text-muted-foreground',
  };
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${styles[status]}`}
    >
      {label || status}
    </span>
  );
}

export function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-primary/20 bg-primary/5 p-5 text-body text-foreground">
      <div className="absolute left-0 top-0 h-full w-1 bg-primary/40"></div>
      <div className="flex gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary/70" strokeWidth={2} />
        <div>
          {title && <h4 className="mb-1 font-semibold text-primary">{title}</h4>}
          <div className="text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
}) {
  const styles = {
    default: 'border-transparent bg-primary text-primary-foreground shadow-sm',
    secondary: 'bg-muted text-foreground border-transparent',
    outline: 'text-foreground border-border',
  };
  return (
    <span
      className={`inline-flex items-center rounded-button border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function Table({
  headers,
  caption,
  'aria-label': ariaLabel,
  children,
}: {
  headers: React.ReactNode[];
  caption?: React.ReactNode;
  'aria-label'?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="w-full overflow-auto rounded-card border bg-background shadow-sm"
      tabIndex={0}
      role="region"
      aria-label={ariaLabel || (typeof caption === 'string' ? caption : 'Data table')}
    >
      <table className="w-full text-left text-body" aria-label={ariaLabel}>
        {caption && (
          <caption className="px-4 py-3 text-left text-body text-muted-foreground">
            {caption}
          </caption>
        )}
        <thead className="bg-muted/30 text-meta uppercase tracking-wider text-muted-foreground">
          <tr>
            {headers.map((h, i) => {
              const key = typeof h === 'string' || typeof h === 'number' ? String(h) : `th-${i}`;
              return (
                <th
                  key={key}
                  scope="col"
                  className="px-4 py-3.5 font-semibold border-b whitespace-nowrap"
                >
                  {h}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({ children }: { children: React.ReactNode }) {
  return <tr className="transition-colors hover:bg-muted/10">{children}</tr>;
}

export function TableCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export function Button({
  children,
  variant = 'default',
  size = 'default',
  className = '',
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}) {
  const base =
    'inline-flex items-center justify-center rounded-button font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background active:scale-[0.97]';
  const variants = {
    default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow',
    secondary: 'bg-muted text-foreground hover:bg-muted/80',
    outline: 'border border-input bg-background shadow-sm hover:bg-muted hover:text-foreground',
    ghost: 'hover:bg-muted hover:text-foreground',
  };
  const sizes = {
    default: 'h-10 px-4 py-2 text-body',
    sm: 'h-9 px-3 text-meta',
    lg: 'h-11 px-8 text-title',
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
