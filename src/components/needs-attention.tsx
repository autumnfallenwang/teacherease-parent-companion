import { AlertTriangle } from "lucide-react";
import type { AssignmentRecord } from "@/lib/ipc";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface NeedsAttentionProps {
  missingAssignments: AssignmentRecord[];
}

export function NeedsAttention({ missingAssignments }: NeedsAttentionProps) {
  if (missingAssignments.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Missing Assignments ({missingAssignments.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {missingAssignments.map((asn) => (
            <li key={asn.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{asn.assignmentName}</span>
                <span className="ml-2 text-muted-foreground">{asn.className}</span>
              </div>
              {asn.dueDate && <span className="text-muted-foreground text-xs">{asn.dueDate}</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
