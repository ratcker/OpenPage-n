from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import Book

RIGHTS_STATEMENT_VERSION = "1"
RIGHTS_STATEMENTS = {
    "author": (
        "Я являюсь автором произведения и подтверждаю его публикацию "
        "на платформе Опенпейч."
    ),
    "authorized_distributor": (
        "Я подтверждаю, что обладаю необходимыми правами для публикации "
        "и распространения этого произведения на платформе Опенпейч."
    ),
    "confirmation": (
        "Я подтверждаю достоверность указанных сведений и наличие необходимых "
        "прав на публикацию произведения."
    ),
}
PUBLICATION_BASIS_REQUIRED = (
    "Для публичной публикации книги укажите основание публикации."
)
RIGHTS_CONFIRMATION_REQUIRED = (
    "Для публичной публикации книги необходимо подтвердить наличие необходимых прав."
)


def validate_publication_rights(*, visibility, publication_basis, confirmation):
    if visibility != Book.Visibility.PUBLIC:
        return

    errors = {}
    if publication_basis not in Book.PublicationBasis.values:
        errors["publication_basis"] = PUBLICATION_BASIS_REQUIRED
    if confirmation is not True:
        errors["rights_confirmation"] = RIGHTS_CONFIRMATION_REQUIRED
    if errors:
        raise ValidationError(errors)


def confirmed_publication_rights(*, visibility, publication_basis, confirmation):
    validate_publication_rights(
        visibility=visibility,
        publication_basis=publication_basis,
        confirmation=confirmation,
    )
    if visibility != Book.Visibility.PUBLIC:
        return {
            "publication_basis": None,
            "rights_confirmed_at": None,
            "rights_statement_version": None,
        }
    return {
        "publication_basis": publication_basis,
        "rights_confirmed_at": timezone.now(),
        "rights_statement_version": RIGHTS_STATEMENT_VERSION,
    }
