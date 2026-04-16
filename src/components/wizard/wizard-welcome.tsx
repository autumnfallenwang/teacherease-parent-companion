import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WizardWelcomeProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WizardWelcome({ onNext, onSkip }: WizardWelcomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">TeacherEase Parent Companion</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Keep track of your child&apos;s grades and homework from TeacherEase. Everything stays on
          your computer.
        </p>
      </div>
      <Button size="lg" onClick={onNext}>
        Get started
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={onSkip}
      >
        Skip setup
      </button>
    </div>
  );
}
