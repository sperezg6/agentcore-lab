import logging

from bedrock_agentcore.memory.integrations.strands.config import (
    AgentCoreMemoryConfig,
    RetrievalConfig,
)
from bedrock_agentcore.memory.integrations.strands.session_manager import (
    AgentCoreMemorySessionManager,
)
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from constants import (
    DEFAULT_ACTOR_ID,
    ENABLE_CODE_INTERPRETER,
    MEMORY_ID,
    MEMORY_NAMESPACES,
    MODEL_ID,
    REGION_ID,
    system_prompt,
)
from strands import Agent
from strands_tools.code_interpreter import AgentCoreCodeInterpreter

logger = logging.getLogger("spg-personal-agent")
logging.basicConfig(level=logging.INFO)

app = BedrockAgentCoreApp()


def build_session_manager(actor_id: str, session_id: str):
    retrieval = {
        ns: RetrievalConfig(top_k=4, relevance_score=0.4) for ns in MEMORY_NAMESPACES
    }

    memory_config = AgentCoreMemoryConfig(
        memory_id=MEMORY_ID,
        session_id=session_id,
        actor_id=actor_id,
        retrieval_config=retrieval,
    )

    return AgentCoreMemorySessionManager(memory_config, REGION_ID)


def build_tools(session_id: str) -> list:
    tools = []

    # Sandbozed Execuion
    if ENABLE_CODE_INTERPRETER:
        code_interpreter_tool = AgentCoreCodeInterpreter(
            region=REGION_ID,
            session_name=session_id,
            auto_create=True,
        )
        tools.append(code_interpreter_tool.code_interpreter)

    return tools


@app.entrypoint
def invoke(payload, context):
    """
    Payload: {"prompt": "...", "actor_id":"optional"}
    Context: runtime context; context session_id isolates this converstation
    """

    prompt = (payload or {}).get("prompt", "").strip()
    if not prompt:
        return {"response": "What can I help you with", "session_id": None}

    actor_id = DEFAULT_ACTOR_ID
    session_id = getattr(context, "session_id", None) or "local-session"

    agent = Agent(
        model=MODEL_ID,
        system_prompt=system_prompt(),
        session_manager=build_session_manager(actor_id, session_id),
        tools=build_tools(session_id),
    )

    result = agent(prompt)
    text = result.message.get("content", [{}])[0].get("text", str(result))
    return {"response": text, "session_id": session_id, "actor_id": actor_id}


if __name__ == "__main__":
    # Local dev server: serves /invocations and /ping on :8080.
    # Test with scripts/invoke_local.py (below) or curl.
    app.run()
