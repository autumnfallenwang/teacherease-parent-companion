import type { GradeRecord } from "@/lib/ipc";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface GradesTableProps {
  grades: GradeRecord[];
}

function statusBadge(grade: GradeRecord) {
  if (grade.needsAttention) {
    return <Badge variant="destructive">Needs Attention</Badge>;
  }
  if (grade.status === "meeting") {
    return <Badge variant="secondary">Meeting</Badge>;
  }
  return <Badge variant="outline">Not Assessed</Badge>;
}

export function GradesTable({ grades }: GradesTableProps) {
  if (grades.length === 0) {
    return <p className="p-6 text-center text-muted-foreground">No grade data yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Class</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grades.map((grade) => (
          <TableRow key={grade.id}>
            <TableCell className="font-medium">{grade.className}</TableCell>
            <TableCell className="text-right">{statusBadge(grade)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
