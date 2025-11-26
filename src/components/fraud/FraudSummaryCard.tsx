import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";

interface FraudSummaryCardProps {
  summary: string | null;
  concerningPatterns: string[];
  isLoading: boolean;
}

export const FraudSummaryCard = ({ summary, concerningPatterns, isLoading }: FraudSummaryCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          AI-Powered Fraud Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Analyzing fraud indicators...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-foreground whitespace-pre-line">{summary}</p>
            </div>
            
            {concerningPatterns.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-semibold mb-2">Concerning Patterns Detected:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {concerningPatterns.map((pattern, idx) => (
                      <li key={idx}>{pattern}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};