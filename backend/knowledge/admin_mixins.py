from .storage_cleanup import delete_storage_backed_queryset


class StorageCleanupAdminMixin:
    def delete_model(self, request, obj):
        delete_storage_backed_queryset(type(obj).objects.filter(pk=obj.pk))

    def delete_queryset(self, request, queryset):
        delete_storage_backed_queryset(queryset)
