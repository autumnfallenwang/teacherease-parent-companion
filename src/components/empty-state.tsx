import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
      <div className="rounded-full bg-muted p-6">
        <UserPlus className="h-12 w-12 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Add your first child to get started</h2>
        <p className="max-w-md text-muted-foreground">
          Connect your TeacherEase account and we&apos;ll keep track of grades, homework, and
          missing assignments — right here on your computer.
        </p>
      </div>
      <Button size="lg" asChild>
        <Link href="/setup">
          <UserPlus className="mr-2 h-5 w-5" />
          Add a child
        </Link>
      </Button>
    </div>
  );
}
