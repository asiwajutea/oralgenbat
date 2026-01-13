-- Add sub_contractor to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_contractor';