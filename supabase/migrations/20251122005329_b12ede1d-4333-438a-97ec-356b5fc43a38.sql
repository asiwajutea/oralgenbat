-- Check and fix the interview_metadata triggers
-- The table has 'updated_at' column, not 'last_modified'

-- Drop any existing trigger that might be causing issues
DROP TRIGGER IF EXISTS update_interview_metadata_updated_at ON interview_metadata;
DROP TRIGGER IF EXISTS update_interview_metadata_last_modified ON interview_metadata;

-- Create proper function to update updated_at column
CREATE OR REPLACE FUNCTION update_interview_metadata_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update updated_at on changes
CREATE TRIGGER update_interview_metadata_updated_at_trigger
BEFORE UPDATE ON interview_metadata
FOR EACH ROW
EXECUTE FUNCTION update_interview_metadata_updated_at();