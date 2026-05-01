from zai import ZhipuAiClient
from src.config import get_settings

settings = get_settings()

client = ZhipuAiClient(api_key=settings.ZHIPU_API_KEY)


async def get_embedding(text: str) -> list[float]:
    """Get a 1024-dimensional embedding vector via Zhipu AI."""
    import asyncio

    def _call():
        response = client.embeddings.create(
            model="embedding-3",
            input=[text],
            dimensions=1024,
        )
        return response.data[0].embedding

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _call)