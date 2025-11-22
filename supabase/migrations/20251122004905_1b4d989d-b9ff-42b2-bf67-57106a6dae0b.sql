-- Fix search_path for validate_pdf_scores function
CREATE OR REPLACE FUNCTION validate_pdf_scores()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pdf_clarity_score IS NOT NULL AND (NEW.pdf_clarity_score < 0 OR NEW.pdf_clarity_score > 100) THEN
    RAISE EXCEPTION 'pdf_clarity_score must be between 0 and 100';
  END IF;
  
  IF NEW.pdf_handwriting_legibility IS NOT NULL AND (NEW.pdf_handwriting_legibility < 0 OR NEW.pdf_handwriting_legibility > 100) THEN
    RAISE EXCEPTION 'pdf_handwriting_legibility must be between 0 and 100';
  END IF;
  
  RETURN NEW;
END;
$$;