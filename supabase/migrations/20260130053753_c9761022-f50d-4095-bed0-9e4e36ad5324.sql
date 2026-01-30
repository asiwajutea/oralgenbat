-- Create payment_records table for tracking invoice payments
CREATE TABLE public.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  contractor_name TEXT,
  vendor_id TEXT,
  
  -- Interview reference
  folder_name TEXT NOT NULL,
  interview_id TEXT,
  audit_id UUID REFERENCES public.audits(id),
  
  -- Payment details
  payment_type TEXT NOT NULL CHECK (payment_type IN ('new_payment', 'addition', 'deduction')),
  names_count INTEGER NOT NULL,
  pay_rate DECIMAL(10,4),
  amount DECIMAL(10,2),
  
  -- Journey tracking
  journey_status TEXT DEFAULT 'payment_received',
  booklet_printed_at TIMESTAMP WITH TIME ZONE,
  booklet_received_at TIMESTAMP WITH TIME ZONE,
  booklet_delivered_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  invoice_file_url TEXT,
  
  -- Prevent duplicate entries
  UNIQUE(invoice_number, folder_name, payment_type)
);

-- Enable Row Level Security
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Approved users can view payment records"
  ON public.payment_records
  FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins can manage payment records"
  ON public.payment_records
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Contractors can insert payment records"
  ON public.payment_records
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'contractor'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Contractors can update journey status"
  ON public.payment_records
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'contractor'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Create index for faster lookups
CREATE INDEX idx_payment_records_folder_name ON public.payment_records(folder_name);
CREATE INDEX idx_payment_records_audit_id ON public.payment_records(audit_id);
CREATE INDEX idx_payment_records_invoice_number ON public.payment_records(invoice_number);
CREATE INDEX idx_payment_records_payment_type ON public.payment_records(payment_type);