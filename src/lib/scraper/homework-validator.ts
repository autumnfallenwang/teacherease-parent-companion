// Homework URL shape-check. Fetches the URL and confirms the Google Sites
// content div is present — catches "pasted the wrong URL entirely" without
// false-negatives on "valid page, no current homework" (weekend, summer, etc).
//
// Phase 32 / B3: errors throw codes (HomeworkUrlError) instead of English
// messages. UI catch sites translate via t(`errors.scraper.homework.${code}`).

import { load } from "cheerio";
import { HOMEWORK_CONTENT_SELECTOR } from "./homework-parser";
import { USER_AGENT } from "./teacherease";
import { type FetchImpl, HomeworkUrlError } from "./types";

export async function validateHomeworkUrl(
  url: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new HomeworkUrlError("invalidUrl", { cause: err });
  }
  if (parsed.hostname !== "sites.google.com") {
    throw new HomeworkUrlError("notGoogleSites");
  }

  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    throw new HomeworkUrlError("unreachable", { cause: err });
  }
  if (!res.ok) {
    throw new HomeworkUrlError("unreachableHttp", { status: res.status });
  }
  const doc = load(await res.text());
  if (doc(HOMEWORK_CONTENT_SELECTOR).length === 0) {
    throw new HomeworkUrlError("notGoogleSitesPage");
  }
}
