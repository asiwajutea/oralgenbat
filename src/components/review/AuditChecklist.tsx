import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, ClipboardCheck, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ChecklistItem {
  id: number;
  category: string;
  categoryLabel: string;
  question: string;
  answer?: "yes" | "no";
  comment?: string;
}

export interface ChecklistProgress {
  id: string;
  audit_id: string;
  reviewer_id: string;
  items: ChecklistItem[];
  current_index: number;
  is_completed: boolean;
  has_failures: boolean;
  failure_comments: string | null;
}

const CHECKLIST_ITEMS: Omit<ChecklistItem, "answer" | "comment">[] = [
  // A. Documentation & Authorization
  {
    id: 1,
    category: "A",
    categoryLabel: "Documentation & Authorization",
    question: "Was the interview recorded on the FSI Standard Interview Collection Form?",
  },
  {
    id: 2,
    category: "A",
    categoryLabel: "Documentation & Authorization",
    question: 'Is the Authorization Form signed and dated, and if marked "X," is there a witness signature?',
  },
  {
    id: 3,
    category: "A",
    categoryLabel: "Documentation & Authorization",
    question: "Is the Field Manager Checklist fully checked and signed?",
  },
  {
    id: 4,
    category: "A",
    categoryLabel: "Documentation & Authorization",
    question: "Do the interviewee's name and age on the header and Authorization Form match the information in the mobile app?",
  },
  // B. Data Consistency & Accuracy
  {
    id: 5,
    category: "B",
    categoryLabel: "Data Consistency & Accuracy",
    question: "Does the total number of names on the header match the total names written on the collection form?",
  },
  {
    id: 6,
    category: "B",
    categoryLabel: "Data Consistency & Accuracy",
    question: "Does the earliest ancestor's name on the collection form match the one in the mobile app?",
  },
  {
    id: 7,
    category: "B",
    categoryLabel: "Data Consistency & Accuracy",
    question: "Does each name on the collection form have a unique RIN, a relationship code, and a gender?",
  },
  {
    id: 8,
    category: "B",
    categoryLabel: "Data Consistency & Accuracy",
    question: "Are the dates and places of birth recorded for the interviewee, the spouse, and the interviewee's children?",
  },
  {
    id: 9,
    category: "B",
    categoryLabel: "Data Consistency & Accuracy",
    question: "Does the folder name written on the collection form header match the interview date and the interview ID?",
  },
  // C. Form Structure & Completeness
  {
    id: 10,
    category: "C",
    categoryLabel: "Form Structure & Completeness",
    question: "Are the pages numbered correctly and in sequence?",
  },
  // D. Media Verification
  {
    id: 11,
    category: "D",
    categoryLabel: "Media Verification",
    question: "Are all photos in the mobile app clear, relevant, and correctly captured?",
  },
  {
    id: 12,
    category: "D",
    categoryLabel: "Media Verification",
    question: "Is the full Authorization Form clearly visible in the uploaded image?",
  },
  {
    id: 13,
    category: "D",
    categoryLabel: "Media Verification",
    question: "Can the Field Agent and interviewee be clearly and easily heard in both the Family Story and Pedigree audio files?",
  },
];

interface AuditChecklistProps {
  auditId: string;
  interviewId?: string;
  onComplete: (hasFailures: boolean, failureComments: string) => void;
  isCompleted: boolean;
  initialProgress?: ChecklistProgress | null;
  isSticky?: boolean;
  onAbandonReview?: () => void;
  isAbandoning?: boolean;
}

export const AuditChecklist = ({ 
  auditId, 
  interviewId, 
  onComplete, 
  isCompleted, 
  initialProgress, 
  isSticky = false,
  onAbandonReview,
  isAbandoning = false,
}: AuditChecklistProps) => {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>(() => {
    if (initialProgress?.items && Array.isArray(initialProgress.items)) {
      return initialProgress.items as ChecklistItem[];
    }
    return CHECKLIST_ITEMS.map((item) => ({ ...item }));
  });
  const [currentIndex, setCurrentIndex] = useState(() => initialProgress?.current_index ?? 0);
  const [currentComment, setCurrentComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [isOpen, setIsOpen] = useState(!isCompleted);

  // Initialize from saved progress when it loads
  useEffect(() => {
    if (initialProgress?.items && Array.isArray(initialProgress.items)) {
      setItems(initialProgress.items as ChecklistItem[]);
      setCurrentIndex(initialProgress.current_index);
      
      // If already completed, call onComplete and collapse
      if (initialProgress.is_completed) {
        onComplete(initialProgress.has_failures, initialProgress.failure_comments || "");
        setIsOpen(false);
      }
    }
  }, [initialProgress]);

  const currentItem = items[currentIndex];
  const totalItems = items.length;
  const answeredCount = items.filter((item) => item.answer !== undefined).length;

  const saveProgress = async (
    updatedItems: ChecklistItem[],
    newIndex: number,
    completed: boolean,
    failures: boolean,
    comments: string
  ) => {
    if (!user?.id) return;

    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from("audit_checklist_progress")
        .select("id")
        .eq("audit_id", auditId)
        .maybeSingle();

      if (existing) {
        // Update existing record
        await supabase
          .from("audit_checklist_progress")
          .update({
            items: JSON.parse(JSON.stringify(updatedItems)),
            current_index: newIndex,
            is_completed: completed,
            has_failures: failures,
            failure_comments: comments || null,
            updated_at: new Date().toISOString()
          })
          .eq("audit_id", auditId);
      } else {
        // Insert new record
        await supabase
          .from("audit_checklist_progress")
          .insert({
            audit_id: auditId,
            reviewer_id: user.id,
            items: JSON.parse(JSON.stringify(updatedItems)),
            current_index: newIndex,
            is_completed: completed,
            has_failures: failures,
            failure_comments: comments || null
          });
      }
    } catch (error) {
      console.error("Failed to save checklist progress:", error);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      setShowCommentBox(false);
      setCurrentComment("");
      // Save progress when going back
      const hasAnyFailures = items.some((item) => item.answer === "no");
      saveProgress(items, prevIndex, false, hasAnyFailures, "");
    }
  };

  // Calculate the maximum index that has been answered
  const maxAnsweredIndex = items.reduce((max, item, index) => 
    item.answer ? Math.max(max, index) : max, -1
  );

  const handleNext = () => {
    // Only allow next if the next question has been answered
    if (items[currentIndex + 1]?.answer) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setShowCommentBox(false);
      setCurrentComment("");
      // Save progress when going forward
      const hasAnyFailures = items.some((item) => item.answer === "no");
      saveProgress(items, nextIndex, false, hasAnyFailures, "");
    }
  };

  const handleAnswer = (answer: "yes" | "no") => {
    const updatedItems = [...items];
    updatedItems[currentIndex] = { ...updatedItems[currentIndex], answer };
    setItems(updatedItems);

    if (answer === "no") {
      setShowCommentBox(true);
      // Save progress with current state
      saveProgress(updatedItems, currentIndex, false, true, "");
    } else {
      setShowCommentBox(false);
      setCurrentComment("");
      proceedToNext(updatedItems);
    }
  };

  const handleCommentSubmit = (skip: boolean = false) => {
    const updatedItems = [...items];
    if (!skip && currentComment.trim()) {
      updatedItems[currentIndex] = {
        ...updatedItems[currentIndex],
        comment: currentComment.trim(),
      };
    }
    setItems(updatedItems);
    setCurrentComment("");
    setShowCommentBox(false);
    proceedToNext(updatedItems);
  };

  const proceedToNext = (updatedItems: ChecklistItem[]) => {
    if (currentIndex < totalItems - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      // Save progress
      const hasAnyFailures = updatedItems.some((item) => item.answer === "no");
      saveProgress(updatedItems, nextIndex, false, hasAnyFailures, "");
    } else {
      // Checklist complete - compile results
      const failedItems = updatedItems.filter((item) => item.answer === "no");
      const hasFailures = failedItems.length > 0;

      let failureComments = "";
      if (hasFailures) {
        const groupedFailures: Record<string, ChecklistItem[]> = {};
        failedItems.forEach((item) => {
          if (!groupedFailures[item.categoryLabel]) {
            groupedFailures[item.categoryLabel] = [];
          }
          groupedFailures[item.categoryLabel].push(item);
        });

        const sections: string[] = [];
        Object.entries(groupedFailures).forEach(([category, categoryItems]) => {
          const categorySection = [`**${category}:**`];
          categoryItems.forEach((item) => {
            categorySection.push(`- Q${item.id}: ${item.question}`);
            if (item.comment) {
              categorySection.push(`  Comment: ${item.comment}`);
            }
          });
          sections.push(categorySection.join("\n"));
        });

        failureComments = `**Failed Checklist Items:**\n\n${sections.join("\n\n")}`;
      }

      // Save completed progress
      saveProgress(updatedItems, currentIndex, true, hasFailures, failureComments);
      onComplete(hasFailures, failureComments);
      setIsOpen(false); // Collapse when completed
    }
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "A":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "B":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "C":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "D":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // State for reviewing individual questions after completion
  const [reviewingIndex, setReviewingIndex] = useState<number | null>(null);

  if (isCompleted) {
    const failedItems = items.filter((item) => item.answer === "no");
    const passedItems = items.filter((item) => item.answer === "yes");

    // If reviewing a specific question
    if (reviewingIndex !== null) {
      const reviewItem = items[reviewingIndex];
      return (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Review Question
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReviewingIndex(null)}
              >
                Back to Summary
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={cn("text-xs", getCategoryColor(reviewItem.category))}
              >
                Section {reviewItem.category}: {reviewItem.categoryLabel}
              </Badge>
              <Badge variant="outline" className="text-xs font-normal">
                {reviewingIndex + 1} of {totalItems}
              </Badge>
            </div>
            
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Q{reviewItem.id}:</span> {reviewItem.question}
            </p>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Answer:</span>
              {reviewItem.answer === "yes" ? (
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  No
                </Badge>
              )}
            </div>
            
            {reviewItem.comment && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Comment:</p>
                <p className="text-sm">{reviewItem.comment}</p>
              </div>
            )}
            
            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReviewingIndex(Math.max(0, reviewingIndex - 1))}
                disabled={reviewingIndex === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReviewingIndex(Math.min(totalItems - 1, reviewingIndex + 1))}
                disabled={reviewingIndex === totalItems - 1}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-border bg-card">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                {isSticky && interviewId ? (
                  <span className="truncate font-medium">{interviewId}</span>
                ) : (
                  "Checklist Complete"
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {onAbandonReview && (
                  <Button
                    onClick={onAbandonReview}
                    disabled={isAbandoning}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Abandon
                  </Button>
                )}
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{passedItems.length} Passed</span>
                  </div>
                  {failedItems.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span>{failedItems.length} Failed</span>
                    </div>
                  )}
                </div>
                {/* Navigation buttons to review questions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReviewingIndex(0)}
                    className="gap-1 text-xs"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    First
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReviewingIndex(totalItems - 1)}
                    className="gap-1 text-xs"
                  >
                    Last
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
              {/* Quick jump to specific failed questions */}
              {failedItems.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Click to review failed items:</p>
                  <div className="flex flex-wrap gap-1">
                    {failedItems.map((item) => (
                      <Button
                        key={item.id}
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setReviewingIndex(items.findIndex(i => i.id === item.id))}
                      >
                        Q{item.id}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              {isSticky && interviewId ? (
                <span className="truncate font-medium">{interviewId}</span>
              ) : (
                "Audit Review Checklist"
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {onAbandonReview && (
                <Button
                  onClick={onAbandonReview}
                  disabled={isAbandoning}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Abandon
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Category badge and progress */}
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={cn("text-xs", getCategoryColor(currentItem.category))}
              >
                Section {currentItem.category}: {currentItem.categoryLabel}
              </Badge>
              <Badge variant="outline" className="text-xs font-normal">
                {currentIndex + 1} of {totalItems}
              </Badge>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${(answeredCount / totalItems) * 100}%` }}
              />
            </div>

            {/* Question */}
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Q{currentItem.id}:</span> {currentItem.question}
            </p>

            {/* Answer options and navigation */}
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <RadioGroup
                value={currentItem.answer || ""}
                onValueChange={(value) => handleAnswer(value as "yes" | "no")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="yes" />
                  <Label
                    htmlFor="yes"
                    className="cursor-pointer flex items-center gap-1.5 text-sm"
                  >
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Yes
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="no" />
                  <Label
                    htmlFor="no"
                    className="cursor-pointer flex items-center gap-1.5 text-sm"
                  >
                    <XCircle className="h-4 w-4 text-destructive" />
                    No
                  </Label>
                </div>
              </RadioGroup>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={!items[currentIndex + 1]?.answer}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Comment box for "No" answers */}
            {showCommentBox && (
              <div className="space-y-3 pt-3 border-t border-border">
                <Textarea
                  placeholder="Describe what was wrong (optional)..."
                  value={currentComment}
                  onChange={(e) => setCurrentComment(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCommentSubmit(true)}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleCommentSubmit(false)}
                    className="gap-1"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
