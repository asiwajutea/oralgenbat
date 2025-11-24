import { useState, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomIn, ZoomOut, Download } from "lucide-react";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  pdfUrl: string;
}

export const PDFViewer = ({ pdfUrl }: PDFViewerProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [pageInput, setPageInput] = useState<string>("");
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 2.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

  const handleJumpToPage = () => {
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= numPages) {
      const pageElement = pageRefs.current[pageNum - 1];
      if (pageElement) {
        pageElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      <div className="p-4 border-b border-border bg-background flex items-center justify-between">
        <h2 className="text-lg font-semibold">PDF Document</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="icon" onClick={zoomIn} disabled={scale >= 2.0}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-2" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Go to page:</span>
            <Input
              type="number"
              min="1"
              max={numPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJumpToPage();
                }
              }}
              placeholder="Page #"
              className="w-20 h-9"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleJumpToPage}
              disabled={!pageInput || parseInt(pageInput) < 1 || parseInt(pageInput) > numPages}
            >
              Go
            </Button>
            <span className="text-sm text-muted-foreground">
              of {numPages}
            </span>
          </div>
          <div className="w-px h-6 bg-border mx-2" />
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Download
            </a>
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col items-center gap-2">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center h-full py-20">
                <div className="text-muted-foreground">Loading PDF...</div>
              </div>
            }
            error={
              <div className="flex items-center justify-center h-full py-20">
                <div className="text-destructive">Failed to load PDF document</div>
              </div>
            }
          >
            {Array.from(new Array(numPages), (el, index) => (
              <div 
                key={`page_${index + 1}`} 
                className="mb-4 relative"
                ref={(el) => pageRefs.current[index] = el}
              >
                <div className="absolute top-2 right-2 bg-black/70 text-white px-3 py-1 rounded text-sm font-medium z-10">
                  Page {index + 1} of {numPages}
                </div>
                <div className="overflow-hidden">
                  <Page
                    pageNumber={index + 1}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-lg border border-border"
                  />
                </div>
              </div>
            ))}
          </Document>
        </div>
      </div>
    </div>
  );
};
