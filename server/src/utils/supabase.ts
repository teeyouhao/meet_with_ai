import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load both root .env and server .env if available
dotenv.config();
dotenv.config({ path: './server/.env' });

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://tbowdfpwhgakbgecdoqg.supabase.co';

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRib3dkZnB3aGdha2JnZWNkb3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTYwMzY2MCwiZXhwIjoyMTA3MTc5NjYwfQ.DCigNCPo65YMZZYCLeLksa86gW2WPWbgqRVHjIcVeSI';

// Admin client with service role — for server-side DB operations
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default supabaseAdmin;
