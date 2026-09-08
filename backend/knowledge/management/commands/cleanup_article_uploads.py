from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from knowledge.article_services import delete_abandoned_upload_session
from knowledge.models import ArticleImageUploadSession
from knowledge.storage import get_knowledge_storage


class Command(BaseCommand):
    help = "Удаляет истёкшие upload sessions статей и их изображения."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(
            seconds=settings.KNOWLEDGE_ARTICLE_UPLOAD_TTL_SECONDS
        )
        sessions = ArticleImageUploadSession.objects.filter(
            article__isnull=True,
            created_at__lt=cutoff,
        )
        storage = get_knowledge_storage()
        deleted = 0

        try:
            for session in sessions.iterator():
                deleted += delete_abandoned_upload_session(
                    session=session,
                    cutoff=cutoff,
                    storage=storage,
                )
        except Exception as error:
            raise CommandError("Не удалось очистить upload sessions статей.") from error

        self.stdout.write(self.style.SUCCESS(f"Удалено upload sessions: {deleted}"))
