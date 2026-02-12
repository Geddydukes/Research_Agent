import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim() || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env. Copy from Supabase Dashboard → API (anon public key). Restart the frontend after editing .env.'
  );
}

if (!supabaseAnonKey.startsWith('eyJ')) {
  console.error(
    'VITE_SUPABASE_ANON_KEY should be the anon public key (long string starting with eyJ...). Use the "anon" / "public" key from Dashboard → API, not the "service_role" secret.'
  );
}

if (import.meta.env.DEV) {
  console.info('Supabase URL:', supabaseUrl.slice(0, 30) + '...', '| Anon key length:', supabaseAnonKey.length);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
