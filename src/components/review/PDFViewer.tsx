import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PDFViewerProps {
  pdfUrl: string;
}

export const PDFViewer = ({ pdfUrl }: PDFViewerProps) => {
  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold">PDF Document</h2>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          src={pdfUrl}
          className="w-full h-full"
          title="PDF Document Viewer"
        />
      </div>
    </div>
  );
};
