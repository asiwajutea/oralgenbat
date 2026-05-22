import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import jsPDF from 'jspdf';

// Set up PDF.js worker
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const TARGET_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
const SIZE_THRESHOLD = 1.2 * 1024 * 1024; // 1.2 MB

export const shouldCompressPdf = (file: File): boolean => {
  return file.size > SIZE_THRESHOLD;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const compressPdf = async (
  file: File,
  onProgress?: (message: string) => void
): Promise<File> => {
  onProgress?.('Loading PDF...');

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await getDocument({ data: arrayBuffer }).promise;
  const numPages = pdfDoc.numPages;

  // Try different quality levels until we get under target size
  const qualityLevels = [0.75, 0.6, 0.5, 0.4, 0.3];
  
  let lastValidResult: File | null = null;

  qualityLoop: for (const quality of qualityLevels) {
    onProgress?.(`Compressing (quality ${Math.round(quality * 100)}%)...`);

    // Render first page to get dimensions
    const firstPage = await pdfDoc.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    
    // Calculate scale to keep reasonable resolution while compressing
    const maxDimension = 1600; // pixels
    const scale = Math.min(
      maxDimension / firstViewport.width,
      maxDimension / firstViewport.height,
      1.5 // Don't upscale beyond 1.5x
    );

    const pdf = new jsPDF({
      orientation: firstViewport.width > firstViewport.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [firstViewport.width, firstViewport.height],
    });

    let pagesAdded = 0;
    let failed = false;
    for (let i = 1; i <= numPages; i++) {
      onProgress?.(`Compressing page ${i}/${numPages}...`);

      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

        const imgData = canvas.toDataURL('image/jpeg', quality);

        const pageViewport = page.getViewport({ scale: 1 });
        if (i > 1) {
          pdf.addPage(
            [pageViewport.width, pageViewport.height],
            pageViewport.width > pageViewport.height ? 'landscape' : 'portrait',
          );
        }

        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          pageViewport.width,
          pageViewport.height,
          undefined,
          'FAST',
        );
        pagesAdded += 1;

        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        console.warn(`compressPdf: page ${i} failed at quality ${quality}`, err);
        failed = true;
        break;
      }
    }

    if (failed || pagesAdded !== numPages) {
      // Drop this attempt entirely so we never produce a truncated PDF
      continue qualityLoop;
    }

    const blob = pdf.output('blob');

    // Verify the compressed output really has every page before accepting it
    try {
      const verifyBuf = await blob.arrayBuffer();
      const verifyDoc = await getDocument({ data: verifyBuf }).promise;
      if (verifyDoc.numPages !== numPages) {
        console.warn(`compressPdf: verification mismatch (${verifyDoc.numPages} vs ${numPages}) at quality ${quality}`);
        continue qualityLoop;
      }
    } catch (err) {
      console.warn('compressPdf: verification failed', err);
      continue qualityLoop;
    }

    lastValidResult = new File([blob], file.name, { type: 'application/pdf' });

    if (blob.size <= TARGET_SIZE_BYTES) {
      onProgress?.('Compression complete');
      return lastValidResult;
    }
  }

  if (lastValidResult) {
    onProgress?.('Compression complete (size above target)');
    return lastValidResult;
  }
  // Compression could not safely reproduce every page — keep the original to avoid data loss
  console.warn('compressPdf: falling back to original file to preserve all pages');
  return file;
};
