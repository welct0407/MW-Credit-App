import sys
import zipfile
from pathlib import Path


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def normalize_worksheet(xml_bytes: bytes) -> bytes:
    text = xml_bytes.decode("utf-8")
    original = text
    text = text.replace(
        f'<x:worksheet xmlns:x="{MAIN_NS}">',
        f'<worksheet xmlns="{MAIN_NS}">',
        1,
    )
    text = text.replace("<x:", "<").replace("</x:", "</")
    if text == original:
        raise ValueError("Worksheet did not use the expected x: namespace prefix")
    return text.encode("utf-8")


def main(source: str, destination: str) -> None:
    source_path = Path(source)
    destination_path = Path(destination)
    with zipfile.ZipFile(source_path, "r") as incoming, zipfile.ZipFile(
        destination_path, "w", compression=zipfile.ZIP_DEFLATED
    ) as outgoing:
        for item in incoming.infolist():
            payload = incoming.read(item.filename)
            if item.filename.startswith("xl/worksheets/sheet") and item.filename.endswith(".xml"):
                payload = normalize_worksheet(payload)
            outgoing.writestr(item, payload)

    with zipfile.ZipFile(destination_path, "r") as check:
        worksheets = [
            name
            for name in check.namelist()
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        ]
        if not worksheets:
            raise ValueError("No worksheet XML files found")
        for name in worksheets:
            text = check.read(name).decode("utf-8")
            if "<x:worksheet" in text or f'xmlns="{MAIN_NS}"' not in text:
                raise ValueError(f"Namespace normalization failed for {name}")
    print(f"Normalized {len(worksheets)} worksheets: {destination_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: normalize_template_namespaces.py <source.xlsx> <destination.xlsx>")
    main(sys.argv[1], sys.argv[2])
