import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomIn, ZoomOut, Download, AlertCircle } from "lucide-react";

// Configure PDF.js worker. The worker is bundled with the app (resolved via
// import.meta.url) instead of being fetched from a third-party CDN, so PDF
// rendering no longer depends on unpkg availability and works offline/in the PWA.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// Approximate rendered height (CSS px) of a US-Letter page at scale 1.0, used
// to size off-screen placeholders so the scrollbar and jump-to-page stay
// accurate before a page has actually rendered.
const ESTIMATED_PAGE_HEIGHT = 850;

interface LazyPdfPageProps {
  pageNumber: number;
  numPages: number;
  scale: number;
  hasError: boolean;
  onLoadError: (pageNumber: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

/**
 * Renders a single PDF page only while it is at (or near) the viewport.
 * Off-screen pages collapse to a lightweight placeholder, so a document with
 * hundreds of pages no longer mounts every page (plus its text/annotation
 * layers) at once. The last measured height is retained so unmounting an
 * off-screen page does not shift the scroll position.
 */
const LazyPdfPage = ({
  pageNumber,
  numPages,
  scale,
  hasError,
  onLoadError,
  setRef,
}: LazyPdfPageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  // Measured height + the scale it was measured at, so placeholders can be
  // scaled to approximate the current zoom level.
  const measuredRef = useRef<{ height: number; scale: number } | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      // Pre-render pages ~1 viewport before they scroll into view for smooth
      // scrolling without rendering the whole document.
      { root: null, rootMargin: "800px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleRenderSuccess = useCallback(() => {
    if (containerRef.current) {
      measuredRef.current = {
        height: containerRef.current.offsetHeight,
        scale,
      };
    }
  }, [scale]);

  const placeholderHeight = measuredRef.current
    ? measuredRef.current.height * (scale / measuredRef.current.scale)
    : ESTIMATED_PAGE_HEIGHT * scale;

  return (
    <div
      key={`page_${pageNumber}`}
      className="mb-4 relative"
      ref={(el) => {
        containerRef.current = el;
        setRef(el);
      }}
    >
      <div className="absolute top-2 right-2 bg-black/70 text-white px-3 py-1 rounded text-sm font-medium z-10">
        Page {pageNumber} of {numPages}
      </div>
      <div className="overflow-hidden">
        {hasError ? (
          <div className="flex flex-col items-center justify-center h-96 bg-muted border border-border shadow-lg">
            <AlertCircle className="h-12 w-12 text-destructive mb-2" />
            <div className="text-sm text-muted-foreground">Failed to load page {pageNumber}</div>
          </div>
        ) : isVisible ? (
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg border border-border"
            onRenderSuccess={handleRenderSuccess}
            loading={
              <div
                className="flex items-center justify-center bg-muted border border-border shadow-lg"
                style={{ height: placeholderHeight }}
              >
                <div className="text-sm text-muted-foreground">Loading page {pageNumber}...</div>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center h-96 bg-muted border border-border shadow-lg">
                <AlertCircle className="h-12 w-12 text-destructive mb-2" />
                <div className="text-sm text-muted-foreground">Error loading page {pageNumber}</div>
              </div>
            }
            onLoadError={() => onLoadError(pageNumber)}
          />
        ) : (
          // Off-screen placeholder keeps the document's total height stable.
          <div
            className="bg-muted/40 border border-border shadow-sm"
            style={{ height: placeholderHeight }}
          />
        )}
      </div>
    </div>
  );
};

interface PDFViewerProps {
  pdfUrl: string;
}

export const PDFViewer = ({ pdfUrl }: PDFViewerProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [pageInput, setPageInput] = useState<string>("");
  const [isDocumentReady, setIsDocumentReady] = useState<boolean>(false);
  const [pageErrors, setPageErrors] = useState<Set<number>>(new Set());
  const [documentKey, setDocumentKey] = useState<number>(0);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isMountedRef = useRef<boolean>(true);

  // Reset state when URL changes - use key to force Document remount
  useEffect(() => {
    isMountedRef.current = true;
    setIsDocumentReady(false);
    setNumPages(0);
    setPageErrors(new Set());
    setDocumentKey(prev => prev + 1);
    
    return () => {
      isMountedRef.current = false;
    };
  }, [pdfUrl]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    if (isMountedRef.current) {
      setNumPages(numPages);
      setPageErrors(new Set());
      // Wait a brief moment for the worker to be fully ready
      setTimeout(() => {
        if (isMountedRef.current) {
          setIsDocumentReady(true);
        }
      }, 150);
    }
  }, []);

  const onPageLoadError = useCallback((pageNumber: number) => {
    console.error(`Failed to load page ${pageNumber}`);
    setPageErrors(prev => new Set(prev).add(pageNumber));
  }, []);

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
            key={`doc_${documentKey}`}
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
            {isDocumentReady && Array.from(new Array(numPages), (el, index) => (
              <LazyPdfPage
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                numPages={numPages}
                scale={scale}
                hasError={pageErrors.has(index + 1)}
                onLoadError={onPageLoadError}
                setRef={(el) => (pageRefs.current[index] = el)}
              />
            ))}
          </Document>
        </div>
      </div>
    </div>
  );
};
