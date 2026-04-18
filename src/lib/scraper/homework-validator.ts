// Homework URL shape-check. Fetches the URL and confirms the Google Sites
// content div is present — catches "pasted the wrong URL entirely" without
// false-negatives on "valid page, no current homework" (weekend, summer, etc).

import { load } from "cheerio";
import { HOMEWORK_CONTENT_SELECTOR } from "./homework-parser";
import { USER_AGENT } from "./teacherease";
import type { FetchImpl } from "./types";

export async function validateHomeworkUrl(
  url: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new Error(
      "That doesn't look like a valid URL. It should start with https://sites.google.com/",
      { cause: err },
    );
  }
  if (parsed.hostname !== "sites.google.com") {
    throw new Error(
      "Homework URL must be a Google Sites page (starts with https://sites.google.com/).",
    );
  }

  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    throw new Error("Couldn't reach that page. Check your internet connection and the URL.", {
      cause: err,
    });
  }
  if (!res.ok) {
    throw new Error(`Couldn't reach that page (HTTP ${res.status}). Double-check the URL.`);
  }
  const doc = load(await res.text());
  if (doc(HOMEWORK_CONTENT_SELECTOR).length === 0) {
    throw new Error("Doesn't look like a Google Sites homework page. Double-check the URL.");
  }
}
