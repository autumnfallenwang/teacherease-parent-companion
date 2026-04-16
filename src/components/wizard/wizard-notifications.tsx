import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WizardNotificationsProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WizardNotifications({ onNext, onSkip }: WizardNotificationsProps) {
  const handleAllow = () => {
    // TODO: Wire tauri-plugin-notification permission request in Phase 5.
    // For now, just advance to the next step.
    onNext();
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <div className="rounded-full bg-muted p-6">
        <Bell className="h-12 w-12 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Stay in the loop</h2>
        <p className="max-w-md text-muted-foreground">
          Get a desktop notification when there&apos;s a new missing assignment or a grade that
          needs attention. You can change this anytime in Settings.
        </p>
      </div>
      <div className="flex gap-4">
        <Button size="lg" onClick={handleAllow}>
          Allow notifications
        </Button>
        <Button size="lg" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
