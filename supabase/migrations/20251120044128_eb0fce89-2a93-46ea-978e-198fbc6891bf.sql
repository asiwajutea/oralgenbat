-- Create enum for audit status
CREATE TYPE audit_status AS ENUM ('Pending', 'Audit Passed', 'Audit Failed');

-- Create audits table
CREATE TABLE public.audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status audit_status NOT NULL DEFAULT 'Pending',
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_modified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public access for demo purposes
-- Note: You may want to restrict this to authenticated users later
CREATE POLICY "Allow all operations on audits" 
ON public.audits 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create function to update last_modified timestamp
CREATE OR REPLACE FUNCTION public.update_last_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_audits_last_modified
BEFORE UPDATE ON public.audits
FOR EACH ROW
EXECUTE FUNCTION public.update_last_modified_column();

-- Create storage bucket for PDF files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-pdfs', 'audit-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for PDF uploads
CREATE POLICY "Allow public uploads to audit-pdfs" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'audit-pdfs');

CREATE POLICY "Allow public access to audit-pdfs" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'audit-pdfs');