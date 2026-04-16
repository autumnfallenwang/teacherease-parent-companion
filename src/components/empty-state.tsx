import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-primary/5" />
        <div className="relative rounded-2xl bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <GraduationCap className="h-10 w-10 text-primary" strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-3">
        <h2
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Welcome to Parent Companion
        </h2>
        <p className="mx-auto max-w-[300px] text-[14px] leading-relaxed text-muted-foreground">
          Connect your TeacherEase account and we&apos;ll keep track of grades and missing
          assignments — right here on your computer.
        </p>
      </div>

      <Button size="lg" className="rounded-xl px-6" asChild>
        <Link href="/setup">Get started</Link>
      </Button>
    </div>
  );
}
