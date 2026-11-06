import re
from time import time

from django.conf import settings
from django.core import signing
from django.core.exceptions import SuspiciousFileOperation
from django.http import FileResponse, Http404, HttpResponse, HttpResponseForbidden
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

from .storage import LOCAL_STORAGE_URL_SALT, LocalKnowledgeStorage


def _byte_range(value, size):
    # Неизвестные форматы и multipart Range обслуживаем как обычный GET.
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()):
        return None
    first, last = match.groups()
    start = int(first) if first else max(0, size - int(last))
    end = min(int(last), size - 1) if first and last else size - 1
    if start > end or start >= size:
        raise ValueError("Unsatisfiable byte range.")
    return start, end


def _read_range(file, length):
    while length > 0:
        chunk = file.read(min(64 * 1024, length))
        if not chunk:
            break
        length -= len(chunk)
        yield chunk


@require_safe
@never_cache
def local_file(request, key):
    if settings.S3_ENDPOINT_URL:
        raise Http404

    try:
        payload = signing.loads(
            request.GET.get("token", ""), salt=LOCAL_STORAGE_URL_SALT
        )
    except signing.BadSignature:
        return HttpResponseForbidden("Недействительная ссылка на файл.")
    if payload["key"] != key or payload["expires_at"] <= time():
        return HttpResponseForbidden("Ссылка недействительна или истекла.")

    try:
        file = LocalKnowledgeStorage().open(key)
    except (FileNotFoundError, IsADirectoryError, ValueError, SuspiciousFileOperation):
        raise Http404 from None

    response = FileResponse(file)
    response["Accept-Ranges"] = "bytes"
    if request.method == "HEAD":
        response.streaming_content = ()
        return response

    size = int(response["Content-Length"])
    try:
        byte_range = (
            _byte_range(request.headers.get("Range", ""), size)
            if "If-Range" not in request.headers
            else None
        )
    except ValueError:
        response.close()
        return HttpResponse(
            status=416,
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )
    if byte_range is not None:
        start, end = byte_range
        length = end - start + 1
        file.seek(start)
        response.status_code = 206
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
        response["Content-Length"] = str(length)
        response.streaming_content = _read_range(file, length)
    return response
