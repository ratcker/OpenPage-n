import posixpath
import re
import zlib
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from .covers import MAX_IMAGE_BYTES, detect_image_type

MAX_EPUB_BYTES = 50 * 1024 * 1024
MAX_EPUB_ENTRIES = 2000
MAX_EPUB_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
MAX_XML_BYTES = 2 * 1024 * 1024


class InvalidEpubError(ValueError):
    pass


@dataclass
class EpubMetadata:
    title: str | None = None
    author: str | None = None
    language: str | None = None
    publisher: str | None = None
    year: int | None = None
    cover: bytes | None = None
    cover_media_type: str | None = None


def _local_name(tag):
    return tag.rsplit("}", 1)[-1]


def _text(element):
    value = "".join(element.itertext()).strip()
    return value or None


def _safe_xml(content):
    lowered = content.lower()
    if b"\x00" in content or b"<!doctype" in lowered or b"<!entity" in lowered:
        raise InvalidEpubError("EPUB содержит небезопасный XML.")

    try:
        return ElementTree.fromstring(content)
    except ElementTree.ParseError as error:
        raise InvalidEpubError("EPUB содержит повреждённый XML.") from error


def _safe_archive_path(base, href):
    path = unquote(urlsplit(href).path)
    if not path or "\\" in path or path.startswith("/"):
        return None
    normalized = posixpath.normpath(posixpath.join(base, path))
    if normalized == ".." or normalized.startswith("../"):
        return None
    return normalized


def _file_size(file):
    size = getattr(file, "size", None)
    if size is not None:
        return size
    if not all(hasattr(file, method) for method in ("seek", "tell")):
        return None
    position = file.tell()
    file.seek(0, 2)
    size = file.tell()
    file.seek(position)
    return size


def _read_entry(archive, name, limit):
    try:
        info = archive.getinfo(name)
    except KeyError as error:
        raise InvalidEpubError("В EPUB отсутствует обязательный файл.") from error
    if info.file_size > limit:
        raise InvalidEpubError("Файл внутри EPUB превышает допустимый размер.")
    return archive.read(info)


def _publication_year(value):
    if not value:
        return None
    match = re.match(r"^\s*(\d{4})(?:-|\s|$)", value)
    year = int(match.group(1)) if match else None
    if year is not None and year <= date.today().year + 1:
        return year
    return None


def _find_cover_item(metadata, manifest):
    cover_id = None
    for element in metadata:
        if _local_name(element.tag) == "meta" and element.get("name") == "cover":
            cover_id = element.get("content")
            break

    items = [element for element in manifest if _local_name(element.tag) == "item"]
    if cover_id:
        item = next((item for item in items if item.get("id") == cover_id), None)
        if item is not None:
            return item

    item = next(
        (
            item
            for item in items
            if "cover-image" in (item.get("properties") or "").split()
        ),
        None,
    )
    if item is not None:
        return item

    return next(
        (
            item
            for item in items
            if (item.get("media-type") or "").startswith("image/")
            and "cover" in f"{item.get('id', '')} {item.get('href', '')}".lower()
        ),
        None,
    )


def extract_epub_metadata(file, *, max_file_bytes=MAX_EPUB_BYTES):
    """Читает только container.xml, OPF и найденную обложку из EPUB."""
    if isinstance(file, (bytes, bytearray)):
        file = BytesIO(bytes(file))
    if (_file_size(file) or 0) > max_file_bytes:
        limit_mb = max_file_bytes // (1024 * 1024)
        raise InvalidEpubError(f"EPUB не должен превышать {limit_mb} МБ.")
    if hasattr(file, "seek"):
        file.seek(0)

    try:
        with ZipFile(file) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_EPUB_ENTRIES:
                raise InvalidEpubError("EPUB содержит слишком много файлов.")
            if sum(entry.file_size for entry in entries) > MAX_EPUB_UNCOMPRESSED_BYTES:
                raise InvalidEpubError("Распакованный EPUB слишком велик.")
            names = set()
            for entry in entries:
                path = PurePosixPath(entry.filename)
                if (
                    not entry.filename
                    or "\\" in entry.filename
                    or path.is_absolute()
                    or ".." in path.parts
                    or entry.filename in names
                ):
                    raise InvalidEpubError("EPUB содержит небезопасный путь.")
                names.add(entry.filename)

            if (
                not entries
                or entries[0].filename != "mimetype"
                or entries[0].compress_type != 0
                or _read_entry(archive, "mimetype", 20) != b"application/epub+zip"
            ):
                raise InvalidEpubError("Файл не является корректным пакетом EPUB.")
            if archive.testzip() is not None:
                raise InvalidEpubError("EPUB содержит повреждённые данные.")

            container = _safe_xml(
                _read_entry(archive, "META-INF/container.xml", MAX_XML_BYTES)
            )
            if _local_name(container.tag) != "container":
                raise InvalidEpubError("EPUB содержит некорректный container.xml.")
            rootfile = next(
                (
                    element
                    for element in container.iter()
                    if _local_name(element.tag) == "rootfile"
                ),
                None,
            )
            opf_path = (
                rootfile.get("full-path", "").strip() if rootfile is not None else ""
            )
            opf_path = _safe_archive_path("", opf_path)
            if not opf_path:
                raise InvalidEpubError("EPUB не содержит корректный package document.")

            package = _safe_xml(_read_entry(archive, opf_path, MAX_XML_BYTES))
            if _local_name(package.tag) != "package":
                raise InvalidEpubError("EPUB содержит некорректный package document.")
            metadata = next(
                (item for item in package if _local_name(item.tag) == "metadata"),
                None,
            )
            manifest = next(
                (item for item in package if _local_name(item.tag) == "manifest"),
                None,
            )
            if metadata is None or manifest is None:
                raise InvalidEpubError("EPUB не содержит metadata или manifest.")

            values = {}
            for element in metadata:
                name = _local_name(element.tag)
                if name in {"title", "creator", "language", "publisher", "date"}:
                    values.setdefault(name, _text(element))

            result = EpubMetadata(
                title=values.get("title"),
                author=values.get("creator"),
                language=values.get("language"),
                publisher=values.get("publisher"),
                year=_publication_year(values.get("date")),
            )
            cover_item = _find_cover_item(metadata, manifest)
            if cover_item is not None:
                cover_path = _safe_archive_path(
                    str(PurePosixPath(opf_path).parent),
                    cover_item.get("href", ""),
                )
                if cover_path:
                    try:
                        cover = _read_entry(archive, cover_path, MAX_IMAGE_BYTES)
                    except InvalidEpubError:
                        cover = None
                    media_type = detect_image_type(cover or b"")
                    if cover and media_type:
                        result.cover = cover
                        result.cover_media_type = media_type
            return result
    except (
        BadZipFile,
        EOFError,
        OSError,
        RuntimeError,
        ValueError,
        zlib.error,
    ) as error:
        if isinstance(error, InvalidEpubError):
            raise
        raise InvalidEpubError("Файл не является корректным EPUB.") from error
    finally:
        if hasattr(file, "seek"):
            file.seek(0)
