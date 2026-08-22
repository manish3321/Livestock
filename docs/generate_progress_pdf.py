"""Generate a daily progress PDF for Farm Management (QR + scan work)."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parent / "Farm-Management-Progress-Summary.pdf"


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
        self.cell(0, 8, "Daily update only - 22 Aug 2026 - QR & animal economics", align="C")


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
    pdf.cell(0, 8, "Daily Progress - QR Codes & Scan Hub", align="C", new_x="LMARGIN", new_y="NEXT")
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
        "Focus: Printable QR, animal/batch economics, in-app camera scan + popup",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)

    h1(pdf, "1. What we did today")
    body(
        pdf,
        "Implemented ear-tag / collar QR for breeding livestock (buffalo, cow, pig, goat) "
        "and optional shed/pond QR for poultry and fish batches. Scanning shows invested vs "
        "earned totals and quick actions. Added a dedicated Scan QR section with live camera "
        "and a popup results sheet.",
    )

    h2(pdf, "1.1 Data model & migration")
    for t in [
        "Animal.breedingStock (boolean, default true) - mark breeding parents",
        "Expense.animalId + Expense.herdBatchId - attribute spend to one animal or batch",
        "Revenue.animalId + Revenue.herdBatchId - attribute milk/sales earnings",
        "HealthRecord.cost - optional NPR cost for vaccines / treatments",
        "Migration: 20260822120000_animal_qr_economics",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.2 Economics APIs")
    for t in [
        "GET /v1/animals/:id/economics - purchase + expenses + health cost vs revenue",
        "GET /v1/batches/:id/economics - batch expenses + health cost vs revenue",
        "Invested = purchase (animals only) + linked expenses + health costs",
        "Earned = linked revenue; Net = earned - invested",
        "Expense / revenue / health create DTOs accept animalId or herdBatchId",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.3 Printable QR codes")
    for t in [
        "QR on animal detail (/animals/stock/:id) and batch detail (/batches/:id)",
        "Encoded URL: {origin}/scan/a/{animalId} or {origin}/scan/b/{batchId}",
        "Print opens a clean printable page (title, QR image, URL)",
        "Not one QR per chicken - poultry/fish use shed/pond (batch) QR instead",
    ]:
        bullet(pdf, t)

    h2(pdf, "1.4 Scan QR hub + popup")
    for t in [
        "New module/nav item: Scan QR -> /scan (Admin, Manager, Worker)",
        "Live camera scanner (html5-qrcode); environment-facing camera",
        "On decode: stop camera and open popup with economics + quick actions",
        "Manual lookup by animal tag or batch name if camera unavailable",
        "Deep links /scan/a/:id and /scan/b/:id also open the same popup",
        "Quick actions: open detail, add expense/health/revenue, breeding, toggle breedingStock",
        "en + ne copy for all new QR / scan strings",
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
            "  URL encodes /scan/a/:id  or  /scan/b/:id",
            "       |",
            "       +--> Phone system camera opens deep link --> popup",
            "       |",
            "       +--> In-app Scan QR (/scan) camera reads QR --> popup",
            "       |",
            "       +--> Manual tag / batch name lookup --> popup",
            "                |",
            "                v",
            "  Popup loads economics API + shows invested / earned / net",
            "  + quick links (expense, health, revenue, breeding)",
        ],
    )

    h2(pdf, "2.2 Linking money & health to a QR target")
    mono_box(
        pdf,
        [
            "  From popup: Add expense / health / revenue",
            "       |",
            "       v",
            "  Form opens with ?animalId=... or ?herdBatchId=... prefilled",
            "       |",
            "       v",
            "  Create stores animalId or herdBatchId on the row",
            "       |",
            "       v",
            "  Next scan: economics totals include that amount",
        ],
    )

    h2(pdf, "2.3 Economics formula")
    mono_box(
        pdf,
        [
            "  Animal",
            "    Invested = purchaseCost + SUM(expenses) + SUM(health.cost)",
            "    Earned   = SUM(revenue)",
            "    Net      = Earned - Invested",
            "",
            "  Batch (shed / pond)",
            "    Invested = SUM(expenses) + SUM(health.cost)",
            "    Earned   = SUM(revenue)",
            "    Net      = Earned - Invested",
        ],
    )

    pdf.add_page()
    h1(pdf, "3. Screens & routes added today")
    rows = [
        ("/scan", "Scan hub - camera + manual lookup"),
        ("/scan/a/:id", "Animal QR deep link -> popup"),
        ("/scan/b/:id", "Batch QR deep link -> popup"),
        ("/animals/stock/:id", "QR print card + economics tiles"),
        ("/batches/:id", "Shed/pond QR print + invested/earned"),
        ("/expenses, /health, /revenue", "Optional animal / batch link fields"),
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
    h2(pdf, "API endpoints added today")
    for t in [
        "GET /v1/animals/:id/economics",
        "GET /v1/batches/:id/economics",
        "POST expense / revenue / health now accept animalId and herdBatchId",
        "Health create accepts optional cost",
    ]:
        bullet(pdf, t)

    h2(pdf, "How to try today's work")
    for t in [
        "Apply migration (already: animal_qr_economics) and restart API if needed",
        "Open a breeding animal -> Print QR; open a poultry/fish batch -> Print QR",
        "Go to Scan QR, allow camera, scan the printout -> check popup totals",
        "From popup add an expense linked to that animal; scan again and confirm invested rose",
        "Camera needs HTTPS or localhost; use tag lookup if camera is blocked",
    ]:
        bullet(pdf, t)

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(90, 90, 90)
    pdf.multi_cell(
        0,
        5,
        "This PDF covers only work completed on 22 August 2026 (QR codes, economics linking, "
        "and the Scan QR hub). Earlier features (batches, money modules, etc.) are unchanged "
        "and are not restated here.",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
