from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from django.utils import timezone

from backend.knowledge.models import Book
from backend.knowledge.publication_rights import (
    RIGHTS_CONFIRMATION_REQUIRED,
    RIGHTS_STATEMENT_VERSION,
    PUBLICATION_BASIS_REQUIRED,
    confirmed_publication_rights,
    validate_publication_rights,
)


class PublicationRightsTests(SimpleTestCase):
    def test_private_book_does_not_require_or_record_publication_rights(self):
        validate_publication_rights(
            visibility=Book.Visibility.PRIVATE,
            publication_basis="not-a-basis",
            confirmation=False,
        )

        result = confirmed_publication_rights(
            visibility=Book.Visibility.PRIVATE,
            publication_basis="not-a-basis",
            confirmation=False,
        )

        self.assertEqual(
            result,
            {
                "publication_basis": None,
                "rights_confirmed_at": None,
                "rights_statement_version": None,
            },
        )

    def test_public_book_requires_supported_basis_and_explicit_confirmation(self):
        with self.assertRaises(ValidationError) as captured:
            validate_publication_rights(
                visibility=Book.Visibility.PUBLIC,
                publication_basis="unknown",
                confirmation=1,
            )

        self.assertEqual(
            captured.exception.message_dict,
            {
                "publication_basis": [PUBLICATION_BASIS_REQUIRED],
                "rights_confirmation": [RIGHTS_CONFIRMATION_REQUIRED],
            },
        )

    def test_confirmed_publication_records_basis_timestamp_and_version(self):
        result = confirmed_publication_rights(
            visibility=Book.Visibility.PUBLIC,
            publication_basis=Book.PublicationBasis.AUTHOR,
            confirmation=True,
        )

        self.assertEqual(result["publication_basis"], Book.PublicationBasis.AUTHOR)
        self.assertEqual(result["rights_statement_version"], RIGHTS_STATEMENT_VERSION)
        self.assertTrue(timezone.is_aware(result["rights_confirmed_at"]))
