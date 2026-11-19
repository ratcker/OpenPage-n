import logging
import time


logger = logging.getLogger("backend.requests")


class RequestLoggingMiddleware:
    """Log the outcome and duration of each HTTP request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started_at = time.monotonic()
        try:
            response = self.get_response(request)
        except Exception:
            logger.exception(
                "HTTP request raised an unhandled exception (method=%s path=%s user_id=%s duration_ms=%.1f).",
                request.method,
                request.path,
                self._user_id(request),
                (time.monotonic() - started_at) * 1000,
            )
            raise

        duration_ms = (time.monotonic() - started_at) * 1000
        log = logger.info
        if response.status_code >= 500:
            log = logger.error
        elif response.status_code >= 400:
            log = logger.warning

        log(
            "HTTP request completed (method=%s path=%s status=%s user_id=%s duration_ms=%.1f).",
            request.method,
            request.path,
            response.status_code,
            self._user_id(request),
            duration_ms,
        )
        return response

    @staticmethod
    def _user_id(request):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user.pk
        return "anonymous"
