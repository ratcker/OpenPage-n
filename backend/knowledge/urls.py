from django.urls import path

from .views import (
    BookContentView,
    BookDetailView,
    BookListView,
    KnowledgeProfileView,
    LibraryAddView,
    LibraryListView,
    LibraryProgressView,
)

urlpatterns = [
    path("books/", BookListView.as_view(), name="knowledge_books"),
    path(
        "books/<uuid:book_uuid>/",
        BookDetailView.as_view(),
        name="knowledge_book_detail",
    ),
    path(
        "books/<uuid:book_uuid>/content/",
        BookContentView.as_view(),
        name="knowledge_book_content",
    ),
    path("library/", LibraryListView.as_view(), name="knowledge_library"),
    path(
        "library/<uuid:book_uuid>/",
        LibraryAddView.as_view(),
        name="knowledge_library_add",
    ),
    path(
        "library/<uuid:book_uuid>/progress/",
        LibraryProgressView.as_view(),
        name="knowledge_library_progress",
    ),
    path("profile/", KnowledgeProfileView.as_view(), name="knowledge_profile"),
]
