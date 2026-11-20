from io import BytesIO

from botocore.exceptions import ClientError

from backend.knowledge.storage import LocalKnowledgeStorage


class TrackingLocalKnowledgeStorage(LocalKnowledgeStorage):
    last_key = None

    def save(self, key, content):
        self.last_key = key
        return super().save(key, content)


class FailingAfterSaveStorage(TrackingLocalKnowledgeStorage):
    def save(self, key, content):
        super().save(key, content)
        raise OSError("Storage failure")


class InMemoryS3Client:
    def __init__(self):
        self.objects = {}
        self.content_types = {}
        self.presign_calls = []

    def put_object(self, *, Bucket, Key, Body, ContentType=None):
        content = Body if isinstance(Body, bytes) else Body.read()
        self.objects[(Bucket, Key)] = content
        self.content_types[(Bucket, Key)] = ContentType

    def get_object(self, *, Bucket, Key):
        return {"Body": BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, *, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def head_object(self, *, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise ClientError(
                {"Error": {"Code": "404", "Message": "Not found"}},
                "HeadObject",
            )
        return {}

    def generate_presigned_url(self, operation, *, Params, ExpiresIn):
        self.presign_calls.append((operation, Params, ExpiresIn))
        return "https://storage.example.test/presigned-book"
