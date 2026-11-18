import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load both root .env and server .env if available
dotenv.config();
dotenv.config({ path: './server/.env' });

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://tbowdfpwhgakbgecdoqg.supabase.co';

function getServiceRoleKey(): string {
  const fallback =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRib3dkZnB3aGdha2JnZWNkb3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTYwMzY2MCwiZXhwIjoyMTA3MTc5NjYwfQ.DCigNCPo65YMZZYCLeLksa86gW2WPWbgqRVHjIcVeSI';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return fallback;
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (payload.role !== 'service_role') {
        return fallback; // Guard against anon key configured by mistake
      }
    }
  } catch {
    return fallback;
  }
  return key;
}

const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey();

// Admin client with service role — for server-side DB operations
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default supabaseAdmin;
