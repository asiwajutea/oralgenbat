import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Users, CheckCircle, AlertTriangle } from "lucide-react";

const PaymentStatsCards = () => {
  const { user } = useAuth();

  const { data: paymentStats = { assigned: 0, paid: 0, assignedNotPaid: 0 } } = useQuery({
    queryKey: ["home-payment-stats"],
    queryFn: async () => {
      const { count: paidCount } = await supabase
        .from("payment_records")
        .select("*", { count: "exact", head: true });

      const { count: assignedCount } = await supabase
        .from("interview_assignments")
        .select("*", { count: "exact", head: true });

      return {
        assigned: assignedCount || 0,
        paid: paidCount || 0,
        assignedNotPaid: Math.max(0, (assignedCount || 0) - (paidCount || 0)),
      };
    },
    enabled: !!user?.id,
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Assigned to Data Entry</p>
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{paymentStats.assigned}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Paid</p>
            <p className="text-lg sm:text-2xl font-bold text-green-600">{paymentStats.paid}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Assigned, Not Paid</p>
            <p className="text-lg sm:text-2xl font-bold text-amber-600">{paymentStats.assignedNotPaid}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentStatsCards;
