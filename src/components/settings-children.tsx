"use client";

import { ArrowLeft, Loader2, Lock, Pencil, Plus, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addChild, getChildren, log, logErr, removeChild, setHomeworkUrl } from "@/lib/ipc";
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
      await log(`settings: removing childId=${childId}`);
      await removeChild(childId);
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto max-w-lg px-5 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1
          className="text-xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Children
        </h1>
      </div>

      {children.length === 0 && !showAdd && (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <p className="text-sm text-muted-foreground">No children added yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {children.map((child) => (
          <ChildRow key={child.id} child={child} onRemove={handleRemove} onChanged={refresh} />
        ))}
      </div>

      <div className="mt-4">
        {showAdd ? (
          <AddChildForm
            onDone={async () => {
              setShowAdd(false);
              await refresh();
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add another child
          </Button>
        )}
      </div>
    </div>
  );
}

function ChildRow({
  child,
  onRemove,
  onChanged,
}: {
  child: ChildRecord;
  onRemove: (id: number) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(child.homeworkUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = draftUrl.trim();
      await setHomeworkUrl(child.id, trimmed || null);
      await onChanged();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{child.displayName}</p>
          <p className="truncate text-[12px] text-muted-foreground">{child.username}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => onRemove(child.id)}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-11">
        {editing ? (
          <>
            <Input
              type="url"
              placeholder="https://sites.google.com/..."
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              className="h-8 flex-1 rounded-md text-[12px]"
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setDraftUrl(child.homeworkUrl ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {child.homeworkUrl ? `Homework: ${child.homeworkUrl}` : "Homework: not set"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AddChildForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [homeworkUrl, setHomeworkUrlInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError(null);

    try {
      await log("settings: add child validation started");
      const baseUrl = "https://www.teacherease.com";
      await login(baseUrl, { username, password });
      await addChild({
        displayName: displayName || "My Child",
        baseUrl,
        username,
        password,
        homeworkUrl: homeworkUrl.trim() || null,
      });
      await log(`settings: add child succeeded name=${displayName || "My Child"}`);
      await onDone();
    } catch (err) {
      await logErr(`settings: add child failed ${err instanceof Error ? err.message : "unknown"}`);
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        Credentials stored securely on this computer
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="add-name" className="text-[13px]">
          Child&apos;s name
        </Label>
        <Input
          id="add-name"
          placeholder="e.g. Alex"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-email" className="text-[13px]">
          TeacherEase email
        </Label>
        <Input
          id="add-email"
          type="email"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-pass" className="text-[13px]">
          Password
        </Label>
        <Input
          id="add-pass"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 rounded-lg"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="add-homework" className="text-[13px]">
          Homework page URL
        </Label>
        <Input
          id="add-homework"
          type="url"
          placeholder="https://sites.google.com/..."
          value={homeworkUrl}
          onChange={(e) => setHomeworkUrlInput(e.target.value)}
          className="h-9 rounded-lg"
        />
        <p className="text-[11px] text-muted-foreground">Optional — leave blank to skip.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isValidating}>
          {isValidating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {isValidating ? "Verifying..." : "Add child"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
