-- ===========================================================================
-- 0028 — Guard: a verified level must come from the expected level's scale
-- ===========================================================================
-- A school holds more than one proficiency scale: its own five-point operating
-- scale, and the three-point NPST reference scale recorded in Stage 2. Looking
-- up a level by ordinal alone therefore matches whichever scale comes first.
--
-- That is not hypothetical — the Stage 3 reassessment action did exactly this
-- and recorded "Expert Teacher" (NPST ordinal 3) where "Proficient" (school
-- ordinal 3) was meant. The application is fixed, but the database should not
-- depend on the application getting it right: a competency's verified and
-- expected levels are only comparable if they share a scale.
-- ===========================================================================

create or replace function assessment.enforce_level_scale_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_verified_scale uuid;
  v_expected_scale uuid;
begin
  select scale_id into v_verified_scale
  from competency.proficiency_level where id = new.verified_level_id;
  select scale_id into v_expected_scale
  from competency.proficiency_level where id = new.expected_level_id;

  if v_verified_scale is distinct from v_expected_scale then
    raise exception
      'Verified and expected levels belong to different proficiency scales. They '
      'are not comparable, so the gap would be meaningless.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger enforce_level_scale_consistency
  before insert on assessment.verified_competency
  for each row execute function assessment.enforce_level_scale_consistency();
