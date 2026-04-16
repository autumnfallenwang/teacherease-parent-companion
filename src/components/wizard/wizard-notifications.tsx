import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WizardNotificationsProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WizardNotifications({ onNext, onSkip }: WizardNotificationsProps) {
  const handleAllow = () => {
    onNext();
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 py-12 text-center">
      <div className="rounded-2xl bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <BellRing className="h-9 w-9 text-primary" strokeWidth={1.5} />
      </div>

      <div className="space-y-3">
        <h2
          className="text-[22px] font-medium tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Stay in the loop
        </h2>
        <p className="mx-auto max-w-[280px] text-[14px] leading-relaxed text-muted-foreground">
          Get a desktop notification when there&apos;s a missing assignment or a grade that needs
          attention.
        </p>
      </div>

      <div className="flex w-full max-w-[260px] flex-col gap-2">
        <Button size="lg" className="rounded-xl" onClick={handleAllow}>
          Allow notifications
        </Button>
        <Button
          size="lg"
          variant="ghost"
          className="rounded-xl text-muted-foreground"
          onClick={onSkip}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
