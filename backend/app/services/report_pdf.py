"""Generacion de un PDF A4 imprimible para el workspace."""

from __future__ import annotations

import colorsys
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


def _split_word_to_fit(value: str, max_width: float, font_size: float) -> list[str]:
    if not value:
        return [""]
    max_chars = max(1, math.floor(max_width / max(font_size * 0.5, 0.1)))
    return [value[index : index + max_chars] for index in range(0, len(value), max_chars)]


def _wrap_text(value: str, max_width: float, font_size: float) -> list[str]:
    words = value.split()
    if not words:
        return [""]

    lines: list[str] = []
    current = ""
    for word in words:
        word_parts = [word]
        if _estimated_text_width(word, font_size) > max_width:
            word_parts = _split_word_to_fit(word, max_width, font_size)
        for part in word_parts:
            if not current:
                current = part
                continue
            candidate = f"{current} {part}"
            if _estimated_text_width(candidate, font_size) <= max_width:
                current = candidate
                continue
            lines.append(current)
            current = part
    if current:
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

    def section_title(self, value: str, underline: bool = True, gap_before: float = 0) -> None:
        if gap_before > 0:
            self.ensure_space(gap_before)
            self.cursor_top += gap_before
        self.text_block(value, size=15, bold=True, color=ACCENT_COLOR, gap_after=4)
        if underline:
            self.ensure_space(8)
            y = PAGE_HEIGHT - self.cursor_top
            self.pdf.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y, width=1.2, color=ACCENT_COLOR)
            self.cursor_top += 12
        else:
            self.cursor_top += 4


@dataclass(frozen=True)
class TableCell:
    kind: str
    value: str


EMPTY_BADGE_FILL = (1.0, 0.988, 0.969)
EMPTY_BADGE_STROKE = (0.47, 0.33, 0.25)
EMPTY_BADGE_TEXT = (0.42, 0.34, 0.29)
CONFIRMED_FILL = (0.898, 0.945, 0.922)
CONFIRMED_STROKE = (0.247, 0.447, 0.337)
PENDING_FILL = (1.0, 0.961, 0.886)
PENDING_STROKE = (0.659, 0.478, 0.227)
AGE_ADULT_FILL = (0.957, 0.918, 0.871)
AGE_ADULT_STROKE = (0.447, 0.306, 0.251)
AGE_ADULT_TEXT = (0.431, 0.306, 0.251)
AGE_TEEN_FILL = (0.518, 0.741, 0.839)
AGE_TEEN_STROKE = (0.173, 0.424, 0.549)
AGE_TEEN_TEXT = (0.094, 0.302, 0.404)
AGE_CHILD_FILL = (0.584, 0.831, 0.616)
AGE_CHILD_STROKE = (0.227, 0.522, 0.298)
AGE_CHILD_TEXT = (0.118, 0.357, 0.169)
MENU_MEAT_FILL = (1.0, 0.922, 0.898)
MENU_MEAT_STROKE = (0.671, 0.369, 0.275)
MENU_MEAT_TEXT = (0.553, 0.247, 0.165)
MENU_FISH_FILL = (0.886, 0.945, 0.980)
MENU_FISH_STROKE = (0.275, 0.498, 0.647)
MENU_FISH_TEXT = (0.133, 0.353, 0.471)
MENU_VEGAN_FILL = (0.906, 0.965, 0.894)
MENU_VEGAN_STROKE = (0.298, 0.549, 0.329)
MENU_VEGAN_TEXT = (0.184, 0.416, 0.208)


def _hsl_to_rgb(hue: float, saturation: float, lightness: float) -> tuple[float, float, float]:
    red, green, blue = colorsys.hls_to_rgb(hue / 360.0, lightness / 100.0, saturation / 100.0)
    return red, green, blue


def _build_family_badge_colors(group_id: str) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
    hash_value = 0
    for character in group_id:
        hash_value = ((hash_value << 5) - hash_value) + ord(character)
        hash_value &= 0xFFFFFFFF
    hue = abs(hash_value) % 360
    return (
        _hsl_to_rgb(hue, 48, 90),
        _hsl_to_rgb(hue, 28, 58),
        _hsl_to_rgb(hue, 24, 28),
    )


def _build_intolerance_badge_colors(intolerance: str) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
    hash_value = 0
    for character in intolerance:
        hash_value = ((hash_value << 5) - hash_value) + ord(character)
        hash_value &= 0xFFFFFFFF
    base = abs(hash_value)
    hue = (base * 137) % 360
    saturation = 42 + (base % 18)
    lightness = 86 + (base % 8)
    return (
        _hsl_to_rgb(hue, saturation, lightness),
        _hsl_to_rgb(hue, 30, 58),
        _hsl_to_rgb(hue, 24, 28),
    )


def _table_text_cell(value: str) -> TableCell:
    return TableCell("text", value)


def _display_seat_label(seat_index: int | None) -> str:
    return "-" if seat_index is None else str(seat_index + 1)


def _draw_badge(pdf: PdfDocument, *, x: float, center_y: float, width: float, height: float, fill: tuple[float, float, float], stroke: tuple[float, float, float], text_color: tuple[float, float, float], label: str, font_size: float = 8.1, bold: bool = True) -> None:
    y = center_y - (height / 2)
    pdf.rect(x, y, width, height, stroke=stroke, fill=fill)
    baseline = center_y - (font_size / 3)
    pdf.text(x + max((width - _estimated_text_width(label, font_size)) / 2, 4), baseline, label, size=font_size, bold=bold, color=text_color)


def _draw_confirmation_badge(pdf: PdfDocument, x: float, center_y: float, confirmed: bool) -> None:
    fill = CONFIRMED_FILL if confirmed else PENDING_FILL
    stroke = CONFIRMED_STROKE if confirmed else PENDING_STROKE
    pdf.circle(x + 10, center_y, 9, stroke=stroke, fill=fill)
    pdf.circle(x + 10, center_y, 5.8, stroke=stroke, fill=(fill[0] * 0.94, fill[1] * 0.94, fill[2] * 0.94))
    if confirmed:
        pdf.line(x + 6.7, center_y - 0.6, x + 9.0, center_y - 3.0, width=1.2, color=stroke)
        pdf.line(x + 9.0, center_y - 3.0, x + 13.7, center_y + 2.5, width=1.2, color=stroke)
    else:
        pdf.text(x + 7.1, center_y - 2.7, "?", size=8.4, bold=True, color=stroke)


def _draw_meat_icon(pdf: PdfDocument, center_x: float, center_y: float, color: tuple[float, float, float]) -> None:
    pdf.circle(center_x, center_y, 3.7, stroke=color, fill=None)
    pdf.circle(center_x + 3.5, center_y, 3.2, stroke=color, fill=None)
    pdf.circle(center_x - 1.2, center_y + 2.0, 2.8, stroke=color, fill=None)
    pdf.circle(center_x + 1.6, center_y + 2.3, 2.5, stroke=color, fill=None)
    pdf.line(center_x - 7.0, center_y - 1.5, center_x - 4.5, center_y - 4.0, width=1.1, color=color)
    pdf.line(center_x - 7.0, center_y + 1.5, center_x - 4.5, center_y + 4.0, width=1.1, color=color)


def _draw_fish_icon(pdf: PdfDocument, center_x: float, center_y: float, color: tuple[float, float, float]) -> None:
    pdf.polygon(
        [
            (center_x - 5.8, center_y),
            (center_x - 1.2, center_y - 3.6),
            (center_x + 4.6, center_y - 2.1),
            (center_x + 6.2, center_y),
            (center_x + 4.6, center_y + 2.1),
            (center_x - 1.2, center_y + 3.6),
        ],
        stroke=color,
        fill=None,
    )
    pdf.line(center_x - 5.8, center_y, center_x - 8.0, center_y - 2.7, width=1.1, color=color)
    pdf.line(center_x - 5.8, center_y, center_x - 8.0, center_y + 2.7, width=1.1, color=color)
    pdf.circle(center_x + 2.4, center_y - 0.8, 0.65, stroke=color, fill=color)


def _draw_vegan_icon(pdf: PdfDocument, center_x: float, center_y: float, color: tuple[float, float, float]) -> None:
    pdf.circle(center_x, center_y + 0.8, 4.7, stroke=color, fill=None)
    pdf.line(center_x, center_y - 4.5, center_x, center_y - 7.0, width=1.1, color=color)
    pdf.line(center_x, center_y - 5.0, center_x + 3.8, center_y - 7.2, width=1.1, color=color)
    pdf.line(center_x, center_y - 5.0, center_x - 3.8, center_y - 7.2, width=1.1, color=color)


def _draw_menu_badge(pdf: PdfDocument, x: float, center_y: float, menu: GuestMenu) -> None:
    icon_center_x = x + 10
    if menu is GuestMenu.MEAT:
        fill = MENU_MEAT_FILL
        stroke = MENU_MEAT_STROKE
        text_color = MENU_MEAT_TEXT
        label = "Carne"
    elif menu is GuestMenu.FISH:
        fill = MENU_FISH_FILL
        stroke = MENU_FISH_STROKE
        text_color = MENU_FISH_TEXT
        label = "Pescado"
    elif menu is GuestMenu.VEGAN:
        fill = MENU_VEGAN_FILL
        stroke = MENU_VEGAN_STROKE
        text_color = MENU_VEGAN_TEXT
        label = "Vegano"
    else:
        pdf.text(x + 4, center_y - 3.2, "-", size=9.0, color=EMPTY_BADGE_TEXT)
        return

    pdf.circle(icon_center_x, center_y, 9.0, stroke=stroke, fill=fill)
    if menu is GuestMenu.MEAT:
        _draw_meat_icon(pdf, icon_center_x, center_y, text_color)
    elif menu is GuestMenu.FISH:
        _draw_fish_icon(pdf, icon_center_x, center_y, text_color)
    else:
        _draw_vegan_icon(pdf, icon_center_x, center_y, text_color)
    pdf.text(x + 24, center_y - 3.2, label, size=8.7, bold=True, color=text_color)


def _table_cell_lines(cell: TableCell, max_width: float, font_size: float) -> list[str]:
    if cell.kind in {"text", "family", "intolerance"}:
        return _wrap_text(cell.value, max_width, font_size)
    if cell.kind in {"table", "seat"}:
        return [cell.value]
    return [cell.value]


def _draw_table_cell(pdf: PdfDocument, cell: TableCell, x: float, top: float, width: float, row_height: float, padding_x: float, padding_y: float) -> None:
    center_y = PAGE_HEIGHT - top - (row_height / 2)

    if cell.kind == "confirmation":
        _draw_confirmation_badge(pdf, x + padding_x + 2, center_y, cell.value == "true")
        return

    if cell.kind == "age":
        label = cell.value
        if label == "Adulto":
            badge_label = "+18"
            fill, stroke, text_color = AGE_ADULT_FILL, AGE_ADULT_STROKE, AGE_ADULT_TEXT
        elif label == "Adolescente":
            badge_label = "+11"
            fill, stroke, text_color = AGE_TEEN_FILL, AGE_TEEN_STROKE, AGE_TEEN_TEXT
        else:
            badge_label = "+1"
            fill, stroke, text_color = AGE_CHILD_FILL, AGE_CHILD_STROKE, AGE_CHILD_TEXT
        badge_width = min(max(_estimated_text_width(badge_label, 8.2) + 14, 30), width - padding_x * 2)
        _draw_badge(pdf, x=x + padding_x, center_y=center_y, width=badge_width, height=18.0, fill=fill, stroke=stroke, text_color=text_color, label=badge_label, font_size=8.2)
        return

    if cell.kind == "family":
        lines = _wrap_text(cell.value, max(width - padding_x * 2, 24), 9.0)
        line_height = 10.2
        text_top = top + max((row_height - (len(lines) * line_height)) / 2, padding_y)
        for line_index, line in enumerate(lines):
            baseline = PAGE_HEIGHT - (text_top + line_index * line_height) - 7
            pdf.text(x + padding_x, baseline, line, size=9.0, color=TEXT_COLOR)
        return

    if cell.kind == "intolerance":
        lines = _wrap_text(cell.value, max(width - padding_x * 2, 24), 9.0)
        line_height = 10.2
        text_top = top + max((row_height - (len(lines) * line_height)) / 2, padding_y)
        for line_index, line in enumerate(lines):
            baseline = PAGE_HEIGHT - (text_top + line_index * line_height) - 7
            pdf.text(x + padding_x, baseline, line, size=9.0, color=TEXT_COLOR)
        return

    if cell.kind == "menu":
        menu_label = _format_guest_menu(GuestMenu(cell.value))
        pdf.text(x + padding_x, center_y - 3.0, "-" if menu_label == "Desconocido" else menu_label, size=8.8, color=TEXT_COLOR)
        return

    if cell.kind == "table":
        text_x = x + max((width - _estimated_text_width(cell.value, 8.8)) / 2, padding_x)
        pdf.text(text_x, center_y - 2.8, cell.value, size=8.8, color=TEXT_COLOR)
        return

    if cell.kind == "seat":
        text_x = x + max((width - _estimated_text_width(cell.value, 8.8)) / 2, padding_x)
        pdf.text(text_x, center_y - 2.5, cell.value, size=8.8, color=TEXT_COLOR)
        return

    lines = _wrap_text(cell.value, max(width - padding_x * 2, 24), 9.3)
    line_height = 10.8
    text_top = top + padding_y
    for line_index, line in enumerate(lines):
        baseline = PAGE_HEIGHT - (text_top + line_index * line_height) - 8
        pdf.text(x + padding_x, baseline, line, size=9.3, color=TEXT_COLOR, bold=False)


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


def _draw_progress_bar(
    pdf: PdfDocument,
    *,
    x: float,
    y_top: float,
    width: float,
    height: float,
    progress: float,
    fill: tuple[float, float, float],
) -> None:
    y = PAGE_HEIGHT - y_top - height
    pdf.rect(x, y, width, height, stroke=(0.88, 0.83, 0.78), fill=(0.962, 0.949, 0.936))
    if progress <= 0:
        return
    pdf.rect(x, y, width * min(max(progress, 0.0), 1.0), height, stroke=fill, fill=fill)


def _draw_summary_dashboard(
    pdf: PdfDocument,
    top: float,
    *,
    total_guests: int,
    seated_guests: int,
    confirmed_guests: int,
    unconfirmed_guests: int,
    adult_guests: int,
    teen_guests: int,
    child_guests: int,
    meat_menu_guests: int,
    fish_menu_guests: int,
    vegetarian_menu_guests: int,
    unknown_menu_guests: int,
    full_tables: int,
    conflict_count: int,
    occupancy_average: int,
) -> float:
    panel_x = PAGE_MARGIN
    panel_width = PAGE_WIDTH - PAGE_MARGIN * 2
    panel_height = 412.0
    panel_y = PAGE_HEIGHT - top - panel_height
    pdf.rect(panel_x, panel_y, panel_width, panel_height, stroke=(0.81, 0.72, 0.65), fill=(0.992, 0.986, 0.979))

    section_gap = 16.0
    section_padding_x = 16.0
    inner_x = panel_x + section_padding_x
    inner_width = panel_width - section_padding_x * 2
    current_top = top + 18.0

    def draw_section_header(title: str) -> None:
        nonlocal current_top
        pdf.text(inner_x, PAGE_HEIGHT - current_top, title.upper(), size=8.1, bold=True, color=MUTED_COLOR)
        current_top += 16.0

    def draw_separator() -> None:
        nonlocal current_top
        line_y = PAGE_HEIGHT - current_top
        pdf.line(inner_x, line_y, inner_x + inner_width, line_y, width=0.8, color=(0.87, 0.80, 0.74))
        current_top += section_gap

    draw_section_header("Ubicación y asistencia")
    seating_progress = seated_guests / max(total_guests, 1)
    confirmation_progress = confirmed_guests / max(total_guests, 1)
    pdf.text(inner_x, PAGE_HEIGHT - current_top, f"{seated_guests} de {total_guests} invitados sentados", size=12.2, bold=True, color=TEXT_COLOR)
    current_top += 20.0
    _draw_progress_bar(pdf, x=inner_x, y_top=current_top, width=inner_width, height=10.0, progress=seating_progress, fill=(0.20, 0.35, 0.32))
    current_top += 21.0
    pdf.text(inner_x, PAGE_HEIGHT - current_top, f"{round(seating_progress * 100)}% del salón ubicado", size=8.8, color=MUTED_COLOR)
    current_top += 20.0
    pdf.text(inner_x, PAGE_HEIGHT - current_top, f"{confirmed_guests} confirmados · {unconfirmed_guests} pendientes", size=10.6, bold=True, color=TEXT_COLOR)
    current_top += 17.0
    _draw_progress_bar(pdf, x=inner_x, y_top=current_top, width=inner_width, height=6.0, progress=confirmation_progress, fill=(0.42, 0.58, 0.53))
    current_top += 22.0

    draw_separator()
    draw_section_header("Composición de invitados")
    pill_y = PAGE_HEIGHT - current_top - 20.0
    pill_width = (inner_width - 12.0) / 3
    compositions = [
        ("Adultos", adult_guests, (0.87, 0.80, 0.73)),
        ("Adolescentes", teen_guests, (0.52, 0.74, 0.84)),
        ("Niños", child_guests, (0.58, 0.83, 0.62)),
    ]
    for index, (label, value, fill) in enumerate(compositions):
        x = inner_x + index * (pill_width + 6.0)
        pdf.rect(x, pill_y, pill_width, 20.0, stroke=fill, fill=(0.992, 0.986, 0.979))
        pdf.circle(x + 9.0, pill_y + 10.0, 3.1, stroke=fill, fill=fill)
        pdf.text(x + 17.0, pill_y + 6.0, f"{value} {label}", size=9.0, bold=True, color=TEXT_COLOR)
    current_top += 34.0

    draw_separator()
    draw_section_header("Menús y dietas")
    menu_rows = [
        ("Carnes", meat_menu_guests, False),
        ("Pescados", fish_menu_guests, False),
        ("Vegetarianos", vegetarian_menu_guests, False),
        ("Por definir", unknown_menu_guests, True),
    ]
    for label, value, is_alert in menu_rows:
        color = (0.63, 0.29, 0.16) if is_alert else TEXT_COLOR
        pdf.text(inner_x, PAGE_HEIGHT - current_top, label, size=9.5, color=MUTED_COLOR if not is_alert else color)
        value_text = str(value)
        pdf.text(inner_x + inner_width - _estimated_text_width(value_text, 9.8), PAGE_HEIGHT - current_top, value_text, size=9.8, bold=True, color=color)
        current_top += 16.0

    draw_separator()
    draw_section_header("Estado de las mesas")
    table_rows = [
        ("Mesas completas", full_tables, False),
        ("Ubicaciones por revisar", conflict_count, True),
        ("Ocupación media", f"{occupancy_average}%", False),
    ]
    for label, value, is_alert in table_rows:
        color = (0.63, 0.29, 0.16) if is_alert else TEXT_COLOR
        pdf.text(inner_x, PAGE_HEIGHT - current_top, label, size=9.5, color=MUTED_COLOR if not is_alert else color)
        value_text = str(value)
        pdf.text(inner_x + inner_width - _estimated_text_width(value_text, 9.8), PAGE_HEIGHT - current_top, value_text, size=9.8, bold=True, color=color)
        current_top += 16.0

    return top + panel_height + 10.0


def _draw_data_table(
    layout: ReportLayout,
    columns: list[str],
    rows: list[list[TableCell]],
    width_fractions: list[float],
    empty_message: str,
) -> None:
    if not rows:
        layout.text_block(empty_message, size=9.8, color=MUTED_COLOR, gap_after=10)
        return

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
            label_size = 8.8 if _estimated_text_width(label, 9.4) > column_widths[index] - (cell_padding_x * 2) else 9.4
            layout.pdf.text(cursor_x + cell_padding_x, baseline, label, size=label_size, bold=True, color=ACCENT_COLOR)
            cursor_x += column_widths[index]
        layout.cursor_top += header_height

    draw_header()

    for row_index, row in enumerate(rows):
        wrapped_cells = [
            _table_cell_lines(cell, max(column_widths[column_index] - cell_padding_x * 2, 24), 9.3)
            for column_index, cell in enumerate(row)
        ]
        row_line_count = max(len(lines) for lines in wrapped_cells)
        row_height = max(28.0, row_line_count * line_height + cell_padding_y * 2)

        if layout.cursor_top + row_height > PAGE_HEIGHT - BOTTOM_MARGIN:
            layout.pdf.new_page()
            layout.cursor_top = PAGE_MARGIN
            draw_header()

        fill = (0.998, 0.995, 0.990) if row_index % 2 == 0 else (0.989, 0.983, 0.974)
        draw_row_background(layout.cursor_top, row_height, fill)

        cursor_x = PAGE_MARGIN
        for column_index, cell in enumerate(row):
            _draw_table_cell(
                layout.pdf,
                cell,
                cursor_x,
                layout.cursor_top,
                column_widths[column_index],
                row_height,
                cell_padding_x,
                cell_padding_y,
            )
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
    layout.ensure_space(440)
    layout.cursor_top = _draw_summary_dashboard(
        pdf,
        layout.cursor_top,
        total_guests=len(event.guests),
        seated_guests=validation["assigned_guests"],
        confirmed_guests=confirmed_guests,
        unconfirmed_guests=unconfirmed_guests,
        adult_guests=adult_guests,
        teen_guests=teen_guests,
        child_guests=child_guests,
        meat_menu_guests=meat_menu_guests,
        fish_menu_guests=fish_menu_guests,
        vegetarian_menu_guests=vegetarian_menu_guests,
        unknown_menu_guests=unknown_menu_guests,
        full_tables=full_tables,
        conflict_count=len(conflict_groups),
        occupancy_average=occupancy_average,
    )
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

    layout.section_title("Invitados ubicados", underline=False, gap_before=10)
    assigned_rows = [
        [
            _table_text_cell(guest.name),
            TableCell("confirmation", "true" if guest.confirmed else "false"),
            TableCell("age", _format_guest_type(guest.guest_type)),
            TableCell("family", guest.group_id or "-"),
            TableCell("intolerance", guest.intolerance or "-"),
            TableCell("menu", guest.menu.value),
            TableCell("table", str(table_by_id[guest.table_id].number) if guest.table_id else "-"),
            TableCell("seat", _display_seat_label(guest.seat_index)),
        ]
        for guest in assigned_guests
    ]
    _draw_data_table(
        layout,
        ["Invitado", "Conf.", "Edad", "Familia", "Intolerancia", "Menú", "Mesa", "Asiento"],
        assigned_rows,
        [0.17, 0.08, 0.10, 0.16, 0.16, 0.14, 0.10, 0.09],
        "No hay invitados ubicados.",
    )

    layout.section_title("Invitados sin sentar", underline=False, gap_before=20)
    unassigned_rows = [
        [
            _table_text_cell(guest.name),
            TableCell("confirmation", "true" if guest.confirmed else "false"),
            TableCell("age", _format_guest_type(guest.guest_type)),
            TableCell("family", guest.group_id or "-"),
            TableCell("intolerance", guest.intolerance or "-"),
            TableCell("menu", guest.menu.value),
            TableCell("table", "-"),
            TableCell("seat", "-"),
        ]
        for guest in unassigned_guests
    ]
    _draw_data_table(
        layout,
        ["Invitado", "Conf.", "Edad", "Familia", "Intolerancia", "Menú", "Mesa", "Asiento"],
        unassigned_rows,
        [0.17, 0.08, 0.10, 0.16, 0.16, 0.14, 0.10, 0.09],
        "No hay invitados sin sentar.",
    )

    layout.section_title("Ubicaciones por revisar", underline=False, gap_before=20)
    conflict_rows: list[list[TableCell]] = []
    if conflict_groups:
        guest_by_id = event.guests
        for group_id, guest_ids in sorted(conflict_groups.items(), key=lambda item: item[0].casefold()):
            for guest_id in sorted(guest_ids, key=lambda current_id: guest_by_id[current_id].name.casefold()):
                guest = guest_by_id[guest_id]
                table_label = table_by_id[guest.table_id].display_name if guest.table_id else "-"
                conflict_rows.append(
                    [
                        _table_text_cell(guest.name),
                        TableCell("intolerance", guest.intolerance or "-"),
                        TableCell("menu", guest.menu.value),
                        TableCell("family", group_id),
                        TableCell("table", str(table_by_id[guest.table_id].number) if guest.table_id else "-"),
                    ]
                )
    _draw_data_table(
        layout,
        ["Invitado", "Intolerancia", "Menú", "Familia", "Mesa"],
        conflict_rows,
        [0.24, 0.24, 0.18, 0.20, 0.14],
        "No hay ubicaciones por revisar.",
    )

    return pdf.render(repeating_header=repeating_header)
