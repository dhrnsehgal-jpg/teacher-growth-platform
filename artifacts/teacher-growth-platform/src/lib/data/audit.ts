import { createClient } from '@/lib/supabase/server';

export interface AuditRow {
  id: string;
  action: string;
  entity_schema: string;
  entity_table: string;
  entity_id: string | null;
  actor_role_key: string | null;
  reason: string | null;
  source: string | null;
  occurred_at: string;
  actor_name: string | null;
}

export interface AuditFilter {
  action?: string;
  schema?: string;
  actor?: string;
}

/**
 * The audit trail, newest first.
 *
 * No school filter is applied here on purpose. RLS already restricts this table
 * to schools where the reader holds `audit.read`, and adding a second filter in
 * TypeScript would make the boundary look like it lives in the application when
 * it does not. If the query returns nothing, the reader has no right to it.
 */
export async function getAuditLog(filter: AuditFilter = {}, limit = 200): Promise<AuditRow[]> {
  const supabase = await createClient();
  let query = supabase
    .schema('audit')
    // The `_detail` view exists because PostgREST cannot embed core.app_user
    // from another schema. It is security_invoker, so audit_log's own policies
    // still decide what comes back.
    .from('audit_log_detail')
    .select(
      `id, action, entity_schema, entity_table, entity_id, actor_role_key,
       reason, source, occurred_at, actor_name`,
    )
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (filter.action) query = query.like('action', `${filter.action}%`);
  if (filter.schema) query = query.eq('entity_schema', filter.schema);
  if (filter.actor) query = query.eq('actor_user_id', filter.actor);

  const { data } = await query;
  return (data ?? []) as unknown as AuditRow[];
}

/** The distinct action prefixes present, for the filter control. */
export async function getAuditActions(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('audit')
    .from('audit_log_detail')
    .select('action')
    .limit(2000);
  const prefixes = new Set<string>();
  for (const row of (data ?? []) as { action: string }[]) {
    prefixes.add(row.action.split('.')[0]!);
  }
  return [...prefixes].sort();
}

export interface AccessLogRow {
  id: string;
  record_type: string;
  purpose: string | null;
  occurred_at: string;
  actor_name: string | null;
}

/**
 * Who opened this teacher's records.
 *
 * Reading your own record is deliberately not logged, so this list is only ever
 * other people. That is the list worth showing a teacher: burying it in their
 * own page views would make it unreadable and hide the entries that matter.
 */
export async function getAccessLog(teacherProfileId: string): Promise<AccessLogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema('privacy')
    .from('access_log_detail')
    .select('id, record_type, purpose, occurred_at, actor_name')
    .eq('subject_teacher_profile_id', teacherProfileId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as AccessLogRow[];
}
