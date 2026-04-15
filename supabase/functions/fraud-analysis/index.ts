import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Fraud analysis edge function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fraudProfile, comparisonStats } = await req.json();
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemPrompt = `You are a fraud detection analyst reviewing agent interview performance data.

IMPORTANT: Write in plain text only. Do NOT use any markdown formatting (no #, **, ***, or bullet symbols like - or *). Use simple paragraph breaks and numbered lists with "1." format only.

Analyze the provided data and generate:
1. A clear, professional summary explaining detected fraudulent behaviors in 2-3 paragraphs
2. A list of 3-5 concerning patterns (use numbered format: 1. Pattern one, 2. Pattern two)
3. A comprehensive action plan with immediate steps, short-term recommendations, and escalation guidance
4. A brief risk assessment

Be direct but professional. Use simple, understandable language. Focus on data-driven insights.`;

    const userPrompt = `Analyze this agent's fraud profile:

Agent: ${fraudProfile.interviewer_code} (${fraudProfile.interviewer_name || 'Unknown'})
Contractor: ${fraudProfile.contractor_id}
Total Interviews (13 weeks): ${fraudProfile.total_interviews}

FRAUD GRADE: ${fraudProfile.fraudGrade} (${fraudProfile.classification})
Overall Fraud Score: ${fraudProfile.overallFraudScore.toFixed(1)}/100

FRAUD INDICATORS:

1. Interview Intervals:
   - Close intervals flagged: ${fraudProfile.indicators.closeIntervals.length}
   - Score: ${fraudProfile.indicators.intervalFraudScore.toFixed(1)}/100
   ${fraudProfile.indicators.closeIntervals.length > 0 ? `- Problematic intervals: ${fraudProfile.indicators.closeIntervals.slice(0, 3).map((ci: any) => `${ci.minutesApart.toFixed(0)} min apart`).join(', ')}` : ''}

2. Audio Durations:
   - Short Family Stories (<10 min): ${fraudProfile.indicators.shortFamilyStories.length}
   - Short Pedigrees (<15 min): ${fraudProfile.indicators.shortPedigrees.length}
   - Score: ${fraudProfile.indicators.audioDurationFraudScore.toFixed(1)}/100

3. Names Pattern:
   - Most common count: ${fraudProfile.indicators.mostCommonCount || 'N/A'} (appears ${fraudProfile.indicators.mostCommonFrequency} times)
   - Repeated patterns detected: ${fraudProfile.indicators.repeatedNamesCount}
   - Score: ${fraudProfile.indicators.namesPatternFraudScore.toFixed(1)}/100

4. Page Boundaries:
   - Boundary hits: ${fraudProfile.indicators.boundaryHits}/${fraudProfile.indicators.totalInterviews}
   - Actual rate: ${fraudProfile.indicators.actualBoundaryRate.toFixed(1)}% (expected: ${fraudProfile.indicators.expectedBoundaryRate}%)
   - Never hits boundaries: ${fraudProfile.indicators.neverHitsBoundaries ? 'YES' : 'NO'}
   - Always hits boundaries: ${fraudProfile.indicators.alwaysHitsBoundaries ? 'YES' : 'NO'}
   - Score: ${fraudProfile.indicators.pageBoundaryFraudScore.toFixed(1)}/100

5. Statistical Anomalies:
   - Pass rate: ${fraudProfile.indicators.passRate.toFixed(1)}% (avg: ${comparisonStats?.avgPassRate || 75}%)
   - Re-audit rate: ${fraudProfile.indicators.reAuditRate.toFixed(1)}% (avg: ${comparisonStats?.avgReAuditRate || 15}%)
   - Score: ${fraudProfile.indicators.anomalyScore.toFixed(1)}/100

Generate a fraud analysis report with:
1. Summary paragraph
2. List of 3-5 concerning patterns
3. Action plan with immediate steps, short-term recommendations, and escalation guidance
4. Risk assessment paragraph`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;

    // Parse the response into structured format
    // For simplicity, returning the full text with basic structure
    const sections = analysisText.split('\n\n');
    
    return new Response(
      JSON.stringify({
        summary: analysisText,
        concerningPatterns: [
          fraudProfile.indicators.closeIntervals.length > 0 ? 'Multiple interviews completed less than 45 minutes apart' : null,
          fraudProfile.indicators.shortFamilyStories.length > 2 ? 'Frequent short Family Story segments' : null,
          fraudProfile.indicators.shortPedigrees.length > 2 ? 'Frequent short Pedigree segments' : null,
          fraudProfile.indicators.neverHitsBoundaries ? 'Never hits page boundaries (suspicious avoidance)' : null,
          fraudProfile.indicators.alwaysHitsBoundaries ? 'Always hits page boundaries (data fabrication)' : null,
        ].filter(Boolean),
        actionPlan: {
          immediate: [
            fraudProfile.fraudGrade === 'D' ? 'Suspend agent immediately pending investigation' : null,
            fraudProfile.fraudGrade === 'C' || fraudProfile.fraudGrade === 'D' ? 'Review all recent interviews for quality' : null,
            'Schedule meeting with field manager',
          ].filter(Boolean),
          shortTerm: [
            fraudProfile.fraudGrade === 'B' || fraudProfile.fraudGrade === 'C' ? 'Implement enhanced monitoring' : null,
            'Provide retraining on interview protocols',
            'Increase spot-check frequency',
          ].filter(Boolean),
          escalation: fraudProfile.fraudGrade === 'D' 
            ? 'IMMEDIATE TERMINATION RECOMMENDED: Multiple critical fraud indicators detected. Agent poses significant risk to data integrity.'
            : fraudProfile.fraudGrade === 'C'
            ? 'Consider termination if no improvement after 2 weeks of monitoring.'
            : null,
        },
        riskAssessment: analysisText.includes('high risk') || analysisText.includes('terminate') 
          ? 'High risk agent requiring immediate intervention'
          : analysisText.includes('monitor') 
          ? 'Moderate risk requiring enhanced supervision'
          : 'Low to moderate risk, continue monitoring',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in fraud-analysis function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});