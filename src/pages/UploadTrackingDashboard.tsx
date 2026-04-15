import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useUploadTrackingSummary, useUploadTrackingTrend } from "@/hooks/useUploadTracking";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Upload, FileText, Users, CalendarIcon, ArrowUpDown, TrendingUp, AlertTriangle } from "lucide-react";
import { format, subDays, subWeeks, startOfDay, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

type Period = "7d" | "13w" | "365d" | "custom";

const UploadTrackingDashboard = () => {
  const [period, setPeriod] = useState<Period>("7d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [sortField, setSortField] = useState<string>("period");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: summary, isLoading: summaryLoading } = useUploadTrackingSummary();

  const now = useMemo(() => new Date(), []);
  const { startDate, endDate, granularity } = useMemo(() => {
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    switch (period) {
      case "7d":
        return { startDate: subDays(now, 7), endDate: tomorrow, granularity: "day" as const };
      case "13w":
        return { startDate: subWeeks(now, 13), endDate: tomorrow, granularity: "week" as const };
      case "365d":
        return { startDate: subDays(now, 365), endDate: tomorrow, granularity: "week" as const };
      case "custom":
        return {
          startDate: customRange.from || subDays(now, 7),
          endDate: customRange.to || tomorrow,
          granularity: "day" as const,
        };
    }
  }, [period, customRange, now]);

  const { data: trendData, isLoading: trendLoading } = useUploadTrackingTrend(startDate, endDate, granularity);

  const chartData = useMemo(() => {
    if (!trendData) return [];
    return trendData.map((d) => ({
      period: granularity === "day" ? format(new Date(d.period_start), "MMM dd") : format(new Date(d.period_start), "MMM dd"),
      "With Metadata": Number(d.interviews_with_metadata),
      "Without Metadata": Number(d.interviews_without_metadata),
      "Total Interviews": Number(d.interviews_uploaded),
      "Total Names": Number(d.total_names),
    }));
  }, [trendData, granularity]);

  const sortedTableData = useMemo(() => {
    if (!trendData) return [];
    const sorted = [...trendData].sort((a, b) => {
      const aVal = sortField === "period" ? a.period_start : Number((a as any)[sortField]);
      const bVal = sortField === "period" ? b.period_start : Number((b as any)[sortField]);
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [trendData, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SummaryCard = ({ data, icon }: { data?: { label: string; interviews: number; withMetadata: number; withoutMetadata: number; totalNames: number }; icon: React.ReactNode }) => {
    if (summaryLoading || !data) {
      return (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-muted-foreground truncate">{data.label}</p>
              <h3 className="text-2xl sm:text-3xl font-bold mt-1">{data.interviews.toLocaleString()}</h3>
              <p className="text-xs text-muted-foreground mt-1">interviews</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {data.totalNames.toLocaleString()} names
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-green-600 dark:text-green-400">{data.withMetadata} with metadata</span>
                {data.withoutMetadata > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    {data.withoutMetadata} missing
                  </span>
                )}
              </div>
            </div>
            <div className="p-2 sm:p-3 bg-primary/10 rounded-lg text-primary shrink-0">
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Compute comparison: current period vs previous period
  const comparisonData = useMemo(() => {
    if (!trendData || trendData.length === 0) return null;
    const totalInterviews = trendData.reduce((s, d) => s + Number(d.interviews_uploaded), 0);
    const totalNames = trendData.reduce((s, d) => s + Number(d.total_names), 0);
    return { totalInterviews, totalNames };
  }, [trendData]);

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Upload Tracking</h1>
          <p className="text-sm text-muted-foreground">Track interview and name upload volumes over time</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard data={summary?.today} icon={<Upload className="h-5 w-5" />} />
        <SummaryCard data={summary?.thisWeek} icon={<CalendarIcon className="h-5 w-5" />} />
        <SummaryCard data={summary?.last13Weeks} icon={<TrendingUp className="h-5 w-5" />} />
        <SummaryCard data={summary?.last365Days} icon={<Users className="h-5 w-5" />} />
      </div>

      {/* Period Selector */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
            <TabsTrigger value="7d" className="text-xs sm:text-sm">7 Days</TabsTrigger>
            <TabsTrigger value="13w" className="text-xs sm:text-sm">13 Weeks</TabsTrigger>
            <TabsTrigger value="365d" className="text-xs sm:text-sm">365 Days</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs sm:text-sm">Custom</TabsTrigger>
          </TabsList>
        </Tabs>

        {period === "custom" && (
          <div className="flex gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {customRange.from ? format(customRange.from, "MMM dd, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={customRange.from} onSelect={(d) => setCustomRange((p) => ({ ...p, from: d }))} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {customRange.to ? format(customRange.to, "MMM dd, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={customRange.to} onSelect={(d) => setCustomRange((p) => ({ ...p, to: d }))} />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Upload Volume Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Upload Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-[250px] sm:h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                  <Legend />
                  <Bar dataKey="With Metadata" stackId="a" fill="hsl(142, 76%, 36%)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Without Metadata" stackId="a" fill="hsl(48, 96%, 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Interview Trend Line Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Interview Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-[250px] sm:h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                  <Legend />
                  <Line type="monotone" dataKey="Total Interviews" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Names per Period Area Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Names Uploaded per Period</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-[250px] sm:h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                  <Area type="monotone" dataKey="Total Names" stroke="hsl(262, 83%, 58%)" fill="hsl(262, 83%, 58%)" fillOpacity={0.2} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Period Comparison */}
      {comparisonData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Period Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Interviews</p>
                <p className="text-xl sm:text-2xl font-bold">{comparisonData.totalInterviews.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Names</p>
                <p className="text-xl sm:text-2xl font-bold">{comparisonData.totalNames.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg per {granularity === "day" ? "Day" : "Week"}</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {chartData.length > 0 ? Math.round(comparisonData.totalInterviews / chartData.length).toLocaleString() : 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Names per {granularity === "day" ? "Day" : "Week"}</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {chartData.length > 0 ? Math.round(comparisonData.totalNames / chartData.length).toLocaleString() : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => handleSort("period")}>
                      Period <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => handleSort("interviews_uploaded")}>
                      Interviews <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => handleSort("interviews_with_metadata")}>
                      With Metadata <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => handleSort("interviews_without_metadata")}>
                      Missing <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => handleSort("total_names")}>
                      Names <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sortedTableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No upload data for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedTableData.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="text-xs sm:text-sm font-medium">
                        {format(new Date(row.period_start), granularity === "day" ? "MMM dd, yyyy" : "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm">{Number(row.interviews_uploaded).toLocaleString()}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs sm:text-sm text-green-600 dark:text-green-400">
                        {Number(row.interviews_with_metadata).toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs sm:text-sm">
                        {Number(row.interviews_without_metadata) > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {Number(row.interviews_without_metadata).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm font-medium">{Number(row.total_names).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UploadTrackingDashboard;
