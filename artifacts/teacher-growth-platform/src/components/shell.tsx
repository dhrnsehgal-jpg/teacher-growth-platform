import Link from 'next/link';
import { hasPermission } from '@/lib/data/admin';
import { PERMISSIONS, type Permission } from '@/lib/rbac/permissions';
import { PreviewBar } from './preview-bar';
import { SignOutButton } from './sign-out-button';

type NavItem = { href: string; label: string; permission?: Permission | Permission[] };
type NavGroup = { group: string; items: NavItem[] };

const NAV_DEF: NavGroup[] = [
  {
    group: 'My Growth',
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/learning-map', label: 'Learning Map' },
      { href: '/self-assessment', label: 'Self-assessment' },
      { href: '/cpd', label: 'My CPD' },
      { href: '/assistant', label: 'Assistant' },
    ],
  },
  {
    group: 'My Career',
    items: [
      { href: '/appraisal', label: 'My Appraisal' },
      { href: '/increment', label: 'Increment Readiness' },
      { href: '/service', label: 'Service Record' },
      { href: '/me', label: 'My Profile' },
    ],
  },
  {
    group: 'Leadership',
    items: [
      {
        href: '/manager',
        label: 'Team Dashboard',
        permission: [
          PERMISSIONS.ASSESSMENT_READ_SCOPE,
          PERMISSIONS.CPD_READ_SCOPE,
          PERMISSIONS.TEACHER_RECORD_READ_SCOPE,
        ],
      },
      {
        href: '/analytics',
        label: 'Analytics',
        permission: PERMISSIONS.TEACHER_RECORD_READ_SCOPE,
      },
    ],
  },
  {
    group: 'Compliance',
    items: [
      { href: '/compliance', label: 'Compliance', permission: PERMISSIONS.COMPLIANCE_READ },
      { href: '/sqaaf', label: 'SQAAF', permission: PERMISSIONS.SQAAF_READ },
    ],
  },
  {
    group: 'Administration',
    items: [
      { href: '/admin/framework', label: 'Framework', permission: PERMISSIONS.COMPETENCY_MANAGE },
      {
        href: '/admin/proficiency',
        label: 'Proficiency',
        permission: PERMISSIONS.COMPETENCY_MANAGE,
      },
      {
        href: '/admin/kpi',
        label: 'KPI Templates',
        permission: [PERMISSIONS.KPI_MANAGE, PERMISSIONS.KPI_ASSIGN],
      },
      {
        href: '/admin/evidence',
        label: 'Evidence Rules',
        permission: PERMISSIONS.COMPETENCY_MANAGE,
      },
      {
        href: '/admin/growth',
        label: 'Growth Model',
        permission: [PERMISSIONS.APPRAISAL_FINALISE, PERMISSIONS.PAY_FRAMEWORK_MANAGE],
      },
      { href: '/admin/regulatory', label: 'Regulatory', permission: PERMISSIONS.REGULATORY_MANAGE },
      { href: '/admin/audit', label: 'Audit Log', permission: PERMISSIONS.AUDIT_READ },
    ],
  },
];

export async function Shell({
  title,
  lead,
  path = '/',
  children,
}: {
  title: string;
  lead?: string;
  /** Current path, so the preview switcher can return you here. */
  path?: string;
  children: React.ReactNode;
}) {
  const requiredPerms = new Set<Permission>();
  for (const group of NAV_DEF) {
    for (const item of group.items) {
      if (item.permission) {
        if (Array.isArray(item.permission)) {
          item.permission.forEach((p) => requiredPerms.add(p));
        } else {
          requiredPerms.add(item.permission);
        }
      }
    }
  }

  const permEntries = await Promise.all(
    Array.from(requiredPerms).map(async (p) => {
      const has = await hasPermission(p);
      return [p, has] as const;
    }),
  );
  const userPerms = new Map(permEntries);

  const visibleNav = NAV_DEF.map((group) => {
    const visibleItems = group.items.filter((item) => {
      if (!item.permission) return true;
      if (Array.isArray(item.permission)) {
        return item.permission.some((p) => userPerms.get(p));
      }
      return userPerms.get(item.permission);
    });
    return { ...group, items: visibleItems };
  }).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Sidebar / Topbar Navigation */}
      <aside className="relative z-10 flex w-full shrink-0 flex-col border-b bg-background md:w-64 md:border-b-0 md:border-r">
        <div className="flex shrink-0 items-center justify-between border-b p-card md:block">
          <span className="text-base font-semibold tracking-tight text-foreground">
            Teacher Growth
          </span>
          <SignOutButton className="text-body font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60" />
        </div>

        {/* Navigation area */}
        <nav
          aria-label="Primary"
          className="hide-scrollbar flex flex-1 snap-x overflow-x-auto overflow-y-hidden md:flex-col md:snap-none md:overflow-y-auto md:p-card"
        >
          <div className="flex min-w-full w-max gap-section p-card md:w-auto md:flex-col md:p-0">
            {visibleNav.map((group) => (
              <div key={group.group} className="space-y-2 shrink-0 md:shrink">
                <h3 className="ml-2 text-meta font-bold uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </h3>
                <ul className="flex md:flex-col gap-1.5 md:gap-0.5">
                  {group.items.map((item) => {
                    const current = path === item.href || path.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href} className="snap-start">
                        <Link
                          href={item.href}
                          aria-current={current ? 'page' : undefined}
                          className={`flex items-center whitespace-nowrap rounded-button px-3 py-1.5 text-body font-medium transition-colors md:py-2 ${
                            current
                              ? 'bg-primary/10 text-primary md:bg-primary md:text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="mt-auto hidden shrink-0 border-t p-card md:block">
          <SignOutButton className="w-full rounded-button px-3 py-2 text-left text-body font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60" />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <PreviewBar path={path} />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 p-page focus:outline-none"
        >
          <header className="mb-section space-y-2">
            <h1 className="text-hero font-semibold text-foreground">{title}</h1>
            {lead && <p className="max-w-3xl text-body text-muted-foreground">{lead}</p>}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

// Re-export UI primitives so all existing imports keep working
export {
  Card,
  EmptyState,
  LevelPill,
  StatusPill,
  Callout,
  Badge,
  Table,
  TableRow,
  TableCell,
  Button,
} from './ui';
