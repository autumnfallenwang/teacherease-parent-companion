# Open Questions

## Classes table normalization

Currently no `classes` table — `class_name` is a denormalized string in `grades` and `assignments`, and most per-class data from TeacherEase is discarded after each scrape.

### What TeacherEase gives us per class (from grades overview JSON)

| Field | Example | Stored today? |
|---|---|---|
| `ClassID` | 1446437 | No — used once for detail URL, discarded |
| `CurrentCGPID` | 6294033 | No — same |
| `ClassDescription` | "Social Studies 7" | Yes — as denormalized `class_name` string |
| `InstructorDescription` | ["Paddol, D"] | No |
| `GradeStatus.Status` | 2 | Yes — as `current_grade` + `status` |
| `LearningTargetsMeeting` | 5 | No |
| `LearningTargetsNotMeeting` | 1 | No |
| `TotalLeafLearningTargets` | 20 | No |
| `LearningTargetsNotAssessed` | 14 | No |
| `TraditionalGradeData.Score` | null | No (always null for this school) |
| `TraditionalGradeData.LetterGrade` | null | No (always null) |
| `PreviousGradingPeriodGoal` | null | No |
| `CurrentGradingPeriodGoal` | null | No |

### Grading periods

The dropdown on the grades page shows trimesters (this school uses T1/T2/T3). Each has a grading period ID:

```
T1 → 362208
T2 → 362209
T3 → 362210 (current)
```

Grading period ID is school-wide. CGPID is per-class-per-period (e.g., "Social Studies 7 in T3" = CGPID 6294033). Switching the dropdown changes which CGPID each class uses.

Low priority — focus on current trimester only for now.

---

## Data model: current vs full normalization

### Real data structure (observed from live site)

4 layers, with a many-to-many at the bottom:

```
Class: Social Studies 7
│
├── Standard: Geography                          2.84=M
│   ├── Sub-standard: Identifies and locates     3=M
│   │   significant features on maps
│   │   ├── Assignment: SW Asia Political Map    Missing!
│   │   ├── Assignment: South Asia Map    w:512  3=M
│   │   ├── Assignment: Ganga River       w:256  3=M
│   │   └── Assignment: Mount Everest            Missing!
│   │
│   └── Sub-standard: Understands the role of    2.67=M
│       physical geography and climate
│       ├── Assignment: South Asia Map    w:512  3=M    ← same assignment, different standard
│       └── Assignment: Monsoon Worksheet w:256  2=P
│
├── Standard: History, Culture, Gov, Econ        2.43=P
│   ├── Sub-standard: ...historical events              (no score — only missing work)
│   │   └── Assignment: Gandhi Article           Missing!
│   ├── Sub-standard: ...cultural aspects        3=M    (no assignments shown)
│   └── Sub-standard: ...variety of governments  1.86=P
│       ├── Assignment: Malala Google Form w:512 2=P
│       ├── Assignment: Legacy of Gandhi   w:256 1=B
│       └── Assignment: Gandhi Packet      w:128 3=M
│
├── Standard: Research Skills                    3=M
│   └── Sub-standard: Uses note taking           3=M
│       └── Assignment: Gandhi Packet     w:512  3=M    ← same assignment, different standard
│
└── Standard: Completes activities...            2.93=M
    └── Sub-standard: Cycle 1-4 Learning Habits  2.93=M
        ├── Assignment: Gandhi Discussion w:512  3=M
        ├── Assignment: Dharmic Religions w:256  3=M
        ├── Assignment: Ganga River       w:128  3=M
        ├── Assignment: Mount Everest            Missing!
        └── Assignment: Monsoon Worksheet w:64   2=P
```

Key observations:
- Standards and sub-standards form a tree (sub-standard's `parent_id` → standard)
- One assignment can appear under **multiple** sub-standards (many-to-many)
- Assignments have **weights** (512, 256, 128, 64) — "Decaying Weights" means recent work counts more
- Sub-standard score = weighted average of its assignments
- Standard score = average of its sub-standards
- Grading scale: M=3 (Meeting), P=2 (Progressing), B=1 (Beginning), NY=0.5 (Not Yet)

### Standards structure varies by class (verified on live site 2026-04-16)

All 8 classes checked. Tree depth and structure differ per teacher/class:

| Class | Structure | Scale | Notes |
|---|---|---|---|
| Mathematics 7 | Standard → Sub → Assignments (4 stds, 9 subs) | M/P/B/NY | Full 3 layers, deepest tree |
| Social Studies 7 | Standard → Sub → Assignments (4 stds) | M/P/B/NY | Many-to-many assignments across standards |
| English 7 | Standard → Sub (3 stds, some unscored) | M/P/B/NY | "Reading" standard exists but has no scores |
| French 7 | Mixed — some stds have subs, some don't | M/P/B/NY | "Listening" standard has no score at all |
| Music 7 | Mixed — 1 std flat, 1 has sub | M/P/B/NY | Simplest academic content |
| PE 7 | Mostly flat — stds with no subs | M/P/B/NY | Standards directly hold assignments |
| Computer Science 7 | Minimal — "Overall" + habits | **PS/FL** | Different grading scale (Pass/Fail) |
| Science 7 | Only habits standard | M/P/B/NY | No academic content in T3 yet |

Key findings:
- **Tree depth is variable** — not always 3 layers. Standards can have assignments directly (no sub-standard), or have sub-standards, or be empty.
- **Grading scales differ per class** — Computer Science uses PS=1 (Passing) / FL=0 (Failing), all others use M=3/P=2/B=1/NY=0.5.
- **"Completes activities and assignments in a timely manner"** with **"Cycle 1-4 Learning Habits"** sub-standard appears in every class — school-wide behavior tracking, not academic content.
- **Standards can exist with no score** — defined by teacher but no assignments graded yet (French "Listening", English "Reading", PE "Knowledge/Cognitive").
- Our recursive `Standard` type with `children[]` + `assignments[]` handles all variations correctly.

### Current model — what we store

```
grades (per class per scrape)
  class_name (string), status, needs_attention
  → No standards, no progress numbers

assignments (flat, per scrape)
  class_name (string), assignment_name, score, status, due_date
  → No standard reference, no weight, no many-to-many

raw_payloads (JSON blob)
  → Full tree, but only parseable in JS, only for needs_attention classes
```

What's lost:
- Standard → sub-standard tree structure
- Assignment-to-standard mapping (many-to-many)
- Weights (512, 256, 128...)
- Progress numbers (targets meeting/not meeting/total)
- Instructor, ClassID, CGPID
- Standard-level scores and isMeeting flag

### Proposed normalized model

```sql
classes
  id, child_id, te_class_id, te_cgpid, name, instructor, total_targets, updated_at

standards (self-referential tree)
  id, scrape_id, class_id (FK → classes),
  parent_id (FK → standards, NULL for top-level),
  name, score_numeric, score_letter, is_meeting

assignments
  id, scrape_id,
  name, score, score_numeric, score_letter,
  weight, is_missing, due_date, feedback

standard_assignments (junction table — many-to-many)
  standard_id (FK), assignment_id (FK)

grades (simplified snapshot per class per scrape)
  class_id (FK, not string), scrape_id,
  status, needs_attention,
  targets_meeting, targets_not_meeting, targets_not_assessed
```

### What each model supports

| Query | Current | Normalized |
|---|---|---|
| What classes need attention? | ✓ | ✓ |
| What assignments are missing? | ✓ | ✓ |
| Standards breakdown for a class | Parse JSON in JS | SQL query |
| Standard score trend over time | Not possible | SQL query |
| Which standards is an assignment graded under? | Not possible | JOIN standard_assignments |
| Progress bar (5 of 20 targets meeting) | Not stored | grades.targets_meeting |
| Build detail URL without re-scraping | Not possible | classes.te_class_id |

### Status

**Decided (2026-04-16).** Locked as Q17 in design-plan.md. Implementation tracked as Phase 7b (tasks D1–D9) in progress.md.

Decision: fetch all detail pages + normalize with `classes` + `standards` tables. No junction table — many-to-many stays in raw_payloads JSON. See Q17 for full schema.
