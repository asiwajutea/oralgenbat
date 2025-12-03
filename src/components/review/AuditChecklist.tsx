import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ChevronRight, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: number;
  category: string;
  categoryLabel: string;
  question: string;
  answer?: "yes" | "no";
  comment?: string;
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
  // C. Form Structure & Completeness
  {
    id: 9,
    category: "C",
    categoryLabel: "Form Structure & Completeness",
    question: "Are the pages numbered correctly and in sequence?",
  },
  // D. Media Verification
  {
    id: 10,
    category: "D",
    categoryLabel: "Media Verification",
    question: "Are all photos in the mobile app clear, relevant, and correctly captured?",
  },
  {
    id: 11,
    category: "D",
    categoryLabel: "Media Verification",
    question: "Is the full Authorization Form clearly visible in the uploaded image?",
  },
  {
    id: 12,
    category: "D",
    categoryLabel: "Media Verification",
    question: "Can the Field Agent and interviewee be clearly and easily heard in both the Family Story and Pedigree audio files?",
  },
];

interface AuditChecklistProps {
  onComplete: (hasFailures: boolean, failureComments: string) => void;
  isCompleted: boolean;
}

export const AuditChecklist = ({ onComplete, isCompleted }: AuditChecklistProps) => {
  const [items, setItems] = useState<ChecklistItem[]>(
    CHECKLIST_ITEMS.map((item) => ({ ...item }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentComment, setCurrentComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);

  const currentItem = items[currentIndex];
  const totalItems = items.length;
  const answeredCount = items.filter((item) => item.answer !== undefined).length;

  const handleAnswer = (answer: "yes" | "no") => {
    const updatedItems = [...items];
    updatedItems[currentIndex] = { ...updatedItems[currentIndex], answer };
    setItems(updatedItems);

    if (answer === "no") {
      setShowCommentBox(true);
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
      setCurrentIndex(currentIndex + 1);
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Audit Checklist Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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

          {failedItems.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Failed Items:
              </p>
              {failedItems.map((item) => (
                <div
                  key={item.id}
                  className="text-sm p-2 bg-destructive/5 border border-destructive/20 rounded-md"
                >
                  <p className="font-medium text-destructive">Q{item.id}: {item.question}</p>
                  {item.comment && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Comment: {item.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Audit Review Checklist
          </CardTitle>
          <Badge variant="outline" className="font-normal">
            {answeredCount + 1} of {totalItems}
          </Badge>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${(answeredCount / totalItems) * 100}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Category badge */}
        <Badge
          variant="outline"
          className={cn("font-medium", getCategoryColor(currentItem.category))}
        >
          {currentItem.category}. {currentItem.categoryLabel}
        </Badge>

        {/* Question */}
        <div className="space-y-4">
          <p className="text-sm font-medium leading-relaxed">
            Q{currentItem.id}: {currentItem.question}
          </p>

          {/* Answer options */}
          <RadioGroup
            value={currentItem.answer || ""}
            onValueChange={(value) => handleAnswer(value as "yes" | "no")}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="yes" />
              <Label
                htmlFor="yes"
                className="cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle className="h-4 w-4 text-green-500" />
                Yes
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="no" />
              <Label
                htmlFor="no"
                className="cursor-pointer flex items-center gap-1.5"
              >
                <XCircle className="h-4 w-4 text-destructive" />
                No
              </Label>
            </div>
          </RadioGroup>

          {/* Comment box for "No" answers */}
          {showCommentBox && (
            <div className="space-y-3 pt-2 border-t border-border">
              <Label htmlFor="comment" className="text-sm text-muted-foreground">
                Please provide details about this issue (optional):
              </Label>
              <Textarea
                id="comment"
                placeholder="Describe what was wrong or missing..."
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
        </div>
      </CardContent>
    </Card>
  );
};
