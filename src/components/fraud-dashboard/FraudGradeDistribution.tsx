import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface Props {
  distribution: { A: number; B: number; C: number; D: number };
}

const GRADE_COLORS: Record<string, string> = {
  'A - Safe': 'hsl(142, 76%, 36%)',
  'B - Caution': 'hsl(48, 96%, 53%)',
  'C - High Risk': 'hsl(25, 95%, 53%)',
  'D - Fire Immediately': 'hsl(0, 84%, 60%)',
};

export const FraudGradeDistribution = ({ distribution }: Props) => {
  const data = [
    { name: 'A - Safe', value: distribution.A },
    { name: 'B - Caution', value: distribution.B },
    { name: 'C - High Risk', value: distribution.C },
    { name: 'D - Fire Immediately', value: distribution.D },
  ].filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fraud Grade Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name.split(' - ')[0]}: ${value}`}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={GRADE_COLORS[entry.name]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
