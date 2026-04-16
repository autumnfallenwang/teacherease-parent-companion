// Thin facade over Tauri IPC. All calls from React into the Rust shell and
// Tauri plugins go through this file — components never import from
// `@tauri-apps/*` directly. See design-plan.md "Forward compatibility."
//
// A future web version replaces this file with src/lib/api.ts (REST client)
// and every React component keeps working.

import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { ChildRecord } from "../../scraper/types";

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:app.db");
  }
  return db;
}

// ---------------------------------------------------------------------------
// Keychain (thin wrappers around Rust #[tauri::command] handlers)
// ---------------------------------------------------------------------------

async function keychainSet(key: string, password: string): Promise<void> {
  await invoke("keychain_set", { key, password });
}

async function keychainGet(key: string): Promise<string | null> {
  return await invoke<string | null>("keychain_get", { key });
}

async function keychainDelete(key: string): Promise<void> {
  await invoke("keychain_delete", { key });
}

function childKeychainKey(childId: number): string {
  return `child-${childId}`;
}

// ---------------------------------------------------------------------------
// Child CRUD (DB + keychain orchestration per Q3 atomicity pattern)
// ---------------------------------------------------------------------------

export interface AddChildParams {
  displayName: string;
  baseUrl: string;
  username: string;
  password: string;
  grade?: string;
  school?: string;
}

export async function addChild(params: AddChildParams): Promise<number> {
  const d = await getDb();

  const result = await d.execute(
    `INSERT INTO children (display_name, base_url, username, grade, school)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.displayName,
      params.baseUrl,
      params.username,
      params.grade ?? null,
      params.school ?? null,
    ],
  );
  const childId = result.lastInsertId;
  if (childId == null) {
    throw new Error("INSERT returned no lastInsertId");
  }

  try {
    await keychainSet(childKeychainKey(childId), params.password);
  } catch (e) {
    await d.execute("DELETE FROM children WHERE id = $1", [childId]);
    throw new Error("Failed to store credentials", { cause: e });
  }

  return childId;
}

export async function removeChild(childId: number): Promise<void> {
  await keychainDelete(childKeychainKey(childId));
  const d = await getDb();
  await d.execute("DELETE FROM children WHERE id = $1", [childId]);
}

export async function updateChildPassword(childId: number, password: string): Promise<void> {
  await keychainSet(childKeychainKey(childId), password);
}

export async function getChildPassword(childId: number): Promise<string | null> {
  return await keychainGet(childKeychainKey(childId));
}

interface RawChildRow {
  id: number;
  display_name: string;
  portal_type: string;
  base_url: string;
  username: string;
  grade: string | null;
  school: string | null;
  created_at: string;
}

function mapChildRow(row: RawChildRow): ChildRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    portalType: row.portal_type,
    baseUrl: row.base_url,
    username: row.username,
    grade: row.grade,
    school: row.school,
    createdAt: row.created_at,
  };
}

export async function getChildren(): Promise<ChildRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawChildRow[]>("SELECT * FROM children ORDER BY id");
  return rows.map(mapChildRow);
}

export async function getChild(childId: number): Promise<ChildRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawChildRow[]>("SELECT * FROM children WHERE id = $1", [childId]);
  const row = rows[0];
  return row ? mapChildRow(row) : null;
}
