from django.db import OperationalError, connection
from django.db.utils import DatabaseError
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


# Проверка состояния API
@extend_schema(
    operation_id="health_check",
    summary="Проверить доступность API",
    description=(
        "Простой публичный health-check процесса API. Он не проверяет базу данных, "
        "почту и другие внешние зависимости."
    ),
    tags=["Состояние"],
    auth=[],
    responses={
        200: OpenApiResponse(
            response=inline_serializer(
                name="HealthStatus",
                fields={
                    "status": serializers.ChoiceField(
                        choices=["ok"],
                        read_only=True,
                    )
                },
            ),
            description="Процесс API отвечает.",
            examples=[
                OpenApiExample(
                    "API доступен",
                    value={"status": "ok"},
                    response_only=True,
                )
            ],
        )
    },
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


@extend_schema(
    operation_id="readiness_check",
    summary="Проверить готовность API",
    description="Проверяет доступность процесса API и соединения с базой данных.",
    tags=["Состояние"],
    auth=[],
    responses={
        200: OpenApiResponse(
            response=inline_serializer(
                name="ReadinessStatus",
                fields={
                    "status": serializers.ChoiceField(
                        choices=["ok"],
                        read_only=True,
                    )
                },
            ),
            description="API готов принимать запросы.",
        ),
        503: OpenApiResponse(
            response=inline_serializer(
                name="ReadinessUnavailable",
                fields={
                    "status": serializers.ChoiceField(
                        choices=["unavailable"],
                        read_only=True,
                    )
                },
            ),
            description="База данных недоступна.",
        ),
    },
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def ready(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except (OperationalError, DatabaseError):
        return Response(
            {"status": "unavailable"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"status": "ok"})
