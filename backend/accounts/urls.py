from django.urls import path

from .views import LoginView, MeView, RefreshView

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="token_refresh"),
]
