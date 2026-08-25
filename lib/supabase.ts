import { createClient } from "@supabase/supabase-js";

// Public Supabase project URL + anon key. Safe to expose client-side:
// Row Level Security restricts this key to read-only access (see migration).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ldwvpxtxnmrvpolwuuny.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxkd3ZweHR4bm1ydnBvbHd1dW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MzYwMTAsImV4cCI6MjEwMzExMjAxMH0.YcIBsq68enO5hyzAyd7vQDtYiMn2LaDVLb6pUaH_F30";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export type TeamSeasonRow = {
  manager_id: number;
  year: number;
  division: string | null;
  draft_slot: string | null;
  final_place: string | null;
  division_place: string | null;
  made_finals: boolean | null;
  regular_season_place: string | null;
  managers: { name: string } | null;
};

export type MatchupAgg = {
  manager_id: number;
  wins: number;
  losses: number;
  points_for: number;
};
