-- Nova misicna grupa "vrat". Vezbe za vrat su do sad stajale pod "core", pa ih
-- trener nije nalazio. Premestanje vezbi je u sledecoj migraciji: Postgres ne
-- dozvoljava upotrebu nove enum vrednosti u istoj transakciji u kojoj je dodata.
alter type public.muscle_group add value if not exists 'vrat' after 'listovi';
