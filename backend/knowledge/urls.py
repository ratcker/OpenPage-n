from django.urls import path

from .views import (
    BookDetailView,
    BookListView,
    KnowledgeProfileView,
    LibraryAddView,
    LibraryListView,
)

urlpatterns = [
    path("books/", BookListView.as_view(), name="knowledge_books"),
    path(
        "books/<uuid:book_uuid>/",
        BookDetailView.as_view(),
        name="knowledge_book_detail",
    ),
    path("library/", LibraryListView.as_view(), name="knowledge_library"),
    path(
        "library/<uuid:book_uuid>/",
        LibraryAddView.as_view(),
        name="knowledge_library_add",
    ),
    path("profile/", KnowledgeProfileView.as_view(), name="knowledge_profile"),
]
