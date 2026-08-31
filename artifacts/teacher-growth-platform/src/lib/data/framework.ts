/**
 * Read queries for the competency framework.
 *
 * All queries run through the request-scoped Supabase client, so Row Level
 * Security applies: a teacher reading this sees the framework (internal
 * reference data), while their colleagues' targets and evidence stay invisible.
 *
 * Types are declared here rather than imported from generated types because
 * `npm run db:types` requires Docker; see src/types/database.ts.
 */

import { dataClient } from './client';
import * as preview from './preview';
import type { SourceAlignment, SourceFramework } from '@/lib/competency/source';

export interface FrameworkRow {
  id: string;
  key: string;
  version: number;
  name: string;
  description: string | null;
  source_framework: SourceFramework;
  source_alignment: SourceAlignment;
  external_reference: string | null;
  status: 'draft' | 'active' | 'retired';
}

export interface CompetencyRow {
  id: string;
  key: string;
  name: string;
  description: string;
  sort_order: number;
  status: 'draft' | 'active' | 'retired';
  source_framework: SourceFramework;
  source_alignment: SourceAlignment;
  external_reference: string | null;
  rationale: string | null;
  retirement_reason: string | null;
  domain: {
    key: string;
    name: string;
    standard: { key: string; name: string; sort_order: number };
  };
}

export interface IndicatorRow {
  id: string;
  key: string;
  statement: string;
  sort_order: number;
  status: string;
  source_framework: SourceFramework;
  source_alignment: SourceAlignment;
  external_reference: string | null;
}

export interface DescriptorRow {
  descriptor: string;
  proficiency_level: { key: string; name: string; ordinal: number };
}

/** Shape of competency.competency_target_detail. */
export interface TargetRow {
  id: string;
  rationale: string | null;
  role_key: string | null;
  requires_leadership: boolean | null;
  level_key: string;
  level_name: string;
  level_ordinal: number;
  teacher_category_name: string | null;
  school_stage_name: string | null;
  career_level_name: string | null;
  subject_name: string | null;
}

export async function listFrameworks(): Promise<FrameworkRow[]> {
  if (preview.isPreviewMode()) return preview.q<FrameworkRow>(preview.sqlListFrameworks);
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    .schema('competency')
    .from('framework')
    .select(
      'id, key, version, name, description, source_framework, source_alignment, external_reference, status',
    )
    .order('source_framework')
    .order('key');
  return (data ?? []) as unknown as FrameworkRow[];
}

export async function listCompetencies(frameworkKey: string): Promise<CompetencyRow[]> {
  if (preview.isPreviewMode()) {
    return preview.q<CompetencyRow>(preview.sqlListCompetencies, [frameworkKey]);
  }
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    .schema('competency')
    .from('competency')
    .select(
      `id, key, name, description, sort_order, status,
       source_framework, source_alignment, external_reference, rationale, retirement_reason,
       domain!inner(key, name,
         standard!inner(key, name, sort_order,
           framework!inner(key)))`,
    )
    // Two rules learned the hard way, both verified against a live PostgREST:
    //  * embeds name the TARGET RELATION, not the FK column. `domain_id` is
    //    rejected for a composite foreign key; `domain` resolves.
    //  * a filter may only reference an embedded resource that is selected.
    .eq('domain.standard.framework.key', frameworkKey)
    .order('sort_order');
  return (data ?? []) as unknown as CompetencyRow[];
}

/** Everything needed to render one competency in full. */
export async function getCompetencyDetail(competencyKey: string) {
  if (preview.isPreviewMode()) {
    const [row] = await preview.q<CompetencyRow>(preview.sqlCompetencyByKey, [competencyKey]);
    if (!row) return null;
    const [indicators, descriptors, targets, evidenceTypes] = await Promise.all([
      preview.q<IndicatorRow>(preview.sqlIndicators, [row.id]),
      preview.q<DescriptorRow>(preview.sqlDescriptors, [row.id]),
      preview.q<TargetRow>(preview.sqlTargets, [row.id]),
      preview.q<{ evidence_type_key: string; guidance: string | null; is_required: boolean }>(
        preview.sqlEvidenceDescriptors,
        [row.id],
      ),
    ]);
    return { competency: row, indicators, descriptors, targets, evidenceTypes };
  }
  const supabase = await dataClient();
  if (!supabase) return null;

  const { data: competency } = await supabase
    .schema('competency')
    .from('competency')
    .select(
      `id, key, name, description, sort_order, status,
       source_framework, source_alignment, external_reference, rationale, retirement_reason,
       domain!inner(key, name, standard!inner(key, name, sort_order))`,
    )
    .eq('key', competencyKey)
    .maybeSingle();

  if (!competency) return null;
  const row = competency as unknown as CompetencyRow;

  const [{ data: indicators }, { data: descriptors }, { data: targets }, { data: evidenceTypes }] =
    await Promise.all([
      supabase
        .schema('competency')
        .from('indicator')
        .select(
          'id, key, statement, sort_order, status, source_framework, source_alignment, external_reference',
        )
        .eq('competency_id', row.id)
        .order('sort_order'),
      supabase
        .schema('competency')
        .from('proficiency_descriptor')
        .select('descriptor, proficiency_level(key, name, ordinal)')
        .eq('competency_id', row.id),
      supabase
        .schema('competency')
        .from('competency_target_detail')
        .select(
          `id, rationale, role_key, requires_leadership, level_key, level_name,
           level_ordinal, teacher_category_name, school_stage_name,
           career_level_name, subject_name`,
        )
        .eq('competency_id', row.id),
      supabase
        .schema('competency')
        .from('evidence_descriptor')
        .select('evidence_type_key, guidance, is_required')
        .eq('competency_id', row.id),
    ]);

  const descriptorRows = ((descriptors ?? []) as unknown as DescriptorRow[]).sort(
    (a, b) => a.proficiency_level.ordinal - b.proficiency_level.ordinal,
  );
  const targetRows = ((targets ?? []) as unknown as TargetRow[]).sort(
    (a, b) => a.level_ordinal - b.level_ordinal,
  );

  return {
    competency: row,
    indicators: (indicators ?? []) as unknown as IndicatorRow[],
    descriptors: descriptorRows,
    targets: targetRows,
    evidenceTypes: (evidenceTypes ?? []) as unknown as {
      evidence_type_key: string;
      guidance: string | null;
      is_required: boolean;
    }[],
  };
}

export interface KpiTemplateRow {
  id: string;
  key: string;
  name: string;
  description: string;
  metric: string;
  unit: string | null;
  direction: string;
  default_target: string | null;
  default_weight: number | null;
  data_source: string;
  frequency: string;
  is_student_outcome_measure: boolean;
  category: { key: string; name: string; sort_order: number };
}

export async function listKpiTemplates(): Promise<KpiTemplateRow[]> {
  if (preview.isPreviewMode()) return preview.q<KpiTemplateRow>(preview.sqlKpiTemplates);
  const supabase = await dataClient();
  if (!supabase) return [];
  const { data } = await supabase
    .schema('kpi')
    .from('template')
    .select(
      `id, key, name, description, metric, unit, direction, default_target, default_weight,
       data_source, frequency, is_student_outcome_measure,
       category!inner(key, name, sort_order)`,
    )
    .eq('status', 'active')
    .order('key');
  return (data ?? []) as unknown as KpiTemplateRow[];
}
