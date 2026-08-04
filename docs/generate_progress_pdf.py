"""Generate a progress summary PDF for Farm Management (batch tracking)."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parent / "Farm-Management-Progress-Summary.pdf"


class Doc(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(90, 110, 90)
        self.cell(0, 8, "Farm Management - Progress Summary", align="L")
        self.cell(0, 8, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(45, 90, 55)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "Generated for local project review - Jul 2026", align="C")


def h1(pdf: Doc, text: str) -> None:
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(28, 55, 35)
    pdf.multi_cell(0, 9, text)
    pdf.ln(2)


def h2(pdf: Doc, text: str) -> None:
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(35, 85, 50)
    pdf.multi_cell(0, 7, text)
    pdf.ln(1)


def body(pdf: Doc, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(35, 35, 35)
    pdf.multi_cell(0, 5.5, text)
    pdf.ln(1)


def bullet(pdf: Doc, text: str, indent: float = 4) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(35, 35, 35)
    x = pdf.l_margin + indent
    pdf.set_x(x)
    pdf.multi_cell(pdf.w - pdf.r_margin - x, 5.5, f"- {text}")


def mono_box(pdf: Doc, lines: list[str]) -> None:
    pdf.set_fill_color(245, 248, 242)
    pdf.set_draw_color(180, 200, 175)
    pdf.set_font("Courier", "", 8.5)
    pdf.set_text_color(30, 45, 30)
    start_y = pdf.get_y()
    content = "\n".join(lines)
    # estimate height
    line_h = 4.2
    h = line_h * len(lines) + 6
    if pdf.get_y() + h > pdf.h - pdf.b_margin:
        pdf.add_page()
        start_y = pdf.get_y()
    pdf.rect(pdf.l_margin, start_y, pdf.w - pdf.l_margin - pdf.r_margin, h, style="DF")
    pdf.set_xy(pdf.l_margin + 3, start_y + 3)
    for line in lines:
        pdf.cell(0, line_h, line, new_x="LMARGIN", new_y="NEXT")
        pdf.set_x(pdf.l_margin + 3)
    pdf.set_y(start_y + h + 3)


def main() -> None:
    pdf = Doc(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    # Cover / title
    pdf.set_fill_color(34, 85, 50)
    pdf.rect(0, 0, 210, 42, style="F")
    pdf.set_y(14)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 10, "Farm Management System", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, "Progress Summary & How Things Work", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(48)
    pdf.set_text_color(80, 80, 80)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Date: 30 July 2026  |  Stack: NestJS + Prisma + React (Vite) + PostgreSQL", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "Focus: Category / age batch tracking + monthly herd reports", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    h1(pdf, "1. What has been done")
    body(
        pdf,
        "The farm ERP already had the 12 web modules (dashboard, animals, poultry groups, "
        "fish, expenses, revenue, P&L, inventory, health, breeding, production, reports). "
        "The latest completed feature replaces livestock-first individual listing with "
        "named category/age batches for livestock, poultry, and fish - with illness and "
        "mortality logging and downloadable monthly CSV reports.",
    )

    h2(pdf, "1.1 Platform foundation (already in place)")
    for t in [
        "Monorepo: apps/api, apps/web, packages/contracts, packages/design-tokens",
        "Auth: JWT login + refresh; roles Admin / Manager / Worker with RBAC",
        "Local PostgreSQL + Prisma migrations and seed users",
        "Web UI: forest-green farm look, English + Nepali (en/ne)",
        "Modules for money (expenses approval, revenue, P&L) and operations (inventory, health, production)",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.2 Category / age batch tracking (this pass - complete)")
    for t in [
        "Prisma models: HerdBatch, BatchIllnessEvent, BatchMortalityEvent (+ migration)",
        "Unified batch kinds: LIVESTOCK | POULTRY | FISH with category, age range, counts",
        "Nest batches API: CRUD, illness log, mortality log, filters by kind/category",
        "Dashboard headcounts from sum of batch currentCount (by kind:category)",
        "Monthly herd report JSON + CSV (year, month, optional kind)",
        "Seed: example batches + illness/mortality; 1-2 breeding animals kept",
        "Web: /animals, /groups, /fish use shared batch cards; /batches/:id for detail",
        "Individuals demoted to Breeding stock at /animals/stock",
        "Reports UI: month/kind picker + Download monthly CSV",
        "Shared Zod schemas in @farm/contracts + en/ne copy for batches/reports",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.3 Out of scope (not done this pass)")
    for t in [
        "Photo marketplace-style cards for individual animals",
        "Changes to expense / revenue / P&L business logic",
    ]:
        bullet(pdf, t)

    pdf.add_page()
    h1(pdf, "2. Domain model")
    body(
        pdf,
        "Primary unit of tracking is a named HerdBatch (e.g. \"Buffalo 2024 calves\", age 0-12 months). "
        "Illness and deaths are count-based on the batch, not on named animals. "
        "Optional Animal records remain only for breeding parents.",
    )

    mono_box(
        pdf,
        [
            "  HerdBatch",
            "  ---------",
            "  kind              LIVESTOCK | POULTRY | FISH",
            "  category          e.g. BUFFALO, LAYER, ROHU",
            "  name              user label",
            "  ageFrom/ToMonths  optional age band",
            "  initialCount      starting headcount",
            "  currentCount      live headcount now",
            "  deadCount         cumulative deaths",
            "",
            "  BatchIllnessEvent     condition + count + date",
            "  BatchMortalityEvent   count + reason + date  --> reduces currentCount",
            "",
            "  Animal (optional) --> BreedingRecord.motherId  (breeding parents only)",
        ],
    )

    h2(pdf, "Illness conditions (fixed vocabulary)")
    body(
        pdf,
        "FMD, Mastitis, Newcastle, Parasites, Injury, Respiratory, Digestive, Skin, Other "
        "(extensible as string values in practice via the shared list in contracts).",
    )

    pdf.add_page()
    h1(pdf, "3. How things work - workflows")

    h2(pdf, "3.1 Daily / ops workflow (batches)")
    mono_box(
        pdf,
        [
            "  [Login] --> [Home dashboard]",
            "                 |",
            "                 +--> Livestock (/animals)  --+--> batch cards by category",
            "                 +--> Poultry  (/groups)    --+",
            "                 +--> Fish     (/fish)      --+--> open Batch detail",
            "                                                      |",
            "                              +------------------------+------------------+",
            "                              |                        |                  |",
            "                         Log sick               Log death          Breeding stock",
            "                    (condition + count)     (count + reason)     (/animals/stock)",
            "                              |                        |",
            "                              v                        v",
            "                    BatchIllnessEvent      BatchMortalityEvent",
            "                    (sick by condition)   currentCount -= deaths",
            "                                          deadCount   += deaths",
        ],
    )

    h2(pdf, "3.2 Create a new batch")
    mono_box(
        pdf,
        [
            "  User opens Livestock / Poultry / Fish",
            "       |",
            "       v",
            "  Add batch: name, category, age from-to (months), initial count",
            "       |",
            "       v",
            "  POST /v1/batches  -->  HerdBatch created",
            "       |",
            "       v",
            "  Redirect to /batches/:id  (counts, illness, deaths)",
        ],
    )

    h2(pdf, "3.3 Monthly report workflow")
    mono_box(
        pdf,
        [
            "  Reports page",
            "       |",
            "       +--> pick Year + Month + Kind (All / Livestock / Poultry / Fish)",
            "       |",
            "       +--> View monthly summary",
            "       |         GET /v1/reports/herd-monthly?year=&month=&kind=",
            "       |         --> JSON: totals + per-batch rows",
            "       |             (current, dead, diedThisMonth, sickLoggedThisMonth,",
            "       |              sickByCondition)",
            "       |",
            "       +--> Download monthly CSV",
            "                 GET /v1/reports/herd-monthly.csv",
            "                 --> file: herd-monthly-YYYY-MM.csv",
        ],
    )

    pdf.add_page()
    h2(pdf, "3.4 Breeding (optional individuals)")
    mono_box(
        pdf,
        [
            "  Breeding page",
            "       |",
            "       +--> copy explains parents are optional tagged animals",
            "       |",
            "       +--> Manage breeding stock --> /animals/stock",
            "       |                              (list / add / edit Animal)",
            "       |",
            "       +--> Add mating: select mother (FEMALE animals), type, dates",
            "                        --> BreedingRecord linked via motherId",
            "",
            "  Note: headcount for the farm comes from batches, not from Animal list size.",
        ],
    )

    h2(pdf, "3.5 Dashboard snapshot")
    mono_box(
        pdf,
        [
            "  GET dashboard summary",
            "       |",
            "       +--> animalCount = SUM(HerdBatch.currentCount)",
            "       +--> speciesDistribution = group by \"kind:category\"",
            "       +--> alerts: health overdue, inventory critical, pending approvals",
            "       +--> finance tiles (if role can finance:read)",
        ],
    )

    h2(pdf, "3.6 Request path (technical)")
    mono_box(
        pdf,
        [
            "  Browser (Vite :5173)",
            "       |  proxy /v1",
            "       v",
            "  Nest API (:4000)  -- JWT RBAC -->  Batches / Reports / Dashboard modules",
            "       |",
            "       v",
            "  Prisma  -->  PostgreSQL (farm DB)",
            "",
            "  Shared types & Zod DTOs live in packages/contracts (@farm/contracts).",
        ],
    )

    pdf.add_page()
    h1(pdf, "4. Key screens & routes")
    rows = [
        ("/dashboard", "Home snapshot (batch headcounts)"),
        ("/animals", "Livestock batches (primary)"),
        ("/animals/stock", "Breeding stock (optional individuals)"),
        ("/groups", "Poultry batches"),
        ("/fish", "Fish batches"),
        ("/batches/:id", "Batch detail - sick / death logs"),
        ("/breeding", "Mating records + link to stock"),
        ("/reports", "Monthly herd report + other summaries"),
        ("/expenses, /revenue, /pnl", "Money modules (unchanged this pass)"),
        ("/inventory, /health, /production", "Ops modules (unchanged this pass)"),
    ]
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(34, 85, 50)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(70, 7, "Route", border=1, fill=True)
    pdf.cell(0, 7, "Purpose", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(30, 30, 30)
    fill = False
    for route, purpose in rows:
        if fill:
            pdf.set_fill_color(242, 247, 242)
        else:
            pdf.set_fill_color(255, 255, 255)
        pdf.cell(70, 6.5, route, border=1, fill=True)
        pdf.cell(0, 6.5, purpose, border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
        fill = not fill

    pdf.set_x(pdf.l_margin)
    pdf.ln(4)
    h2(pdf, "Main API endpoints (batches / reports)")
    for t in [
        "GET/POST /v1/batches - list / create",
        "GET/PATCH/DELETE /v1/batches/:id",
        "GET/POST /v1/batches/:id/illness",
        "GET/POST /v1/batches/:id/mortality",
        "GET /v1/reports/herd-monthly",
        "GET /v1/reports/herd-monthly.csv",
    ]:
        bullet(pdf, t)

    pdf.set_x(pdf.l_margin)
    pdf.ln(2)
    h1(pdf, "5. How to run locally")
    mono_box(
        pdf,
        [
            "  pnpm install",
            "  pnpm --filter @farm/contracts build",
            "  # PostgreSQL running; apps/api/.env configured",
            "  pnpm --filter @farm/api db:migrate",
            "  pnpm --filter @farm/api db:seed",
            "  pnpm dev:api     # http://localhost:4000",
            "  pnpm dev:web     # http://localhost:5173",
            "",
            "  Login: admin@farm.local  /  ChangeMe123!",
        ],
    )

    h2(pdf, "Suggested next checks")
    for t in [
        "Create a livestock batch, log sick and a death, confirm counts update",
        "Download monthly CSV for current month",
        "Open Breeding stock and confirm it is separate from Livestock batches",
        "Switch language to Nepali and spot-check batch/report labels",
    ]:
        bullet(pdf, t)

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(90, 90, 90)
    pdf.multi_cell(
        0,
        5,
        "This document summarizes work completed through the Category / age batch tracking "
        "pass. It does not replace docs/architecture.md, docs/rbac.md, or the OpenAPI docs at /docs.",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
