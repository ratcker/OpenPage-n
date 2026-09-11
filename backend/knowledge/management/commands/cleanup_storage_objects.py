from django.core.management.base import BaseCommand, CommandError

from knowledge.storage_cleanup import process_storage_cleanup_batch


class Command(BaseCommand):
    help = "Удаляет объекты Knowledge storage из durable cleanup queue."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=100)

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        if batch_size <= 0:
            raise CommandError("--batch-size должен быть положительным числом.")

        result = process_storage_cleanup_batch(batch_size=batch_size)
        summary = (
            "Cleanup jobs: "
            f"claimed={result.claimed}, "
            f"completed={result.completed}, "
            f"failed={result.failed}"
        )
        if result.failed:
            raise CommandError(summary)
        self.stdout.write(self.style.SUCCESS(summary))
