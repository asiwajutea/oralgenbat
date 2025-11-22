-- Add PDF quality scoring columns to interview_metadata table
ALTER TABLE interview_metadata
ADD COLUMN pdf_clarity_score NUMERIC,
ADD COLUMN pdf_handwriting_legibility NUMERIC,
ADD COLUMN pdf_quality_feedback TEXT,
ADD COLUMN pdf_analyzed_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN interview_metadata.pdf_clarity_score IS 'PDF clarity and neatness score (0-100)';
COMMENT ON COLUMN interview_metadata.pdf_handwriting_legibility IS 'Handwriting legibility score (0-100)';
COMMENT ON COLUMN interview_metadata.pdf_quality_feedback IS 'AI-generated feedback on PDF quality';
COMMENT ON COLUMN interview_metadata.pdf_analyzed_at IS 'Timestamp when PDF was analyzed';

-- Add validation triggers for score ranges
CREATE OR REPLACE FUNCTION validate_pdf_scores()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pdf_clarity_score IS NOT NULL AND (NEW.pdf_clarity_score < 0 OR NEW.pdf_clarity_score > 100) THEN
    RAISE EXCEPTION 'pdf_clarity_score must be between 0 and 100';
  END IF;
  
  IF NEW.pdf_handwriting_legibility IS NOT NULL AND (NEW.pdf_handwriting_legibility < 0 OR NEW.pdf_handwriting_legibility > 100) THEN
    RAISE EXCEPTION 'pdf_handwriting_legibility must be between 0 and 100';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_pdf_scores_trigger
BEFORE INSERT OR UPDATE ON interview_metadata
FOR EACH ROW
EXECUTE FUNCTION validate_pdf_scores();