import { Loader2 } from "lucide-react";

/**
 * Fallback shown while a lazily-loaded route chunk is being fetched.
 * Mirrors the spinner used by the route guards for visual consistency.
 */
export const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export default PageLoader;
