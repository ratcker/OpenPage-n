import uuid

from django.db import migrations, models


def fill_profile_public_ids(apps, schema_editor):
    profile_model = apps.get_model("knowledge", "KnowledgeProfile")
    for profile in profile_model.objects.filter(public_id__isnull=True).iterator():
        profile.public_id = uuid.uuid4()
        profile.save(update_fields=("public_id",))


class Migration(migrations.Migration):
    dependencies = [
        ("knowledge", "0002_book_cover_key_book_language_book_publisher_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="knowledgeprofile",
            name="public_id",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(fill_profile_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="knowledgeprofile",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name="knowledgeprofile",
            name="avatar",
            field=models.CharField(
                blank=True,
                help_text="Логический ключ avatar в Knowledge storage.",
                max_length=500,
            ),
        ),
    ]
