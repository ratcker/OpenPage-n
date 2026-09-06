MAX_COVER_BYTES = 5 * 1024 * 1024


def detect_image_type(content):
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def read_cover_image(file, declared_type=None):
    """Читает небольшую обложку и проверяет её по сигнатуре файла."""
    if getattr(file, "size", None) and file.size > MAX_COVER_BYTES:
        raise ValueError("Обложка не должна превышать 5 МБ.")

    if hasattr(file, "seek"):
        file.seek(0)
    content = file.read(MAX_COVER_BYTES + 1)
    if hasattr(file, "seek"):
        file.seek(0)

    if len(content) > MAX_COVER_BYTES:
        raise ValueError("Обложка не должна превышать 5 МБ.")

    media_type = detect_image_type(content)
    if not media_type:
        raise ValueError("Обложка должна быть изображением JPEG, PNG, GIF или WebP.")
    if declared_type and declared_type not in {media_type, "application/octet-stream"}:
        raise ValueError("MIME-тип обложки не соответствует содержимому файла.")
    return content, media_type
