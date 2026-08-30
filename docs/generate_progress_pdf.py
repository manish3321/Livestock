"""Generate a daily progress PDF for Farm Management (22 Aug 2026 work)."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parent / "Farm-Management-Progress-Summary.pdf"
OUT_DATED = Path(__file__).resolve().parent / "Farm-Management-Daily-Update-2026-08-22.pdf"


class Doc(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(90, 110, 90)
        self.cell(0, 8, "Farm Management - Daily Update (22 Aug 2026)", align="L")
        self.cell(0, 8, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(45, 90, 55)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(
            0,
            8,
            "Daily update only - 22 Aug 2026 - QR, economics, scan, breeding history",
            align="C",
        )


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

    # Cover
    pdf.set_fill_color(34, 85, 50)
    pdf.rect(0, 0, 210, 42, style="F")
    pdf.set_y(14)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 10, "Farm Management System", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(
        0,
        8,
        "Daily Progress - QR, Economics, Scan & Breeding",
        align="C",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_y(48)
    pdf.set_text_color(80, 80, 80)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(
        0,
        6,
        "Date: 22 August 2026  |  Scope: today's work only",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(
        0,
        6,
        "Focus: QR tags, invested/earned, Scan hub popup, breeding history on animal page",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)

    h1(pdf, "1. What we did today")
    body(
        pdf,
        "Added printable QR for breeding livestock and shed/pond batches, animal/batch "
        "economics (invested vs earned), an in-app Scan QR hub with camera + popup, and "
        "breeding history on the breeding-stock animal detail page.",
    )

    h2(pdf, "1.1 Data model & migration")
    for t in [
        "Animal.breedingStock - flag breeding parents",
        "Expense / Revenue animalId + herdBatchId - attribute money to a target",
        "HealthRecord.cost - optional vaccine/treatment cost (NPR)",
        "Migration: 20260822120000_animal_qr_economics",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.2 Economics APIs")
    for t in [
        "GET /v1/animals/:id/economics and GET /v1/batches/:id/economics",
        "Invested = purchase (animals) + linked expenses + health costs",
        "Earned = linked revenue; Net = earned - invested",
        "Expense / revenue / health forms can link animal or batch (incl. deep links)",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.3 Printable QR + Scan hub")
    for t in [
        "QR on /animals/stock/:id and /batches/:id (Print QR)",
        "URL: /scan/a/:id (animal) or /scan/b/:id (batch)",
        "Nav module Scan QR -> /scan with live camera (html5-qrcode)",
        "Popup shows economics + quick actions (expense, health, revenue, breeding)",
        "Manual lookup by animal tag or batch name if camera unavailable",
        "en + ne copy for QR / scan strings",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.4 Breeding history on animal detail")
    for t in [
        "Breeding history card on /animals/stock/:id (was missing before)",
        "Shows mating type, mating/due dates, days left, status, offspring, father/AI",
        "GET /v1/breeding?motherId= filters records for that animal",
        "Add mating opens /breeding?animalId= with mother preselected",
        "DTO includes motherTag + daysRemaining for list/UI",
    ]:
        bullet(pdf, t)

    pdf.add_page()
    h1(pdf, "2. How it works")

    h2(pdf, "2.1 Print -> scan -> popup")
    mono_box(
        pdf,
        [
            "  Print QR on animal / batch detail",
            "       |",
            "       v",
            "  Encodes /scan/a/:id  or  /scan/b/:id",
            "       |",
            "       +--> Phone camera deep link --> popup",
            "       +--> In-app Scan QR camera --> popup",
            "       +--> Manual tag / batch lookup --> popup",
            "                |",
            "                v",
            "  Economics API + quick actions",
        ],
    )

    h2(pdf, "2.2 Animal page layout (today)")
    mono_box(
        pdf,
        [
            "  /animals/stock/:id",
            "    - Hero + QR / Edit / Delete",
            "    - Invested / Earned / Net tiles",
            "    - Basic information (incl. Breeding stock Yes/No)",
            "    - Printable QR card",
            "    - Weight history",
            "    - Breeding history (NEW) + Add mating link",
        ],
    )

    h2(pdf, "2.3 Economics formula")
    mono_box(
        pdf,
        [
            "  Animal: Invested = purchase + expenses + health.cost",
            "          Earned   = revenue;  Net = Earned - Invested",
            "  Batch:  Invested = expenses + health.cost (no purchase)",
            "          Earned   = revenue;  Net = Earned - Invested",
        ],
    )

    pdf.add_page()
    h1(pdf, "3. Screens & APIs added/changed today")
    rows = [
        ("/scan", "Scan hub - camera + lookup + popup"),
        ("/scan/a/:id, /scan/b/:id", "QR deep links -> same popup"),
        ("/animals/stock/:id", "QR, economics tiles, breeding history"),
        ("/batches/:id", "Shed/pond QR + invested/earned"),
        ("/breeding?animalId=", "Add mating prefilled for mother"),
        ("/expenses, /health, /revenue", "Optional animal / batch link"),
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
    h2(pdf, "API endpoints")
    for t in [
        "GET /v1/animals/:id/economics",
        "GET /v1/batches/:id/economics",
        "GET /v1/breeding?motherId= (filter for animal page)",
        "POST expense/revenue/health accept animalId / herdBatchId; health cost optional",
    ]:
        bullet(pdf, t)

    h2(pdf, "How to try")
    for t in [
        "Open breeding animal -> see economics + QR + Breeding history card",
        "Add mating from animal page if history is empty",
        "Open Scan QR, look up BUF001 (or scan a printout) -> popup totals",
        "Link an expense to the animal; refresh economics / scan again",
        "Camera needs HTTPS or localhost; use tag lookup if camera is blocked",
    ]:
        bullet(pdf, t)

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(90, 90, 90)
    pdf.multi_cell(
        0,
        5,
        "This PDF covers only work completed on 22 August 2026. Earlier features "
        "(batches, money modules, etc.) are not restated here.",
    )

    pdf.output(str(OUT))
    OUT_DATED.write_bytes(OUT.read_bytes())
    print(f"Wrote {OUT}")
    print(f"Wrote {OUT_DATED}")


if __name__ == "__main__":
    main()
