-- Trener — podaci za uplatu na račun (Srbija)
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS bank_recipient text,
  ADD COLUMN IF NOT EXISTS bank_account   text,
  ADD COLUMN IF NOT EXISTS bank_name      text,
  ADD COLUMN IF NOT EXISTS bank_model     text,
  ADD COLUMN IF NOT EXISTS bank_reference text,
  ADD COLUMN IF NOT EXISTS bank_purpose   text;
