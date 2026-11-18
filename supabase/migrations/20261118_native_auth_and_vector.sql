-- MeetWithAI: Native TypeScript Auth & Semantic Vector Memory Migration
-- Run this in your Supabase SQL Editor if full DDL migration permissions are available.

-- 1. Native Application Users Table (Replaces Supabase GoTrue Auth)
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON public.app_users(lower(email));

-- 2. Semantic Vector Memory Extension & Table (Deep Intelligence)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.meeting_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID,
  chunk_text TEXT NOT NULL,
  chunk_type TEXT NOT NULL DEFAULT 'summary', -- 'summary', 'key_point', 'decision', 'action_item', 'transcript'
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meeting_embeddings_meeting ON public.meeting_embeddings(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_embeddings_user ON public.meeting_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_embeddings_type ON public.meeting_embeddings(chunk_type);

-- 3. Semantic Memory Match RPC Function (pgvector Cosine Distance)
CREATE OR REPLACE FUNCTION match_meeting_memory(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 8,
  filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  meeting_id UUID,
  chunk_text TEXT,
  chunk_type TEXT,
  similarity float,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.meeting_id,
    me.chunk_text,
    me.chunk_type,
    1 - (me.embedding <=> query_embedding) AS similarity,
    me.metadata
  FROM public.meeting_embeddings me
  WHERE (filter_user_id IS NULL OR me.user_id = filter_user_id)
    AND (1 - (me.embedding <=> query_embedding)) >= match_threshold
  ORDER BY me.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 4. Enable RLS and Permissive Policies for Native Auth Services
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow service role full management
DROP POLICY IF EXISTS "Service role full access app_users" ON public.app_users;
CREATE POLICY "Service role full access app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access meeting_embeddings" ON public.meeting_embeddings;
CREATE POLICY "Service role full access meeting_embeddings" ON public.meeting_embeddings FOR ALL USING (true) WITH CHECK (true);
