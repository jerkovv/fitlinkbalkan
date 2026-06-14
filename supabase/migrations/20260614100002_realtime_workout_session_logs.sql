-- Realtime na workout_session_logs: ekran "Trening zavrsen" se pretplati na UPDATE
-- reda sesije da kasne metrike sa sata (kalorije/HR, par sekundi posle finish-a)
-- odmah osveze plocice. Vec primenjeno na bazu preko MCP; ovaj fajl je za version control.

ALTER PUBLICATION supabase_realtime ADD TABLE public.workout_session_logs;
