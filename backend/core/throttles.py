import hashlib
import hmac

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class ClientIPRateThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"ip-{self.get_ident(request)}",
        }


class EmailRateThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        data = request.data
        email = data.get("email") if hasattr(data, "get") else None
        if not isinstance(email, str) or not email.strip():
            return None

        normalized = email.strip().casefold().encode()
        digest = hmac.new(
            settings.SECRET_KEY.encode(),
            normalized,
            hashlib.sha256,
        ).hexdigest()
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"email-{digest}",
        }


class LoginIPThrottle(ClientIPRateThrottle):
    scope = "auth_login_ip"


class LoginEmailThrottle(EmailRateThrottle):
    scope = "auth_login_email"


class RegisterIPThrottle(ClientIPRateThrottle):
    scope = "auth_register_ip"


class RegisterEmailThrottle(EmailRateThrottle):
    scope = "auth_register_email"


class VerificationIPThrottle(ClientIPRateThrottle):
    scope = "auth_email_ip"


class VerificationEmailThrottle(EmailRateThrottle):
    scope = "auth_email"


class PostUserRateThrottle(UserRateThrottle):
    def allow_request(self, request, view):
        if request.method != "POST":
            return True
        return super().allow_request(request, view)


class BookUploadThrottle(PostUserRateThrottle):
    scope = "knowledge_book_upload"


class ArticleImageUploadThrottle(PostUserRateThrottle):
    scope = "knowledge_article_image_upload"
