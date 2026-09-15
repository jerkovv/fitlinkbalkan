-- Zone treninga iz aplikacije: Zona 1 sad obuhvata sve ispod Zone 2, i puls ispod 50%
-- maksimalnog. Ranije se to vreme nigde nije brojalo, pa lagan trening (npr. puls
-- 70-110 uz max 190) nije imao nijednu zonu i sekcija posle treninga se nije ni
-- pojavila. Isto kao Apple Watch: Zona 1 nema donju granicu (min_bpm 0, prikaz "do 114").

CREATE OR REPLACE FUNCTION public._compute_hr_zones(p_hr_series jsonb, p_max_hr integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with names(zone, zone_name) as (
    values (1,'Lagano'),(2,'Aerobno'),(3,'Tempo'),(4,'Anaerobno'),(5,'Maksimalno')
  ),
  bounds as (
    select n.zone, n.zone_name,
           case when n.zone = 1 then 0
                else round((coalesce(p_max_hr,0) * (0.4 + 0.1*n.zone))::numeric)::int end as min_bpm,
           round((coalesce(p_max_hr,0) * (0.5 + 0.1*n.zone))::numeric)::int as max_bpm
    from names n
  ),
  samples as (
    select (elem->>0)::numeric as t,
           (elem->>1)::numeric as hr
    from jsonb_array_elements(
           case when jsonb_typeof(p_hr_series) = 'array' then p_hr_series else '[]'::jsonb end
         ) as e(elem)
    where jsonb_typeof(elem) = 'array'
      and (elem->>1) ~ '^[0-9]+(\.[0-9]+)?$'
      and (elem->>0) ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  durated as (
    select hr,
           greatest(0, least(coalesce(lead(t) over (order by t) - t, 2), 30)) as dur
    from samples
  ),
  zoned as (
    select case
             when coalesce(p_max_hr,0) <= 0 then 0
             when hr >= round((p_max_hr*0.9)::numeric) then 5
             when hr >= round((p_max_hr*0.8)::numeric) then 4
             when hr >= round((p_max_hr*0.7)::numeric) then 3
             when hr >= round((p_max_hr*0.6)::numeric) then 2
             when hr > 0 then 1
             else 0
           end as zone,
           dur
    from durated
  ),
  agg as (
    select zone, sum(dur)::int as secs
    from zoned
    where zone between 1 and 5
    group by zone
  )
  select jsonb_agg(
           jsonb_build_object(
             'zone', b.zone,
             'zone_name', b.zone_name,
             'min_bpm', b.min_bpm,
             'max_bpm', b.max_bpm,
             'seconds_in_zone', coalesce(a.secs, 0)
           ) order by b.zone
         )
  from bounds b
  left join agg a on a.zone = b.zone;
$function$;
