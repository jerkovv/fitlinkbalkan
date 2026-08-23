import { Capacitor } from '@capacitor/core';
import { createClient, processLock } from '@supabase/supabase-js';

// Publishable key - safe to expose in frontend code.
// RLS policies in Supabase enforce all access control.
const SUPABASE_URL = 'https://iyvvskywmqtudafapxdk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rYwv3BX4sTnL8w0GXmCF1Q_Zpxm0rxE';

/**
 * Brava oko auth operacija.
 *
 * Podrazumevana je navigatorLock (Web Locks API): stiti od dva TAB-a koja
 * istovremeno osvezavaju token. U Capacitor aplikaciji tabova nema - postoji
 * tacno jedan WebView - pa ta brava nista ne dobija, a moze da odmogne: ako
 * WebContent proces zapne (a u logovima se to vidi kao "JS Eval error" i
 * "gpuProcessExited"), zakljucana brava se nikad ne otpusti. auth-js na vecini
 * poziva ceka BEZ ROKA, pa signInWithPassword tada visi zauvek: dugme se vrti,
 * nijedan zahtev ne krene, i u serverskim logovima nema nicega.
 *
 * processLock je obican lanac obecanja u memoriji - isto sto Supabase preporucuje
 * za React Native, i tacno ono sto jednom WebView-u treba. Na webu, gde tabovi
 * stvarno postoje, ostaje navigatorLock.
 */
const lock = Capacitor.isNativePlatform() ? processLock : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(lock ? { lock } : {}),
  },
});
