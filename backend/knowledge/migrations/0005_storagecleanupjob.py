import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("knowledge", "0004_article_articleimageuploadsession_articleimage_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="StorageCleanupJob",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("storage_key", models.CharField(max_length=500)),
                ("reason", models.CharField(max_length=100)),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("last_error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "storage cleanup job",
                "verbose_name_plural": "storage cleanup jobs",
                "ordering": ("created_at", "id"),
                "indexes": [
                    models.Index(
                        fields=["completed_at", "created_at"],
                        name="knowledge_cleanup_pending_idx",
                    )
                ],
            },
        ),
    ]
