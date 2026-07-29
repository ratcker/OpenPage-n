from rest_framework.decorators import api_view
from rest_framework.response import Response


# Проверка состояния API
@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})
