import re
from io import BytesIO

from django.conf import settings

from .epub import InvalidEpubError, extract_epub_metadata
from .models import Book

PDF_HEADER = re.compile(rb"%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)")
PDF_TRAILER = re.compile(rb"startxref\s+(\d+)\s+%%EOF\s*$")
PDF_XREF_TABLE = re.compile(rb"xref\s+\d+\s+\d+\s+\d{10}\s+\d{5}\s+[nf]\b")
PDF_OBJECT = re.compile(rb"\d+\s+\d+\s+obj\b")
PDF_HEADER_BYTES = 1024
PDF_TRAILER_BYTES = 65536
PDF_XREF_BYTES = 65536


class InvalidBookFile(ValueError):
    pass


def _seekable_file(content):
    if isinstance(content, (bytes, bytearray)):
        return BytesIO(bytes(content))
    if not all(hasattr(content, method) for method in ("read", "seek", "tell")):
        raise InvalidBookFile("Не удалось прочитать файл книги.")
    return content


def _file_size(file):
    declared_size = getattr(file, "size", None)
    try:
        file.seek(0, 2)
        actual_size = file.tell()
    except (OSError, ValueError) as error:
        raise InvalidBookFile("Не удалось определить размер файла книги.") from error
    finally:
        file.seek(0)

    if declared_size is None:
        return actual_size
    return max(declared_size, actual_size)


def _validate_pdf(file, size):
    header = file.read(min(size, PDF_HEADER_BYTES))
    if not PDF_HEADER.search(header):
        raise InvalidBookFile("Содержимое файла не соответствует формату PDF.")

    file.seek(max(0, size - PDF_TRAILER_BYTES))
    trailer_bytes = file.read(PDF_TRAILER_BYTES)
    trailer = PDF_TRAILER.search(trailer_bytes)
    if trailer is None:
        raise InvalidBookFile("PDF повреждён или записан не полностью.")

    xref_offset = int(trailer.group(1))
    if xref_offset >= size:
        raise InvalidBookFile("PDF содержит некорректную таблицу ссылок.")

    file.seek(xref_offset)
    xref = file.read(PDF_XREF_BYTES)
    traditional_xref = PDF_XREF_TABLE.match(xref) and all(
        marker in trailer_bytes for marker in (b"trailer", b"/Size", b"/Root")
    )
    xref_stream = PDF_OBJECT.match(xref) and all(
        re.search(marker, xref)
        for marker in (
            rb"/Type\s*/XRef\b",
            rb"/Size\s+\d+\b",
            rb"/Root\s+\d+\s+\d+\s+R\b",
            rb"stream(?:\r\n|\r|\n)",
        )
    )
    if not traditional_xref and not xref_stream:
        raise InvalidBookFile("PDF содержит некорректную таблицу ссылок.")


def inspect_book_file(content, declared_format):
    file = _seekable_file(content)
    try:
        size = _file_size(file)
        maximum = settings.KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES
        if size > maximum:
            limit_mb = maximum // (1024 * 1024)
            raise InvalidBookFile(f"Размер книги не должен превышать {limit_mb} МБ.")
        if size == 0:
            raise InvalidBookFile("Файл книги пуст.")

        if declared_format == Book.Format.PDF:
            _validate_pdf(file, size)
            return None
        if declared_format == Book.Format.EPUB:
            try:
                return extract_epub_metadata(file, max_file_bytes=maximum)
            except InvalidEpubError as error:
                raise InvalidBookFile(str(error)) from error
        raise InvalidBookFile("Неподдерживаемый формат книги.")
    finally:
        file.seek(0)
