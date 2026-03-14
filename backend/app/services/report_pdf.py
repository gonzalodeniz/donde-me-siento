"""Generacion de un PDF A4 imprimible para el workspace."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import math
import random

from backend.app.domains.seating import Event, Guest, GuestType, Table

PAGE_WIDTH = 595.0
PAGE_HEIGHT = 842.0
PAGE_MARGIN = 48.0
BOTTOM_MARGIN = 48.0
LINE_COLOR = (0.45, 0.31, 0.22)
TEXT_COLOR = (0.16, 0.12, 0.1)
MUTED_COLOR = (0.41, 0.34, 0.29)
ACCENT_COLOR = (0.60, 0.31, 0.14)


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _estimated_text_width(value: str, font_size: float) -> float:
    return len(value) * font_size * 0.5


def _wrap_text(value: str, max_width: float, font_size: float) -> list[str]:
    words = value.split()
    if not words:
        return [""]

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if _estimated_text_width(candidate, font_size) <= max_width:
            current = candidate
            continue
        lines.append(current)
        current = word
    lines.append(current)
    return lines


class PdfDocument:
    def __init__(self) -> None:
        self._pages: list[str] = []
        self._current: list[str] = []
        self.new_page()

    def new_page(self) -> None:
        if self._current:
            self._pages.append("\n".join(self._current))
        self._current = []

    def text(self, x: float, y: float, value: str, size: float = 12, bold: bool = False, color: tuple[float, float, float] = TEXT_COLOR) -> None:
        font_name = "F2" if bold else "F1"
        escaped = _escape_pdf_text(value)
        self._current.append(
            f"BT /{font_name} {size:.2f} Tf {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg 1 0 0 1 {x:.2f} {y:.2f} Tm ({escaped}) Tj ET"
        )

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float = 1, color: tuple[float, float, float] = LINE_COLOR) -> None:
        self._current.append(
            f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG {width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S"
        )

    def rect(self, x: float, y: float, width: float, height: float, stroke: tuple[float, float, float] = LINE_COLOR, fill: tuple[float, float, float] | None = None) -> None:
        if fill is None:
            self._current.append(
                f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG {x:.2f} {y:.2f} {width:.2f} {height:.2f} re S"
            )
            return
        self._current.append(
            f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG {fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg {x:.2f} {y:.2f} {width:.2f} {height:.2f} re B"
        )

    def circle(self, cx: float, cy: float, radius: float, stroke: tuple[float, float, float] = LINE_COLOR, fill: tuple[float, float, float] | None = None) -> None:
        kappa = 0.5522847498 * radius
        fill_part = ""
        operator = "S"
        if fill is not None:
            fill_part = f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg "
            operator = "B"
        self._current.append(
            (
                f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG "
                f"{fill_part}"
                f"{cx + radius:.2f} {cy:.2f} m "
                f"{cx + radius:.2f} {cy + kappa:.2f} {cx + kappa:.2f} {cy + radius:.2f} {cx:.2f} {cy + radius:.2f} c "
                f"{cx - kappa:.2f} {cy + radius:.2f} {cx - radius:.2f} {cy + kappa:.2f} {cx - radius:.2f} {cy:.2f} c "
                f"{cx - radius:.2f} {cy - kappa:.2f} {cx - kappa:.2f} {cy - radius:.2f} {cx:.2f} {cy - radius:.2f} c "
                f"{cx + kappa:.2f} {cy - radius:.2f} {cx + radius:.2f} {cy - kappa:.2f} {cx + radius:.2f} {cy:.2f} c {operator}"
            )
        )

    def render(self) -> bytes:
        if self._current:
            self._pages.append("\n".join(self._current))
            self._current = []

        objects: list[bytes] = []

        def add_object(payload: bytes) -> int:
            objects.append(payload)
            return len(objects)

        pages_object_id = add_object(b"<< /Type /Pages /Kids [] /Count 0 >>")
        font_regular_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        font_bold_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

        page_object_ids: list[int] = []
        for content in self._pages:
            content_bytes = content.encode("latin-1", errors="replace")
            content_id = add_object(
                f"<< /Length {len(content_bytes)} >>\nstream\n".encode("latin-1") + content_bytes + b"\nendstream"
            )
            page_id = add_object(
                (
                    "<< /Type /Page "
                    f"/Parent {pages_object_id} 0 R "
                    f"/MediaBox [0 0 {PAGE_WIDTH:.0f} {PAGE_HEIGHT:.0f}] "
                    f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                    f"/Contents {content_id} 0 R >>"
                ).encode("latin-1")
            )
            page_object_ids.append(page_id)

        kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
        objects[pages_object_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>".encode("latin-1")

        catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_object_id} 0 R >>".encode("latin-1"))

        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, payload in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{index} 0 obj\n".encode("latin-1"))
            output.extend(payload)
            output.extend(b"\nendobj\n")

        xref_start = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
        output.extend(
            (
                "trailer\n"
                f"<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
                "startxref\n"
                f"{xref_start}\n"
                "%%EOF"
            ).encode("latin-1")
        )
        return bytes(output)


@dataclass
class ReportLayout:
    pdf: PdfDocument
    cursor_top: float = PAGE_MARGIN

    def ensure_space(self, required_height: float) -> None:
        if self.cursor_top + required_height <= PAGE_HEIGHT - BOTTOM_MARGIN:
            return
        self.pdf.new_page()
        self.cursor_top = PAGE_MARGIN

    def text_block(self, value: str, size: float = 11, bold: bool = False, color: tuple[float, float, float] = TEXT_COLOR, indent: float = 0, gap_after: float = 6) -> None:
        max_width = PAGE_WIDTH - (PAGE_MARGIN * 2) - indent
        lines = _wrap_text(value, max_width, size)
        leading = size * 1.4
        self.ensure_space(len(lines) * leading + gap_after)
        for line in lines:
            baseline = PAGE_HEIGHT - self.cursor_top
            self.pdf.text(PAGE_MARGIN + indent, baseline, line, size=size, bold=bold, color=color)
            self.cursor_top += leading
        self.cursor_top += gap_after

    def section_title(self, value: str, underline: bool = True) -> None:
        self.text_block(value, size=15, bold=True, color=ACCENT_COLOR, gap_after=4)
        if underline:
            self.ensure_space(8)
            y = PAGE_HEIGHT - self.cursor_top
            self.pdf.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y, width=1.2, color=ACCENT_COLOR)
            self.cursor_top += 12
        else:
            self.cursor_top += 4


def _format_guest_type(guest_type: GuestType) -> str:
    if guest_type is GuestType.ADULT:
        return "Adulto"
    if guest_type is GuestType.TEEN:
        return "Adolescente"
    return "Niño"


def _sorted_assigned_guests(event: Event, table_by_id: dict[str, Table]) -> list[Guest]:
    return sorted(
        (guest for guest in event.guests.values() if guest.table_id is not None),
        key=lambda guest: (
            (guest.group_id or "zzzz").casefold(),
            guest.name.casefold(),
            table_by_id[guest.table_id].number if guest.table_id else 10_000,
        ),
    )


def _sorted_unassigned_guests(event: Event) -> list[Guest]:
    return sorted(
        (guest for guest in event.guests.values() if guest.table_id is None),
        key=lambda guest: ((guest.group_id or "zzzz").casefold(), guest.name.casefold()),
    )


def _draw_table_diagram(pdf: PdfDocument, top: float, height: float, tables: list[Table], event: Event) -> float:
    box_x = PAGE_MARGIN
    box_y = PAGE_HEIGHT - top - height
    box_width = PAGE_WIDTH - PAGE_MARGIN * 2
    pdf.rect(box_x, box_y, box_width, height, stroke=(0.78, 0.69, 0.61), fill=(0.995, 0.987, 0.975))

    if not tables:
        pdf.text(box_x + 16, box_y + height - 26, "No hay mesas para representar.", size=11, color=MUTED_COLOR)
        return top + height + 12

    min_x = min(table.position_x for table in tables) - 160.0
    max_x = max(table.position_x for table in tables) + 180.0
    min_y = min(table.position_y for table in tables) - 160.0
    max_y = max(table.position_y for table in tables) + 180.0
    span_x = max(max_x - min_x, 1.0)
    span_y = max(max_y - min_y, 1.0)
    padding = 24.0
    available_w = box_width - padding * 2
    available_h = height - padding * 2
    scale = min(available_w / span_x, available_h / span_y)
    offset_x = box_x + (box_width - span_x * scale) / 2
    offset_y = box_y + (height - span_y * scale) / 2

    for table in tables:
        center_x = offset_x + (table.position_x - min_x) * scale
        center_y = offset_y + (max_y - table.position_y) * scale
        occupied = event.table_occupancy(table.id)
        pdf.circle(center_x, center_y, 24, stroke=ACCENT_COLOR, fill=(1.0, 0.976, 0.945))
        number_text = str(table.number)
        occupancy_text = f"{occupied}/{table.capacity}"
        pdf.text(center_x - _estimated_text_width(number_text, 11) / 2, center_y + 5, number_text, size=11, bold=True, color=ACCENT_COLOR)
        pdf.text(
            center_x - _estimated_text_width(occupancy_text, 7.5) / 2,
            center_y - 8,
            occupancy_text,
            size=7.5,
            color=MUTED_COLOR,
        )

    return top + height + 12


def _draw_summary_cards(pdf: PdfDocument, top: float, items: list[tuple[str, str, tuple[float, float, float]]]) -> float:
    columns = 3
    gap = 12.0
    card_height = 68.0
    card_width = (PAGE_WIDTH - PAGE_MARGIN * 2 - gap * (columns - 1)) / columns

    for index, (label, value, fill) in enumerate(items):
        row = index // columns
        column = index % columns
        x = PAGE_MARGIN + column * (card_width + gap)
        y_top = top + row * (card_height + gap)
        y = PAGE_HEIGHT - y_top - card_height

        pdf.rect(x, y, card_width, card_height, stroke=(0.78, 0.69, 0.61), fill=fill)
        pdf.text(x + 14, y + card_height - 22, label, size=9.2, color=MUTED_COLOR)
        pdf.text(x + 14, y + 18, value, size=21, bold=True, color=ACCENT_COLOR)

    rows = math.ceil(len(items) / columns)
    return top + rows * card_height + max(0, rows - 1) * gap + 10


def generate_workspace_report_pdf(event: Event) -> bytes:
    validation = event.validate_state()
    table_by_id = {table.id: table for table in event.tables.values()}
    tables = sorted(event.tables.values(), key=lambda current: current.number)
    assigned_guests = _sorted_assigned_guests(event, table_by_id)
    unassigned_guests = _sorted_unassigned_guests(event)
    full_tables = sum(1 for table in tables if event.table_occupancy(table.id) >= table.capacity)
    conflict_groups = event.grouping_conflicts()
    occupancy_average = 0
    total_capacity = sum(table.capacity for table in tables)
    if total_capacity > 0:
        occupancy_average = round((len(assigned_guests) / total_capacity) * 100)

    pdf = PdfDocument()
    layout = ReportLayout(pdf)
    couple_label = random.choice(["Héctor y Raquel", "Raquel y Héctor"])
    extracted_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    title_text = "dónde me siento"
    wedding_text = f"Boda de {couple_label}"
    title_size = 24.0
    wedding_size = 15.0
    header_top = PAGE_MARGIN
    header_baseline = PAGE_HEIGHT - header_top
    right_x = PAGE_WIDTH - PAGE_MARGIN - _estimated_text_width(wedding_text, wedding_size)
    pdf.text(PAGE_MARGIN, header_baseline, title_text, size=title_size, bold=True, color=ACCENT_COLOR)
    pdf.text(right_x, header_baseline + 2, wedding_text, size=wedding_size, color=MUTED_COLOR)
    pdf.text(PAGE_MARGIN, header_baseline - 24, f"Fecha y hora del informe: {extracted_at}", size=9.5, color=MUTED_COLOR)
    pdf.line(PAGE_MARGIN, header_baseline - 34, PAGE_WIDTH - PAGE_MARGIN, header_baseline - 34, width=1.1, color=ACCENT_COLOR)
    layout.cursor_top = PAGE_MARGIN + 52

    layout.section_title("Resumen del banquete", underline=False)
    summary_cards = [
        ("Total invitados", str(len(event.guests)), (0.995, 0.987, 0.975)),
        ("Invitados sentados", str(validation["assigned_guests"]), (0.967, 0.986, 0.972)),
        ("Invitados sin sentar", str(validation["unassigned_guests"]), (0.994, 0.973, 0.952)),
        ("Total mesas", str(len(tables)), (0.984, 0.979, 0.996)),
        ("Mesas completas", str(full_tables), (0.976, 0.956, 0.935)),
        ("Mesas con conflicto", str(len(conflict_groups)), (0.998, 0.947, 0.937)),
        ("Ocupación media", f"{occupancy_average}%", (0.949, 0.971, 0.991)),
    ]
    layout.ensure_space(180)
    layout.cursor_top = _draw_summary_cards(pdf, layout.cursor_top, summary_cards)
    layout.cursor_top += 16

    layout.section_title("Diagrama de mesas", underline=False)
    layout.ensure_space(255)
    layout.cursor_top = _draw_table_diagram(pdf, layout.cursor_top, 240, tables, event)

    layout.section_title("Invitados ubicados")
    layout.text_block("Ordenado por familia y por nombre.", size=10, color=MUTED_COLOR, gap_after=4)
    for guest in assigned_guests:
        table_number = table_by_id[guest.table_id].number if guest.table_id else "-"
        family = guest.group_id or "Sin familia"
        confirmation = "Confirmado" if guest.confirmed else "Pendiente"
        layout.text_block(
            f"{family} | {guest.name} | Mesa {table_number} | {_format_guest_type(guest.guest_type)} | {confirmation}",
            size=10.5,
            gap_after=1,
        )

    layout.cursor_top += 6
    layout.section_title("Invitados sin sentar")
    if unassigned_guests:
        for guest in unassigned_guests:
            family = guest.group_id or "Sin familia"
            confirmation = "Confirmado" if guest.confirmed else "Pendiente"
            layout.text_block(
                f"{family} | {guest.name} | {_format_guest_type(guest.guest_type)} | {confirmation}",
                size=10.5,
                gap_after=1,
            )
    else:
        layout.text_block("No hay invitados pendientes de ubicar.", size=10.5, color=MUTED_COLOR)

    layout.cursor_top += 6
    layout.section_title("Conflictos activos")
    if conflict_groups:
        guest_by_id = event.guests
        for group_id, guest_ids in sorted(conflict_groups.items(), key=lambda item: item[0].casefold()):
            layout.text_block(f"Familia {group_id}", size=11.5, bold=True, gap_after=2)
            for guest_id in sorted(guest_ids):
                guest = guest_by_id[guest_id]
                table_number = table_by_id[guest.table_id].number if guest.table_id else "-"
                layout.text_block(f"{guest.name} - mesa {table_number}", size=10.5, indent=12, gap_after=1)
            layout.cursor_top += 3
    else:
        layout.text_block("No hay conflictos activos.", size=10.5, color=MUTED_COLOR)

    return pdf.render()
