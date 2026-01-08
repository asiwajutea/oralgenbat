-- Add new roles to app_role enum (must be separate transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'data_entry_clerk';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'quality_assurance_manager';