import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, ClipboardCheck, FileText } from "lucide-react";
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
}

export const AuditChecklist = ({ auditId, interviewId, onComplete, isCompleted, initialProgress }: AuditChecklistProps) => {
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

  // Initialize from saved progress when it loads
  useEffect(() => {
    if (initialProgress?.items && Array.isArray(initialProgress.items)) {
      setItems(initialProgress.items as ChecklistItem[]);
      setCurrentIndex(initialProgress.current_index);
      
      // If already completed, call onComplete
      if (initialProgress.is_completed) {
        onComplete(initialProgress.has_failures, initialProgress.failure_comments || "");
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

  if (isCompleted) {
    const failedItems = items.filter((item) => item.answer === "no");
    const passedItems = items.filter((item) => item.answer === "yes");

    return (
      <Card className="border-border bg-card">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Checklist Complete</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                <span>{passedItems.length} Passed</span>
              </div>
              {failedItems.length > 0 && (
                <div className="flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span>{failedItems.length} Failed</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="py-3 px-4 space-y-3">
        {/* Compact header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck className="h-4 w-4 text-primary flex-shrink-0" />
            {interviewId && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{interviewId}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge
              variant="outline"
              className={cn("text-xs px-1.5 py-0", getCategoryColor(currentItem.category))}
            >
              {currentItem.category}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal px-1.5 py-0">
              {currentIndex + 1}/{totalItems}
            </Badge>
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${(answeredCount / totalItems) * 100}%` }}
          />
        </div>

        {/* Question - compact */}
        <p className="text-xs leading-relaxed">
          <span className="font-medium">Q{currentItem.id}:</span> {currentItem.question}
        </p>

        {/* Answer options and navigation */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="h-7 px-2 text-xs gap-1"
          >
            <ChevronLeft className="h-3 w-3" />
            Prev
          </Button>
          
          <RadioGroup
            value={currentItem.answer || ""}
            onValueChange={(value) => handleAnswer(value as "yes" | "no")}
            className="flex gap-3"
          >
            <div className="flex items-center space-x-1.5">
              <RadioGroupItem value="yes" id="yes" className="h-3.5 w-3.5" />
              <Label
                htmlFor="yes"
                className="cursor-pointer flex items-center gap-1 text-xs"
              >
                <CheckCircle className="h-3 w-3 text-green-500" />
                Yes
              </Label>
            </div>
            <div className="flex items-center space-x-1.5">
              <RadioGroupItem value="no" id="no" className="h-3.5 w-3.5" />
              <Label
                htmlFor="no"
                className="cursor-pointer flex items-center gap-1 text-xs"
              >
                <XCircle className="h-3 w-3 text-destructive" />
                No
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Comment box for "No" answers - more compact */}
        {showCommentBox && (
          <div className="space-y-2 pt-2 border-t border-border">
            <Textarea
              placeholder="Describe what was wrong (optional)..."
              value={currentComment}
              onChange={(e) => setCurrentComment(e.target.value)}
              className="min-h-[50px] text-xs"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCommentSubmit(true)}
                className="h-7 text-xs"
              >
                Skip
              </Button>
              <Button
                size="sm"
                onClick={() => handleCommentSubmit(false)}
                className="h-7 text-xs gap-1"
              >
                Continue
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
