from rest_framework.pagination import PageNumberPagination


# Одинаковая компактная пагинация каталога и личной библиотеки.
class KnowledgePagination(PageNumberPagination):
    page_size = 20
