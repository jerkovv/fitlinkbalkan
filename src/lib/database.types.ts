// Database types matching supabase/migrations/0001_init.sql
export type AppRole = 'trainer' | 'athlete' | 'admin';
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'stripe';
export type MembershipStatus = 'active' | 'paused' | 'expired' | 'cancelled';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';
export type GoalType = 'lose_weight' | 'gain_muscle' | 'endurance' | 'mobility' | 'general';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  date_of_birth: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trainer {
  id: string;
  bio: string | null;
  specialties: string[];
  city: string | null;
  hourly_rate: number | null;
  invite_code: string | null;
  created_at: string;
}

export interface Athlete {
  id: string;
  trainer_id: string | null;
  goal: GoalType;
  height_cm: number | null;
  weight_kg: number | null;
  notes: string | null;
  joined_at: string;
}

export interface Invite {
  id: string;
  trainer_id: string;
  code: string;
  status: InviteStatus;
  used_by: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Program {
  id: string;
  trainer_id: string;
  athlete_id: string | null;
  title: string;
  description: string | null;
  weeks: number;
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: string;
  program_id: string;
  day_index: number;
  title: string;
  notes: string | null;
  position: number;
}

export interface Exercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  tempo: string | null;
  video_url: string | null;
  position: number;
}

export interface ExerciseLog {
  id: string;
  exercise_id: string;
  athlete_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  performed_at: string;
}

export interface Session {
  id: string;
  trainer_id: string;
  athlete_id: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  athlete_id: string;
  trainer_id: string;
  plan_name: string;
  price: number;
  sessions_total: number | null;
  sessions_used: number;
  status: MembershipStatus;
  starts_on: string;
  ends_on: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  membership_id: string | null;
  trainer_id: string;
  athlete_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
}

export interface ProgressEntry {
  id: string;
  athlete_id: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  photo_url: string | null;
  note: string | null;
  recorded_on: string;
  created_at: string;
}
