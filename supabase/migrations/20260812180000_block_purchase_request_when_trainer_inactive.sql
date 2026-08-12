-- Vezbac ne moze da posalje zahtev za clanarinu dok njegov trener nema aktivnu
-- FitLink pretplatu.
--
-- Bez ovoga zahtev ode "u prazno": trener ga ne moze potvrditi (confirm ima branu),
-- pa vezbac ceka, a u najgorem slucaju plati gotovinom za nesto sto ne moze da se
-- aktivira.
--
-- Ovo NE pravi zamku: blokada zavisi od TRENEROVE pretplate, a ne od vezbaceve
-- clanarine. Izlaz je u trenerovim rukama - cim obnovi, vezbac normalno salje
-- zahtev. (Kad vezbacu istekne SOPSTVENA clanarina a trener je aktivan, zahtev i
-- dalje prolazi - to mu je jedini put nazad.)
--
-- Guard se ubacuje programski, iz pg_get_functiondef, da se telo funkcije ne
-- prepisuje rucno. Idempotentno.
do $$
declare
  def text;
  newdef text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='request_membership_purchase';

  if def is null then
    raise exception 'request_membership_purchase ne postoji';
  end if;

  if position('my_trainer_is_active' in def) > 0 then
    return;
  end if;

  newdef := regexp_replace(
    def,
    '(\n[ \t]*BEGIN[ \t]*\n)',
    E'\\1  IF NOT public.my_trainer_is_active() THEN\n'
    || E'    RAISE EXCEPTION ''Trener trenutno nije aktivan.'' USING errcode = ''P0001'';\n'
    || E'  END IF;\n',
    'i'
  );

  if newdef = def then
    raise exception 'Nije nadjen spoljasnji BEGIN u request_membership_purchase';
  end if;

  execute newdef;
end $$;
