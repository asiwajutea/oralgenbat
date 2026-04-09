import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
}

export const AuditPagination = ({
  currentPage,
  totalPages,
  totalCount,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: AuditPaginationProps) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalCount);

  // Generate page numbers to display (compact: 1, 2, ..., last)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 4) {
      // Show all pages if 4 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage <= 2) {
        // Near start: 1, 2, ..., last
        pages.push(2, "ellipsis", totalPages);
      } else if (currentPage >= totalPages - 1) {
        // Near end: 1, ..., last-1, last
        pages.push("ellipsis", totalPages - 1, totalPages);
      } else {
        // Middle: 1, ..., current, ..., last
        pages.push("ellipsis", currentPage, "ellipsis", totalPages);
      }
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {startItem}-{endItem} of {totalCount} results
        </p>
        <Select
          value={itemsPerPage.toString()}
          onValueChange={(value) => onItemsPerPageChange(Number(value))}
        >
          <SelectTrigger className="w-[110px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 / page</SelectItem>
            <SelectItem value="25">25 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Pagination className="mx-0 flex-1 justify-end">
        <PaginationContent className="flex-wrap">
          <PaginationItem>
            <PaginationPrevious
              onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>

          {pageNumbers.map((page, index) => (
            <PaginationItem key={`page-${index}`}>
              {page === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  onClick={() => onPageChange(page as number)}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};
