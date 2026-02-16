import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches all rows from a table, bypassing the default 1000-row limit.
 * Uses batched .range() calls.
 */
export async function fetchAllRows(
  table: string,
  select: string,
  filters?: (query: any) => any
): Promise<any[]> {
  const batchSize = 1000;
  let allRows: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = (supabase.from as any)(table).select(select).range(from, from + batchSize - 1);
    if (filters) {
      query = filters(query);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data) allRows = [...allRows, ...data];
    hasMore = data?.length === batchSize;
    from += batchSize;
  }

  return allRows;
}
