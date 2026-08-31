import { currentPreviewUser, isPreviewMode, PREVIEW_USERS } from '@/lib/data/preview';
import { DEMO_PERSONAS, demoAccessEnabled } from '@/lib/demo-access';
import { getSessionProfile } from '@/lib/data/growth';

/**
 * Development-only banner for switching the previewed user.
 *
 * Renders nothing outside preview mode. Switching genuinely changes who the
 * database thinks you are — every query still runs under Row Level Security as
 * that person — so the difference you see between a teacher and a Head of
 * Department is real, not simulated.
 */
export async function PreviewBar({ path }: { path: string }) {
  if (demoAccessEnabled()) return <DemoBar path={path} />;
  if (!isPreviewMode()) return null;
  const active = await currentPreviewUser();

  return (
    <div className="border-b bg-caution text-caution-foreground">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-xs">
        <span className="font-semibold uppercase tracking-wide">Local preview</span>
        <span className="opacity-80">reading PostgreSQL directly, under RLS — viewing as</span>
        {PREVIEW_USERS.map((u) => (
          <a
            key={u.key}
            href={`/api/preview-user?as=${u.key}&next=${encodeURIComponent(path)}`}
            className={`rounded-full border px-2 py-0.5 transition-opacity ${
              u.key === active.key
                ? 'border-current font-semibold'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
            title={u.role}
          >
            {u.name}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * The same idea for the password-free demo, but switching genuinely signs in as
 * that person rather than setting a cookie the data layer interprets. What you
 * see is what they would see.
 */
async function DemoBar({ path }: { path: string }) {
  const profile = await getSessionProfile();

  return (
    <div className="border-b bg-caution text-caution-foreground">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-xs">
        <span className="font-semibold uppercase tracking-wide">Demo</span>
        <span className="opacity-80">
          signed in for real, under Row Level Security — viewing as
        </span>
        {DEMO_PERSONAS.map((p) => (
          <a
            key={p.key}
            href={`/api/demo-user?as=${p.key}&next=${encodeURIComponent(path)}`}
            className={`rounded-full border px-2 py-0.5 transition-opacity ${
              p.name === profile?.user.full_name
                ? 'border-current font-semibold'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
            title={p.role}
          >
            {p.name}
          </a>
        ))}
      </div>
    </div>
  );
}
