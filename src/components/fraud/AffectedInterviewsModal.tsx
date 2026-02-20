import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter, Cell } from "recharts";
import { format } from "date-fns";

interface AffectedInterview {
  id: string;
  file_name: string;
  date: Date;
  value: number;
  label?: string;
  status?: string;
}

interface AffectedInterviewsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  interviews: AffectedInterview[];
  chartType: 'duration' | 'names' | 'boundary';
  threshold?: number;
  thresholdLabel?: string;
}

export const AffectedInterviewsModal = ({
  open,
  onOpenChange,
  title,
  interviews,
  chartType,
  threshold,
  thresholdLabel,
}: AffectedInterviewsModalProps) => {
  const chartData = interviews.map((i, idx) => ({
    name: i.file_name?.replace('.pdf', '').slice(-15) || `#${idx + 1}`,
    value: i.value,
    date: format(i.date, 'MMM d'),
    fullName: i.file_name?.replace('.pdf', ''),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-sm">
              {interviews.length} affected interview{interviews.length !== 1 ? 's' : ''}
            </Badge>
            {threshold && thresholdLabel && (
              <span className="text-sm text-muted-foreground">Threshold: {thresholdLabel}</span>
            )}
          </div>

          {/* Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'names' ? (
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" name="Date" />
                  <YAxis dataKey="value" name="Names" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(val: number) => [`${val} names`, 'Total Names']} />
                  <Scatter data={chartData} fill="hsl(var(--destructive))">
                    {chartData.map((_, index) => (
                      <Cell key={index} fill={index % 2 === 0 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip
                    formatter={(val: number) => [
                      chartType === 'duration' ? `${(val / 60).toFixed(1)} min` : val,
                      chartType === 'duration' ? 'Duration' : 'Value'
                    ]}
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  {threshold && (
                    <ReferenceLine y={threshold} stroke="red" strokeDasharray="3 3" label={thresholdLabel} />
                  )}
                  <Bar dataKey="value" fill="hsl(var(--destructive))" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="rounded-md border max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Interview ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">
                    {chartType === 'duration' ? 'Duration' : chartType === 'names' ? 'Total Names' : 'Value'}
                  </TableHead>
                  {interviews[0]?.status && <TableHead>Status</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview, idx) => (
                  <TableRow key={interview.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium text-sm truncate max-w-[200px]" title={interview.file_name}>
                      {interview.file_name?.replace('.pdf', '') || '-'}
                    </TableCell>
                    <TableCell>{format(interview.date, 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right font-medium">
                      {chartType === 'duration' ? `${(interview.value / 60).toFixed(1)} min` : interview.value}
                    </TableCell>
                    {interview.status && <TableCell><Badge variant="outline" className="text-xs">{interview.status}</Badge></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
