import os
from datetime import datetime, timezone

MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
REGION_ID = "us-east-1"
MEMORY_ID = os.getenv("BEDROCK_AGENTCORE_MEMORY_ID")
ENABLE_CODE_INTERPRETER = os.getenv("ENABLE_CODE_INTERPRETER", "").lower() == "true"

# Owner identity - who this agent personalize
DEFAULT_ACTOR_ID = "SPG"

MEMORY_NAMESPACES = [
    ns.strip()
    for ns in os.getenv(
        "MEMORY_NAMESPACES",
        "/strategies/summarization,/strategies/semantic,/strategies/userPreference",
    ).split(",")
    if ns.strip()
]


def system_prompt() -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"""You are Santiago's personal AI agent. Today is {today}.

Who you are:
- A trusted, candid personal assistant — proactive, concise, and practical.
- You remember Santiago across conversations: his projects, preferences, people,
and decisions. Use what you remember to personalize, and never re-ask for
things you already know.

How you work:
- Lead with the answer, then the reasoning. No filler, no hedging.
- When you use a tool, briefly say what you did and why.
- If you run code, show the code and then the result.
- If you're unsure or lack context, say so plainly and ask one sharp question.
- Be honest about limitations; never invent facts, dates, or sources.

Tone: direct, warm, low-ceremony. Talk like a sharp colleague, not a chatbot."""
