// TeacherEase FetchSource (P4 / Q20 / Q27). Wraps the login + grades-overview
// + class-detail HTTP flow and hands the parsed domain data to
// `persistTeacherEaseData`. The runner owns the `fetch_runs` row lifecycle.
// Notifications are built post-loop in the dashboard, not here.

import { getChildPassword, persistTeacherEaseData, tauriFetch } from "@/lib/ipc";
import { parseClassDetails, parseGradesOverview } from "@/lib/scraper/parser";
import { login, USER_AGENT } from "@/lib/scraper/teacherease";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";
import type { FetchContext, FetchSource } from "./types";

// biome-ignore lint/security/noSecrets: URL path, not a secret
const GRADES_PATH = "/App/Parents/StandardGrade/GradeViewAllWithProgress";

export class TeacherEaseSource implements FetchSource {
  readonly name = "teacherease";

  isApplicable(_child: ChildRecord): boolean {
    // TeacherEase is the only portal today. Future: gate on `child.portalType`.
    return true;
  }

  async run(ctx: FetchContext): Promise<void> {
    const password = await getChildPassword(ctx.childId);
    if (!password) throw new Error("No stored password — re-add this child");

    const session = await login(
      ctx.child.baseUrl,
      {
        username: ctx.child.username,
        password,
      },
      tauriFetch,
    );

    const gradesUrl = new URL(GRADES_PATH, session.baseUrl).toString();
    const gradesRes = await tauriFetch(gradesUrl, {
      headers: { Cookie: session.cookieHeader, "User-Agent": USER_AGENT },
    });
    const overview = parseGradesOverview(await gradesRes.text());

    const classDetails: ClassDetails[] = [];
    for (const cls of overview.classes) {
      const url = new URL(
        `/common/StudentProgressStandardsDetails.aspx?ClassID=${cls.classId}&CGPID=${cls.cgpId}`,
        session.baseUrl,
      ).toString();
      const res = await tauriFetch(url, {
        headers: { Cookie: session.cookieHeader, "User-Agent": USER_AGENT },
      });
      classDetails.push(parseClassDetails(await res.text(), cls.name));
    }

    await persistTeacherEaseData(ctx.fetchRunId, overview, classDetails);
  }
}
