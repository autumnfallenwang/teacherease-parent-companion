"use client";

import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addChild, log, logErr, tauriFetch } from "@/lib/ipc";
import { login } from "@/lib/scraper/teacherease";

interface WizardAddChildProps {
  onNext: (childId: number) => void;
  onSkip: () => void;
}

export function WizardAddChild({ onNext, onSkip }: WizardAddChildProps) {
  const [displayName, setDisplayName] = useState("");
  const [baseUrl] = useState("https://www.teacherease.com");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [homeworkUrl, setHomeworkUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError(null);

    try {
      await log("wizard: login validation started");
      await login(baseUrl, { username, password }, tauriFetch);
      await log("wizard: login validation succeeded");
      const childId = await addChild({
        displayName: displayName || "My Child",
        baseUrl,
        username,
        password,
        homeworkUrl: homeworkUrl.trim() || null,
      });
      onNext(childId);
    } catch (err) {
      await logErr(
        `wizard: login validation failed ${err instanceof Error ? err.message : "unknown"}`,
      );
      if (err instanceof Error) {
        if (/double-check|invalid|incorrect|wrong/i.test(err.message)) {
          setError("Couldn't log in to TeacherEase. Double-check your email and password.");
        } else if (/responding|offline|network/i.test(err.message)) {
          setError("TeacherEase isn't responding. Try again in a moment.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h2
            className="text-[22px] font-medium tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Add your child
          </h2>
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Stored securely on this computer
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="text-[13px]">
              Child&apos;s name
            </Label>
            <Input
              id="displayName"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-[13px]">
              TeacherEase email
            </Label>
            <Input
              id="username"
              type="email"
              placeholder="parent@email.com"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="homeworkUrl" className="text-[13px]">
              Homework page URL
            </Label>
            <Input
              id="homeworkUrl"
              type="url"
              placeholder="https://sites.google.com/..."
              value={homeworkUrl}
              onChange={(e) => setHomeworkUrl(e.target.value)}
              className="h-10 rounded-lg"
            />
            <p className="text-[11px] text-muted-foreground">
              Optional — public Google Sites page. Leave blank to skip.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="h-10 w-full rounded-xl" disabled={isValidating}>
            {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isValidating ? "Verifying login..." : "Continue"}
          </Button>
        </form>

        <div className="text-center">
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
