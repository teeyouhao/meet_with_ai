import { supabaseAdmin } from '../utils/supabase.js';
import crypto from 'crypto';

export interface AppUser {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_url?: string | null;
  role: string;
  created_at: string;
  updated_at?: string;
}

let hasAppUsersTable: boolean | null = null;

async function checkAppUsersTable(): Promise<boolean> {
  if (hasAppUsersTable !== null) return hasAppUsersTable;
  try {
    const { error } = await supabaseAdmin.from('app_users').select('id').limit(1);
    if (error && (error.code === 'PGRST205' || error.message.includes('schema cache') || error.message.includes('does not exist'))) {
      hasAppUsersTable = false;
    } else {
      hasAppUsersTable = true;
    }
  } catch {
    hasAppUsersTable = false;
  }
  return hasAppUsersTable;
}

export async function findLegacyProfileByEmail(email: string): Promise<{ id: string; full_name?: string } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .ilike('email', email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const useAppUsers = await checkAppUsersTable();

  if (useAppUsers) {
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as AppUser;
    }
  }

  // Resilient fallback: lookup in audit_events where event_type = 'app_user'
  try {
    const { data, error } = await supabaseAdmin
      .from('audit_events')
      .select('*')
      .eq('event_type', 'app_user');

    if (!error && data) {
      const match = data.find((row: any) => {
        const meta = row.metadata || {};
        return String(meta.email || '').toLowerCase() === normalizedEmail;
      });

      if (match) {
        const meta = match.metadata || {};
        return {
          id: meta.id || match.id,
          email: meta.email,
          password_hash: meta.password_hash,
          full_name: meta.full_name || '',
          avatar_url: meta.avatar_url || null,
          role: meta.role || 'user',
          created_at: match.created_at
        };
      }
    }
  } catch (err) {
    console.error('[userService] Fallback search error:', err);
  }

  return null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const useAppUsers = await checkAppUsersTable();

  if (useAppUsers) {
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as AppUser;
    }
  }

  // Fallback lookup in audit_events
  try {
    const { data, error } = await supabaseAdmin
      .from('audit_events')
      .select('*')
      .eq('event_type', 'app_user');

    if (!error && data) {
      const match = data.find((row: any) => row.metadata?.id === id || row.actor_id === id || row.id === id);
      if (match) {
        const meta = match.metadata || {};
        return {
          id: meta.id || match.id,
          email: meta.email,
          password_hash: meta.password_hash,
          full_name: meta.full_name || '',
          avatar_url: meta.avatar_url || null,
          role: meta.role || 'user',
          created_at: match.created_at
        };
      }
    }
  } catch (err) {
    console.error('[userService] Fallback findUserById error:', err);
  }

  return null;
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  fullName: string;
  role?: string;
  id?: string;
}): Promise<AppUser> {
  const normalizedEmail = params.email.trim().toLowerCase();
  
  // Link to existing legacy profile ID if user was previously in Supabase auth
  const legacyProfile = await findLegacyProfileByEmail(normalizedEmail);
  const userId = params.id || legacyProfile?.id || crypto.randomUUID();
  const fullName = params.fullName || legacyProfile?.full_name || '';
  
  const now = new Date().toISOString();
  const role = params.role || 'user';
  const useAppUsers = await checkAppUsersTable();

  if (useAppUsers) {
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .insert({
        id: userId,
        email: normalizedEmail,
        password_hash: params.passwordHash,
        full_name: fullName,
        role,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (!error && data) {
      return data as AppUser;
    }
    // If insert failed, proceed to fallback
  }

  // Fallback storage in audit_events (actor_id set to null to avoid foreign key constraints)
  const { error: auditError } = await supabaseAdmin
    .from('audit_events')
    .insert({
      actor_id: null,
      document_id: null,
      event_type: 'app_user',
      metadata: {
        id: userId,
        email: normalizedEmail,
        password_hash: params.passwordHash,
        full_name: fullName,
        role,
        created_at: now
      }
    })
    .select()
    .single();

  if (auditError) {
    throw new Error(`Failed to create user record: ${auditError.message}`);
  }

  return {
    id: userId,
    email: normalizedEmail,
    password_hash: params.passwordHash,
    full_name: fullName,
    avatar_url: null,
    role,
    created_at: now
  };
}
