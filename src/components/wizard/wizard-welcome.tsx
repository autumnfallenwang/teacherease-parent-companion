import { ArrowRight, GraduationCap, Shield, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WizardWelcomeProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WizardWelcome({ onNext, onSkip }: WizardWelcomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      <div className="w-full max-w-sm space-y-10">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <GraduationCap className="h-7 w-7 text-primary" strokeWidth={1.5} />
          </div>
          <h1
            className="text-[28px] font-medium leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            TeacherEase
            <br />
            Parent Companion
          </h1>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Keep track of your child&apos;s grades and homework — automatically.
          </p>
        </div>

        <div className="space-y-3">
          {[
            {
              icon: Wifi,
              text: "Checks TeacherEase for updates every few hours",
            },
            {
              icon: Shield,
              text: "Everything stays on your computer, nothing in the cloud",
            },
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-start gap-3 rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
              <p className="text-[13px] leading-snug text-foreground/80">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 text-center">
          <Button onClick={onNext} size="lg" className="w-full rounded-xl">
            Get started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <button
            type="button"
            className="text-[12px] text-muted-foreground underline-offset-4 hover:underline"
            onClick={onSkip}
          >
            Skip setup
          </button>
        </div>
      </div>
    </div>
  );
}
