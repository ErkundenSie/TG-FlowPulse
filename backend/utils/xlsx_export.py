from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from typing import Any, Iterable, Sequence
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


def _excel_column_name(index: int) -> str:
    result = ""
    current = index + 1
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _cell_ref(row_index: int, col_index: int) -> str:
    return f"{_excel_column_name(col_index)}{row_index}"


def _sanitize_text(value: Any) -> str:
    text = str(value if value is not None else "")
    return "".join(
        ch for ch in text if ch in ("\t", "\n", "\r") or ord(ch) >= 32
    )


def _string_cell(ref: str, value: Any) -> str:
    text = escape(_sanitize_text(value))
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'


def _number_cell(ref: str, value: Any) -> str:
    return f"<c r=\"{ref}\"><v>{value}</v></c>"


def _cell_xml(row_index: int, col_index: int, value: Any) -> str:
    ref = _cell_ref(row_index, col_index)
    if value is None:
        return _string_cell(ref, "")
    if isinstance(value, bool):
        return _number_cell(ref, int(value))
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        return _number_cell(ref, value)
    if isinstance(value, datetime):
        return _string_cell(ref, value.isoformat(sep=" ", timespec="seconds"))
    if isinstance(value, date):
        return _string_cell(ref, value.isoformat())
    return _string_cell(ref, value)


def build_xlsx_bytes(
    headers: Sequence[str],
    rows: Iterable[Sequence[Any]],
    *,
    sheet_name: str = "Sheet1",
) -> bytes:
    normalized_headers = [str(item) for item in headers]
    normalized_rows = [list(row) for row in rows]
    all_rows = [normalized_headers, *normalized_rows]
    max_columns = max((len(row) for row in all_rows), default=0)
    total_rows = len(all_rows)
    last_ref = (
        _cell_ref(total_rows, max_columns - 1)
        if total_rows > 0 and max_columns > 0
        else "A1"
    )

    sheet_rows_xml = []
    for row_index, row in enumerate(all_rows, start=1):
        cells = []
        for col_index in range(max_columns):
            value = row[col_index] if col_index < len(row) else ""
            cells.append(_cell_xml(row_index, col_index, value))
        sheet_rows_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    safe_sheet_name = escape(_sanitize_text(sheet_name or "Sheet1"))[:31] or "Sheet1"
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    sheet_data = "".join(sheet_rows_xml)

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""

    workbook_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="{safe_sheet_name}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""

    workbook_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""

    sheet_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:{last_ref}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>{sheet_data}</sheetData>
</worksheet>
"""

    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
    </font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>
"""

    app_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>TG-FlowPulse</Application>
</Properties>
"""

    core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>TG-FlowPulse</dc:creator>
  <cp:lastModifiedBy>TG-FlowPulse</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>
</cp:coreProperties>
"""

    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", rels_xml)
        archive.writestr("docProps/app.xml", app_xml)
        archive.writestr("docProps/core.xml", core_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        archive.writestr("xl/styles.xml", styles_xml)
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buffer.getvalue()
