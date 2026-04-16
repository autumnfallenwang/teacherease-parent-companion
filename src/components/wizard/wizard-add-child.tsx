"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addChild } from "@/lib/ipc";
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
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError(null);

    try {
      await login(baseUrl, { username, password });

      const childId = await addChild({
        displayName: displayName || "My Child",
        baseUrl,
        username,
        password,
      });

      onNext(childId);
    } catch (err) {
      if (err instanceof Error) {
        if (/double-check|invalid|incorrect|wrong/i.test(err.message)) {
          setError("Couldn't log in. Double-check your email and password.");
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
    <div className="flex flex-1 flex-col items-center justify-center p-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold">Add your first child</h2>
          <p className="text-sm text-muted-foreground">
            Stored securely on this computer and never sent anywhere else.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Child&apos;s name</Label>
            <Input
              id="displayName"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">TeacherEase email</Label>
            <Input
              id="username"
              type="email"
              placeholder="Email Address"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">TeacherEase password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={isValidating}>
            {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isValidating ? "Verifying login..." : "Continue"}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={onSkip}
          >
            Skip setup
          </button>
        </div>
      </div>
    </div>
  );
}
