"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addChild, getChildren, removeChild } from "@/lib/ipc";
import { login } from "@/lib/scraper/teacherease";
import type { ChildRecord } from "@/lib/scraper/types";

export function SettingsChildren() {
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    setChildren(await getChildren());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRemove = useCallback(
    async (childId: number) => {
      await removeChild(childId);
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Settings — Children</h1>
      </div>

      {children.length === 0 && !showAdd && (
        <p className="text-muted-foreground">No children added yet.</p>
      )}

      <ul className="space-y-3">
        {children.map((child) => (
          <li key={child.id} className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="font-medium">{child.displayName}</p>
              <p className="text-sm text-muted-foreground">{child.username}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleRemove(child.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>

      {showAdd ? (
        <AddChildForm
          onDone={async () => {
            setShowAdd(false);
            await refresh();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <Button variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add another child
        </Button>
      )}
    </div>
  );
}

function AddChildForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError(null);

    try {
      const baseUrl = "https://www.teacherease.com";
      await login(baseUrl, { username, password });
      await addChild({
        displayName: displayName || "My Child",
        baseUrl,
        username,
        password,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border p-4">
      <div className="space-y-2">
        <Label htmlFor="add-name">Child&apos;s name</Label>
        <Input
          id="add-name"
          placeholder="e.g. Alex"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-email">TeacherEase email</Label>
        <Input
          id="add-email"
          type="email"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-pass">Password</Label>
        <Input
          id="add-pass"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isValidating}>
          {isValidating ? "Verifying..." : "Add child"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
