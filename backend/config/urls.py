from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

admin.site.site_header = 'Опенпейч'
admin.site.site_title = 'Администрирование Опенпейч'
admin.site.index_title = 'Управление платформой'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/auth/', include('accounts.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path(
        'api/docs/',
        SpectacularSwaggerView.as_view(
            url_name='schema',
            template_name='drf_spectacular/swagger_ui_openpage.html',
            title='Опенпейч API — документация',
        ),
        name='swagger-ui',
    ),
]
