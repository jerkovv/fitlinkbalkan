import { createClient } from '@supabase/supabase-js';

// Publishable key — safe to expose in frontend code.
// RLS policies in Supabase enforce all access control.
const SUPABASE_URL = 'https://iyvvskywmqtudafapxdk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rYwv3BX4sTnL8w0GXmCF1Q_Zpxm0rxE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
