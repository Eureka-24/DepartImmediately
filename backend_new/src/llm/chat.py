from langchain_openai import ChatOpenAI
from src.config import get_settings

settings = get_settings()

chat = ChatOpenAI(
    model="deepseek-chat",
    api_key=settings.DEEPSEEK_API_KEY,
    openai_api_base="https://api.deepseek.com/v1",
    temperature=0.7,
    max_tokens=2000,
)


async def get_chat_response(messages: list[dict]) -> str:
    """Send a chat request to DeepSeek and return the response text."""
    from langchain_core.messages import HumanMessage, SystemMessage

    langchain_messages = []
    for msg in messages:
        if msg["role"] == "system":
            langchain_messages.append(SystemMessage(content=msg["content"]))
        else:
            langchain_messages.append(HumanMessage(content=msg["content"]))

    response = await chat.ainvoke(langchain_messages)
    return response.content