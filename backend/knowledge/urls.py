from django.urls import path

from .article_views import (
    ArticleDetailView,
    ArticleImageUploadView,
    ArticleImageView,
    ArticleListView,
    ArticleUploadSessionView,
    PublicAuthorArticlesView,
)
from .views import (
    BookContentView,
    BookDetailView,
    BookListView,
    EpubPreviewView,
    KnowledgeProfileAvatarView,
    KnowledgeProfileView,
    LibraryAddView,
    LibraryListView,
    LibraryProgressView,
    PublicAuthorBooksView,
    PublicAuthorView,
)

urlpatterns = [
    path("articles/", ArticleListView.as_view(), name="knowledge_articles"),
    path(
        "articles/upload-sessions/",
        ArticleUploadSessionView.as_view(),
        name="knowledge_article_upload_sessions",
    ),
    path(
        "articles/upload-sessions/<uuid:session_uuid>/images/",
        ArticleImageUploadView.as_view(),
        name="knowledge_article_image_upload",
    ),
    path(
        "articles/<uuid:article_uuid>/",
        ArticleDetailView.as_view(),
        name="knowledge_article_detail",
    ),
    path(
        "article-images/<uuid:image_uuid>/",
        ArticleImageView.as_view(),
        name="knowledge_article_image",
    ),
    path("books/", BookListView.as_view(), name="knowledge_books"),
    path(
        "books/preview/",
        EpubPreviewView.as_view(),
        name="knowledge_books_preview",
    ),
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
    path(
        "profile/avatar/",
        KnowledgeProfileAvatarView.as_view(),
        name="knowledge_profile_avatar",
    ),
    path(
        "authors/<uuid:profile_uuid>/",
        PublicAuthorView.as_view(),
        name="knowledge_author",
    ),
    path(
        "authors/<uuid:profile_uuid>/books/",
        PublicAuthorBooksView.as_view(),
        name="knowledge_author_books",
    ),
    path(
        "authors/<uuid:profile_uuid>/articles/",
        PublicAuthorArticlesView.as_view(),
        name="knowledge_author_articles",
    ),
]
