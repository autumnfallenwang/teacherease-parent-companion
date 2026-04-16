# Disclaimer

> **Source of truth:** [`src/lib/legal.ts`](src/lib/legal.ts). The text below is mirrored from that file. When updating the disclaimer, update `legal.ts` — the app, the wizard, and the About page all read from it at runtime.

---

This is an unofficial, community-built tool. It is **not** affiliated with, endorsed by, or connected to TeacherEase, Common Goal Systems Inc., or any school district.

This software accesses TeacherEase using credentials that **you** provide for **your own** parent account. It exercises the same access you have when logging in through a web browser — no additional permissions, no security bypasses, no access to other users' data.

By using this software, you acknowledge that:

- You are the authorized parent/guardian for the TeacherEase account(s) you configure.
- You accept responsibility for your use of this tool in accordance with your school's policies and TeacherEase's Terms of Service.
- The developer provides this software "as is" with no warranty of any kind (see [LICENSE](LICENSE)).
- The developer is not responsible for any consequences of using this software, including but not limited to account restrictions that may be imposed by TeacherEase or your school.

## Privacy & data handling

All data stays on your computer:

- Portal credentials are stored in your operating system's secure keychain — never in plain files.
- Grade and homework data is stored in a local database in your OS app-data folder.
- No data is sent to any server except TeacherEase itself (to check grades) and optionally your own SMTP server (if you enable email reports).
- No telemetry, no analytics, no tracking, no third-party services.

## Responsible use

This app is designed to be a respectful, lightweight client:

- Rate-limited by design — at most 4 automated checks per day.
- Only accesses data for children whose credentials you have provided.
- Sends an identifiable User-Agent header so TeacherEase can contact the developer if needed.
- Fully open source — the complete source code is available for inspection.

---

If you are a TeacherEase representative and have questions or concerns about this tool, please [open a GitHub issue](https://github.com/autumnfallenwang/teacherease-parent-companion/issues) or contact the maintainer directly.
