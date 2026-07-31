-- send_message_to_athlete i send_message_to_trainer su pisali direktno u
-- notifications, mimo messages tabele - to je bio "dva paralelna sistema"
-- bag. Klijent je danas prebacen na direktan insert u messages, ova dva
-- RPC-a vise nemaju nijednog pozivaoca (potvrdjeno grep-om).
DROP FUNCTION IF EXISTS public.send_message_to_athlete(uuid, text);
DROP FUNCTION IF EXISTS public.send_message_to_trainer(text);
