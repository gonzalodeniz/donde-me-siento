"""Generacion de un PDF A4 imprimible para el workspace."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import math
import random

from backend.app.domains.seating import Event, Guest, GuestMenu, GuestType, Table

PAGE_WIDTH = 595.0
PAGE_HEIGHT = 842.0
PAGE_MARGIN = 48.0
TOP_CONTENT_MARGIN = 78.0
BOTTOM_MARGIN = 48.0
LINE_COLOR = (0.45, 0.31, 0.22)
TEXT_COLOR = (0.16, 0.12, 0.1)
MUTED_COLOR = (0.41, 0.34, 0.29)
ACCENT_COLOR = (0.60, 0.31, 0.14)
ROUND_TABLE_RADIUS = 52.0
ROUND_SEAT_RADIUS = 98.0
COUPLE_TABLE_WIDTH = 176.0
COUPLE_TABLE_HEIGHT = 74.0
COUPLE_SEAT_SIDE_OFFSET_X = 38.0
COUPLE_SEAT_SIDE_OFFSET_Y = -74.0


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

    def polygon(
        self,
        points: list[tuple[float, float]],
        stroke: tuple[float, float, float] = LINE_COLOR,
        fill: tuple[float, float, float] | None = None,
    ) -> None:
        if len(points) < 3:
            return
        commands = [f"{points[0][0]:.2f} {points[0][1]:.2f} m"]
        commands.extend(f"{x:.2f} {y:.2f} l" for x, y in points[1:])
        commands.append("h")
        if fill is None:
            self._current.append(
                f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG {' '.join(commands)} S"
            )
            return
        self._current.append(
            f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG "
            f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg "
            f"{' '.join(commands)} B"
        )

    def render(self, *, repeating_header: str | None = None) -> bytes:
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
        total_pages = len(self._pages)
        for page_number, content in enumerate(self._pages, start=1):
            decorations: list[str] = []
            if repeating_header and page_number > 1:
                header_baseline = PAGE_HEIGHT - 30
                decorations.append(
                    f"BT /F2 10.50 Tf {MUTED_COLOR[0]:.3f} {MUTED_COLOR[1]:.3f} {MUTED_COLOR[2]:.3f} rg 1 0 0 1 {PAGE_MARGIN:.2f} {header_baseline:.2f} Tm ({_escape_pdf_text(repeating_header)}) Tj ET"
                )
                decorations.append(
                    f"{ACCENT_COLOR[0]:.3f} {ACCENT_COLOR[1]:.3f} {ACCENT_COLOR[2]:.3f} RG 0.9 w {PAGE_MARGIN:.2f} {header_baseline - 10:.2f} m {PAGE_WIDTH - PAGE_MARGIN:.2f} {header_baseline - 10:.2f} l S"
                )
            page_number_text = str(page_number)
            decorations.append(
                f"BT /F1 9.00 Tf {MUTED_COLOR[0]:.3f} {MUTED_COLOR[1]:.3f} {MUTED_COLOR[2]:.3f} rg 1 0 0 1 {PAGE_WIDTH - PAGE_MARGIN - _estimated_text_width(page_number_text, 9):.2f} 24.00 Tm ({page_number_text}) Tj ET"
            )
            full_content = "\n".join([*decorations, content])
            content_bytes = full_content.encode("latin-1", errors="replace")
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
    cursor_top: float = TOP_CONTENT_MARGIN

    def ensure_space(self, required_height: float) -> None:
        if self.cursor_top + required_height <= PAGE_HEIGHT - BOTTOM_MARGIN:
            return
        self.pdf.new_page()
        self.cursor_top = TOP_CONTENT_MARGIN

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


def _format_guest_menu(menu: GuestMenu) -> str:
    if menu is GuestMenu.MEAT:
        return "Carne"
    if menu is GuestMenu.FISH:
        return "Pescado"
    if menu is GuestMenu.VEGAN:
        return "Vegano"
    return "Desconocido"


def _truncate_guest_name(name: str) -> str:
    return name if len(name) <= 10 else f"{name[:9]}…"


def _rotate_offset(offset_x: float, offset_y: float, rotation_degrees: float) -> tuple[float, float]:
    angle = math.radians(rotation_degrees)
    cos_value = math.cos(angle)
    sin_value = math.sin(angle)
    return (
        (offset_x * cos_value) - (offset_y * sin_value),
        (offset_x * sin_value) + (offset_y * cos_value),
    )


def _build_table_guest_map(event: Event, table: Table) -> dict[int, Guest]:
    ordered_guests = sorted(
        (guest for guest in event.guests.values() if guest.table_id == table.id),
        key=lambda current: (
            current.seat_index if current.seat_index is not None else 10_000,
            current.name.casefold(),
        ),
    )
    guests_by_seat: dict[int, Guest] = {}
    for guest in ordered_guests:
        if guest.seat_index is not None and 0 <= guest.seat_index < table.capacity and guest.seat_index not in guests_by_seat:
            guests_by_seat[guest.seat_index] = guest
            continue
        for seat_index in range(table.capacity):
            if seat_index not in guests_by_seat:
                guests_by_seat[seat_index] = guest
                break
    return guests_by_seat


def _table_seat_position(table: Table, seat_index: int, seat_count: int) -> tuple[float, float]:
    if table.is_couple:
        seat_spacing = 0.0 if seat_count == 1 else (((seat_index / (seat_count - 1)) * 2) - 1) * COUPLE_SEAT_SIDE_OFFSET_X
        rotated_x, rotated_y = _rotate_offset(seat_spacing, COUPLE_SEAT_SIDE_OFFSET_Y, table.rotation_degrees)
        return table.position_x + rotated_x, table.position_y + rotated_y

    angle = (math.tau * seat_index / seat_count) - (math.pi / 2)
    return (
        table.position_x + math.cos(angle) * ROUND_SEAT_RADIUS,
        table.position_y + math.sin(angle) * ROUND_SEAT_RADIUS,
    )


def _table_diagram_bounds(tables: list[Table]) -> tuple[float, float, float, float]:
    points: list[tuple[float, float]] = []
    for table in tables:
        if table.is_couple:
            points.extend(
                [
                    (table.position_x - 220.0, table.position_y - 170.0),
                    (table.position_x + 220.0, table.position_y + 170.0),
                ]
            )
        else:
            points.extend(
                [
                    (table.position_x - 160.0, table.position_y - 160.0),
                    (table.position_x + 180.0, table.position_y + 180.0),
                ]
            )

        for seat_index in range(max(table.capacity, 1)):
            seat_x, seat_y = _table_seat_position(table, seat_index, max(table.capacity, 1))
            points.extend([(seat_x - 40.0, seat_y - 40.0), (seat_x + 40.0, seat_y + 40.0)])

    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_y = max(point[1] for point in points)
    return min_x, max_x, min_y, max_y


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

    min_x, max_x, min_y, max_y = _table_diagram_bounds(tables)
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
        if table.is_couple:
            half_width = (COUPLE_TABLE_WIDTH * scale) / 2
            half_height = (COUPLE_TABLE_HEIGHT * scale) / 2
            corners = [
                _rotate_offset(-half_width, -half_height, table.rotation_degrees),
                _rotate_offset(half_width, -half_height, table.rotation_degrees),
                _rotate_offset(half_width, half_height, table.rotation_degrees),
                _rotate_offset(-half_width, half_height, table.rotation_degrees),
            ]
            pdf.polygon(
                [(center_x + offset_x, center_y - offset_y) for offset_x, offset_y in corners],
                stroke=ACCENT_COLOR,
                fill=(1.0, 0.976, 0.945),
            )
            number_text = "Novios"
        else:
            pdf.circle(center_x, center_y, ROUND_TABLE_RADIUS * scale, stroke=ACCENT_COLOR, fill=(1.0, 0.976, 0.945))
            number_text = str(table.number)
        occupancy_text = f"{occupied}/{table.capacity}"
        number_size = max(9.0, min(14.0, 11.0 * scale * 1.2))
        occupancy_size = max(6.8, min(9.0, 7.5 * scale * 1.1))
        pdf.text(center_x - _estimated_text_width(number_text, number_size) / 2, center_y + 5, number_text, size=number_size, bold=True, color=ACCENT_COLOR)
        pdf.text(
            center_x - _estimated_text_width(occupancy_text, occupancy_size) / 2,
            center_y - 8,
            occupancy_text,
            size=occupancy_size,
            color=MUTED_COLOR,
        )

        guests_by_seat = _build_table_guest_map(event, table)
        for seat_index in range(max(table.capacity, 1)):
            seat_x, seat_y = _table_seat_position(table, seat_index, max(table.capacity, 1))
            rendered_x = offset_x + (seat_x - min_x) * scale
            rendered_y = offset_y + (max_y - seat_y) * scale
            guest = guests_by_seat.get(seat_index)
            is_conflict = guest is not None and guest.id in {
                guest_id
                for conflict_guest_ids in event.grouping_conflicts().values()
                for guest_id in conflict_guest_ids
            }
            fill = (1.0, 0.983, 0.962)
            stroke = (0.84, 0.76, 0.69)
            if guest is not None:
                if is_conflict:
                    fill = (0.976, 0.856, 0.824)
                    stroke = (0.72, 0.33, 0.18)
                elif guest.guest_type is GuestType.TEEN:
                    fill = (0.878, 0.949, 0.988)
                    stroke = (0.33, 0.57, 0.71)
                elif guest.guest_type is GuestType.CHILD:
                    fill = (0.890, 0.969, 0.902)
                    stroke = (0.36, 0.62, 0.40)
                else:
                    fill = (0.952, 0.916, 0.878)
                    stroke = (0.64, 0.50, 0.40)

            seat_radius = max(11.0, min(18.0, 18.0 * scale))
            pdf.circle(rendered_x, rendered_y, seat_radius, stroke=stroke, fill=fill)
            if guest is not None:
                guest_label = _truncate_guest_name(guest.name)
                label_size = max(5.6, min(8.2, 7.2 * scale))
                pdf.text(
                    rendered_x - _estimated_text_width(guest_label, label_size) / 2,
                    rendered_y - (label_size / 3),
                    guest_label,
                    size=label_size,
                    bold=True,
                    color=TEXT_COLOR,
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


def _estimate_summary_cards_height(item_count: int) -> float:
    columns = 3
    gap = 12.0
    card_height = 68.0
    rows = math.ceil(item_count / columns)
    return rows * card_height + max(0, rows - 1) * gap + 10


def _draw_data_table(
    layout: ReportLayout,
    columns: list[str],
    rows: list[list[str]],
    width_fractions: list[float],
    empty_message: str,
) -> None:
    table_width = PAGE_WIDTH - PAGE_MARGIN * 2
    column_widths = [table_width * fraction for fraction in width_fractions]
    header_height = 26.0
    line_height = 10.8
    cell_padding_x = 8.0
    cell_padding_y = 7.0

    def draw_row_background(y_top: float, row_height: float, fill: tuple[float, float, float]) -> None:
        y = PAGE_HEIGHT - y_top - row_height
        layout.pdf.rect(PAGE_MARGIN, y, table_width, row_height, stroke=(0.80, 0.72, 0.65), fill=fill)
        cursor_x = PAGE_MARGIN
        for width in column_widths[:-1]:
            cursor_x += width
            layout.pdf.line(cursor_x, y, cursor_x, y + row_height, width=0.7, color=(0.86, 0.79, 0.73))

    def draw_header() -> None:
        layout.ensure_space(header_height)
        draw_row_background(layout.cursor_top, header_height, (0.972, 0.948, 0.925))
        cursor_x = PAGE_MARGIN
        baseline = PAGE_HEIGHT - layout.cursor_top - 17
        for index, label in enumerate(columns):
            layout.pdf.text(cursor_x + cell_padding_x, baseline, label, size=9.4, bold=True, color=ACCENT_COLOR)
            cursor_x += column_widths[index]
        layout.cursor_top += header_height

    draw_header()

    if not rows:
        empty_height = 24.0
        layout.ensure_space(empty_height)
        draw_row_background(layout.cursor_top, empty_height, (0.995, 0.990, 0.983))
        layout.pdf.text(PAGE_MARGIN + cell_padding_x, PAGE_HEIGHT - layout.cursor_top - 16, empty_message, size=9.8, color=MUTED_COLOR)
        layout.cursor_top += empty_height + 6
        return

    for row_index, row in enumerate(rows):
        wrapped_cells = [
            _wrap_text(cell, max(column_widths[column_index] - cell_padding_x * 2, 24), 9.3)
            for column_index, cell in enumerate(row)
        ]
        row_line_count = max(len(lines) for lines in wrapped_cells)
        row_height = max(24.0, row_line_count * line_height + cell_padding_y * 2)

        if layout.cursor_top + row_height > PAGE_HEIGHT - BOTTOM_MARGIN:
            layout.pdf.new_page()
            layout.cursor_top = PAGE_MARGIN
            draw_header()

        fill = (0.998, 0.995, 0.990) if row_index % 2 == 0 else (0.989, 0.983, 0.974)
        draw_row_background(layout.cursor_top, row_height, fill)

        cursor_x = PAGE_MARGIN
        for column_index, lines in enumerate(wrapped_cells):
            text_top = layout.cursor_top + cell_padding_y
            for line_index, line in enumerate(lines):
                baseline = PAGE_HEIGHT - (text_top + line_index * line_height) - 8
                layout.pdf.text(cursor_x + cell_padding_x, baseline, line, size=9.3, color=TEXT_COLOR)
            cursor_x += column_widths[column_index]

        layout.cursor_top += row_height

    layout.cursor_top += 8


def generate_workspace_report_pdf(event: Event) -> bytes:
    validation = event.validate_state()
    table_by_id = {table.id: table for table in event.tables.values()}
    tables = sorted(event.tables.values(), key=lambda current: current.number)
    all_guests = list(event.guests.values())
    assigned_guests = _sorted_assigned_guests(event, table_by_id)
    unassigned_guests = _sorted_unassigned_guests(event)
    full_tables = sum(1 for table in tables if event.table_occupancy(table.id) >= table.capacity)
    conflict_groups = event.grouping_conflicts()
    confirmed_guests = sum(1 for guest in all_guests if guest.confirmed)
    unconfirmed_guests = len(all_guests) - confirmed_guests
    adult_guests = sum(1 for guest in all_guests if guest.guest_type is GuestType.ADULT)
    teen_guests = sum(1 for guest in all_guests if guest.guest_type is GuestType.TEEN)
    child_guests = sum(1 for guest in all_guests if guest.guest_type is GuestType.CHILD)
    fish_menu_guests = sum(1 for guest in all_guests if guest.menu is GuestMenu.FISH)
    meat_menu_guests = sum(1 for guest in all_guests if guest.menu is GuestMenu.MEAT)
    vegetarian_menu_guests = sum(1 for guest in all_guests if guest.menu is GuestMenu.VEGAN)
    unknown_menu_guests = sum(1 for guest in all_guests if guest.menu is GuestMenu.UNKNOWN)
    occupancy_average = 0
    total_capacity = sum(table.capacity for table in tables)
    if total_capacity > 0:
        occupancy_average = round((len(assigned_guests) / total_capacity) * 100)

    couple_label = random.choice(["Héctor y Raquel", "Raquel y Héctor"])
    repeating_header = f"Gran boda de {couple_label}"
    pdf = PdfDocument()
    layout = ReportLayout(pdf)
    extracted_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    title_text = "dónde me siento"
    wedding_text = f"Boda de {couple_label}"
    title_size = 24.0
    wedding_size = 15.0
    header_top = TOP_CONTENT_MARGIN
    header_baseline = PAGE_HEIGHT - header_top
    right_x = PAGE_WIDTH - PAGE_MARGIN - _estimated_text_width(wedding_text, wedding_size)
    pdf.text(PAGE_MARGIN, header_baseline, title_text, size=title_size, bold=True, color=ACCENT_COLOR)
    pdf.text(right_x, header_baseline + 2, wedding_text, size=wedding_size, color=MUTED_COLOR)
    pdf.text(PAGE_MARGIN, header_baseline - 24, f"Fecha y hora del informe: {extracted_at}", size=9.5, color=MUTED_COLOR)
    pdf.line(PAGE_MARGIN, header_baseline - 34, PAGE_WIDTH - PAGE_MARGIN, header_baseline - 34, width=1.1, color=ACCENT_COLOR)
    layout.cursor_top = TOP_CONTENT_MARGIN + 52

    layout.section_title("Resumen del banquete", underline=False)
    summary_cards = [
        ("Total invitados", str(len(event.guests)), (0.995, 0.987, 0.975)),
        ("Invitados sentados", str(validation["assigned_guests"]), (0.967, 0.986, 0.972)),
        ("Invitados sin sentar", str(validation["unassigned_guests"]), (0.994, 0.973, 0.952)),
        ("Total mesas", str(len(tables)), (0.984, 0.979, 0.996)),
        ("Mesas completas", str(full_tables), (0.976, 0.956, 0.935)),
        ("Ubicaciones por revisar", str(len(conflict_groups)), (0.998, 0.947, 0.937)),
        ("Ocupación media", f"{occupancy_average}%", (0.949, 0.971, 0.991)),
        ("Confirmados", str(confirmed_guests), (0.958, 0.985, 0.969)),
        ("Sin confirmar", str(unconfirmed_guests), (0.995, 0.967, 0.949)),
        ("Adultos", str(adult_guests), (0.986, 0.975, 0.954)),
        ("Adolescentes", str(teen_guests), (0.942, 0.972, 0.991)),
        ("Niños", str(child_guests), (0.947, 0.984, 0.952)),
        ("Comen pescado", str(fish_menu_guests), (0.943, 0.974, 0.992)),
        ("Comen carne", str(meat_menu_guests), (0.988, 0.965, 0.941)),
        ("Vegetarianos", str(vegetarian_menu_guests), (0.949, 0.984, 0.952)),
        ("Menú desconocido", str(unknown_menu_guests), (0.978, 0.975, 0.949)),
    ]
    layout.ensure_space(_estimate_summary_cards_height(len(summary_cards)))
    layout.cursor_top = _draw_summary_cards(pdf, layout.cursor_top, summary_cards)
    layout.pdf.new_page()
    layout.cursor_top = TOP_CONTENT_MARGIN

    layout.section_title("Plano completo del salón", underline=False)
    layout.text_block(
        "Distribución completa de mesas, sillas e invitados según el panel interactivo.",
        size=10,
        color=MUTED_COLOR,
        gap_after=8,
    )
    full_diagram_height = PAGE_HEIGHT - layout.cursor_top - BOTTOM_MARGIN
    layout.cursor_top = _draw_table_diagram(pdf, layout.cursor_top, full_diagram_height, tables, event)
    layout.pdf.new_page()
    layout.cursor_top = TOP_CONTENT_MARGIN

    layout.section_title("Invitados ubicados", underline=False)
    layout.text_block("Ordenado por familia y por nombre.", size=10, color=MUTED_COLOR, gap_after=6)
    assigned_rows = [
        [
            guest.name,
            guest.group_id or "",
            f"Mesa {table_by_id[guest.table_id].number}" if guest.table_id else "-",
            _format_guest_type(guest.guest_type),
            "Confirmado" if guest.confirmed else "Pendiente",
            guest.intolerance or "-",
            _format_guest_menu(guest.menu),
        ]
        for guest in assigned_guests
    ]
    _draw_data_table(
        layout,
        ["Invitado", "Familia", "Mesa", "Tipo", "Asistencia", "Intolerancia", "Menú"],
        assigned_rows,
        [0.19, 0.16, 0.10, 0.12, 0.13, 0.18, 0.12],
        "No hay invitados ubicados.",
    )

    layout.cursor_top += 14
    layout.section_title("Invitados sin sentar", underline=False)
    unassigned_rows = [
        [
            guest.name,
            guest.group_id or "",
            _format_guest_type(guest.guest_type),
            "Confirmado" if guest.confirmed else "Pendiente",
            guest.intolerance or "-",
            _format_guest_menu(guest.menu),
        ]
        for guest in unassigned_guests
    ]
    _draw_data_table(
        layout,
        ["Invitado", "Familia", "Tipo", "Asistencia", "Intolerancia", "Menú"],
        unassigned_rows,
        [0.22, 0.17, 0.12, 0.13, 0.22, 0.14],
        "No hay invitados sin sentar.",
    )

    layout.cursor_top += 14
    layout.section_title("Ubicaciones por revisar", underline=False)
    conflict_rows: list[list[str]] = []
    if conflict_groups:
        guest_by_id = event.guests
        for group_id, guest_ids in sorted(conflict_groups.items(), key=lambda item: item[0].casefold()):
            for guest_id in sorted(guest_ids, key=lambda current_id: guest_by_id[current_id].name.casefold()):
                guest = guest_by_id[guest_id]
                table_label = table_by_id[guest.table_id].display_name if guest.table_id else "-"
                conflict_rows.append(
                    [
                        guest.name,
                        guest.intolerance or "-",
                        _format_guest_menu(guest.menu),
                        group_id,
                        table_label.title() if table_label != "-" else "-",
                    ]
                )
    _draw_data_table(
        layout,
        ["Invitado", "Intolerancia", "Menú", "Familia", "Mesa"],
        conflict_rows,
        [0.24, 0.24, 0.14, 0.24, 0.14],
        "No hay ubicaciones por revisar.",
    )

    return pdf.render(repeating_header=repeating_header)
