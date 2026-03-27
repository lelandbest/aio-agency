import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from ai_service import ai_assist_service, list_ollama_models
from backend.agent_definitions import get_agent_definition, AGENT_DEFINITIONS

logger = logging.getLogger(__name__)

class BaseAgent:
    def __init__(self, name: str):
        self.definition = AGENT_DEFINITIONS.get(name)
        self.name = name

    def execute(self, step: dict, context: dict, runtime: dict) -> dict:
        """
        Phase 14-15: Autonomous Reasoning + Multi-Agent Collaboration Loop.
        """
        # --- 1. OBSERVE & INITIALIZE SHARED CONTEXT ---
        if "sharedContext" not in runtime:
            runtime["sharedContext"] = {"goal": runtime.get("command"), "plan": [], "agentNotes": []}
            
        knowledge = runtime.get("retrievedContext", {})
        autonomous_retrievals = step.get("_autonomous_retrievals", 0)
        delegation_depth = step.get("_delegation_depth", 0)
        max_retrievals = 2
        max_delegation = 3

        # --- 2. THINK: Context Sufficiency & Notes ---
        logger.info(f"Agent {self.name} processing step {step.get('id')} with intent {step.get('intent')}")
        self._add_note(runtime, f"Evaluating step: {step.get('intent')}")
        
        needs_more_context = False
        if not knowledge and autonomous_retrievals < max_retrievals:
            command = runtime.get("command", "").lower()
            if any(word in command for word in ["pricing", "process", "sop", "policy", "history"]):
                needs_more_context = True

        # --- 3. ACT (Retrieval) ---
        if needs_more_context:
            from backend.cortext_service import cortext_service
            query = runtime.get("command", "workspace info")
            new_knowledge = cortext_service.retrieve_context(query)
            
            action_entry = {
                "type": "autonomous_retrieval",
                "agent": self.name,
                "query": query,
                "result_count": len(new_knowledge),
                "timestamp": context.get("timestamp")
            }
            if "trace" not in runtime:
                runtime["trace"] = []
            runtime["trace"].append(action_entry)
            
            runtime["retrievedContext"] = {"results": new_knowledge}
            step["_autonomous_retrievals"] = autonomous_retrievals + 1
            step["_intelligence_used"] = True

        # --- 4. THINK: Delegation Decision ---
        # Logic: If ALPHA (Commander) sees a specific specialist intent, it might delegate
        # for more refined execution if not already assigned.
        delegated_step_result = None
        if self.name == "ALPHA" and delegation_depth < max_delegation:
            intent = step.get("intent", "").lower()
            # Logic: We match intent against known specialist tool handles
            specialist_name = self._find_specialist_for_intent(intent)
            if specialist_name and specialist_name != self.name:
                delegated_step_result = self.delegate_to_agent(specialist_name, step, runtime, context)
                if delegated_step_result:
                    return delegated_step_result

        # --- 5. ACT (Tool Selection + Provider Execution) ---
        chosen_tool = self._select_tool(step, runtime)

        self._add_note(runtime, f"Executing with tool: {chosen_tool or 'internal'}")
        provider_result = self._execute_with_provider(step, context, runtime, chosen_tool)
        if provider_result.get("status") != "success":
            return provider_result

        return {
            "status": "success",
            "agent": self.name,
            "agentId": self.definition.agent_id if self.definition else None,
            "stepId": step.get("id"),
            "chosenTool": chosen_tool,
            "intelligenceSummary": "Retrieved additional context autonomously" if needs_more_context else "Used existing context",
            "data": provider_result.get("data") or {}
        }

    def _select_tool(self, step: dict, runtime: dict) -> str | None:
        if not self.definition or not self.definition.tools:
            return None
        intent = step.get("intent", "").lower().replace("_", "")
        command = " ".join(str(runtime.get("command") or "").lower().split())
        for tool_name in self.definition.tools:
            normalized_tool = tool_name.lower().replace("_", " ")
            normalized_tool_compact = normalized_tool.replace(" ", "")
            if intent and intent in normalized_tool_compact:
                return tool_name
            if command and any(token for token in normalized_tool.split() if token and token in command):
                return tool_name
        return self.definition.tools[0]

    def _execute_with_provider(self, step: dict, context: dict, runtime: dict, chosen_tool: str | None) -> dict:
        provider_config = runtime.get("providerConfig")
        command = " ".join(
            str(step.get("parameters", {}).get("command") or runtime.get("command") or "").split()
        ).strip()
        if not command:
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": "ExecutionEngine received an empty command.",
                "data": None,
            }
        if not provider_config:
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": "No active AI provider is configured for agent execution.",
                "data": None,
            }

        completed_step_outputs = []
        for completed_index, completed_step in enumerate(runtime.get("steps") or [], start=1):
            if not isinstance(completed_step, dict):
                continue
            if completed_step.get("status") != "success" or completed_step.get("id") == step.get("id"):
                continue
            completed_data = completed_step.get("data") if isinstance(completed_step.get("data"), dict) else {}
            completed_text = " ".join(
                str(
                    completed_data.get("message")
                    or completed_data.get("suggestion")
                    or completed_data.get("content")
                    or completed_data.get("result")
                    or ""
                ).split()
            ).strip()
            if not completed_text:
                continue
            completed_step_outputs.append(
                {
                    "step_index": completed_index,
                    "agent": completed_step.get("assignedAgent"),
                    "output": completed_text,
                }
            )

        context_payload = {
            "module": context.get("module"),
            "surface": context.get("surface"),
            "requested_agent": context.get("requested_agent"),
            "active_agent": context.get("active_agent"),
            "brain_memory": context.get("brain_memory") or [],
            "shared_plan": (runtime.get("sharedContext") or {}).get("plan") or [],
            "flow": context.get("flow") or (
                {"id": context.get("flow_id"), "name": context.get("flow_name")}
                if context.get("flow_id")
                else None
            ),
            "completed_step_outputs": completed_step_outputs,
        }
        prompt = "\n".join(
            [
                f"Operator command: {command}",
                f"Assigned agent: {self.name}",
                f"Agent role: {self.definition.role if self.definition else self.name}",
                f"Selected tool: {chosen_tool or 'internal reasoning'}",
                f"Execution context: {json.dumps(context_payload, default=str)}",
                "Respond directly to the operator with a concrete result. Do not repeat the command verbatim.",
            ]
        )
        system_prompt = (
            f"{self.definition.system_prompt if self.definition else f'You are {self.name}.'}\n"
            "You are executing inside the Cortex ExecutionEngine.\n"
            "Produce a useful operator-facing answer.\n"
            "Do not echo the operator command.\n"
            "If required information is missing, state the missing requirement explicitly."
        )

        try:
            ai_response = ai_assist_service._provider_complete(
                provider_config,
                prompt,
                system_prompt=system_prompt,
            )
        except Exception as exc:
            logger.error("Agent %s provider execution failed: %s", self.name, exc)
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": str(exc),
                "data": None,
            }

        if not ai_response:
            provider_key = str(provider_config.get("provider_key") or "").strip().lower()
            base_url = str(provider_config.get("base_url") or "").strip()
            model = str(provider_config.get("model") or "").strip()
            provider_settings = provider_config.get("config") or {}
            if provider_key == "ollama" and base_url and model:
                try:
                    models = list_ollama_models(
                        base_url,
                        provider_config.get("api_key"),
                        provider_settings.get("username"),
                        provider_settings.get("password"),
                    )
                except Exception as exc:
                    return {
                        "status": "error",
                        "stepId": step.get("id"),
                        "error": f"Ollama provider check failed: {exc}",
                        "data": None,
                    }
                available_models = []
                for item in models or []:
                    if isinstance(item, dict):
                        name = str(item.get("name") or item.get("model") or "").strip()
                    else:
                        name = str(item or "").strip()
                    if name:
                        available_models.append(name)
                if model not in available_models:
                    return {
                        "status": "error",
                        "stepId": step.get("id"),
                        "error": f"Ollama model '{model}' is not available on {base_url}. Available models: {', '.join(available_models) or 'none'}",
                        "data": None,
                    }
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": f"{self.name} provider returned no output.",
                "data": None,
            }

        suggestion = " ".join(str((ai_response or {}).get("suggestion") or "").split()).strip()
        if not suggestion:
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": f"{self.name} returned no output.",
                "data": None,
            }
        if suggestion.casefold() == command.casefold():
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": f"{self.name} returned an echo response instead of an execution result.",
                "data": None,
            }

        alternatives = (ai_response or {}).get("alternatives")
        metadata = (ai_response or {}).get("metadata") if isinstance((ai_response or {}).get("metadata"), dict) else {}
        rationale = str((ai_response or {}).get("rationale") or "").strip()
        return {
            "status": "success",
            "stepId": step.get("id"),
            "data": {
                "message": suggestion,
                "suggestion": suggestion,
                "content": suggestion,
                "rationale": rationale,
                "alternatives": alternatives if isinstance(alternatives, list) else [],
                "metadata": {
                    **metadata,
                    "agent": self.name,
                    "agentId": self.definition.agent_id if self.definition else None,
                    "tool": chosen_tool,
                },
            },
        }

    def _add_note(self, runtime: dict, note: str):
        if "sharedContext" in runtime:
            from datetime import datetime
            runtime["sharedContext"]["agentNotes"].append({
                "agent": self.name,
                "note": note,
                "timestamp": datetime.now().isoformat()
            })

    def delegate_to_agent(self, to_agent_name: str, step: dict, runtime: dict, context: dict) -> Optional[dict]:
        """
        Phase 15: Explicitly hand off execution to another agent.
        """
        to_agent = AgentRegistry.get(to_agent_name)
        if not to_agent:
            return None

        depth = step.get("_delegation_depth", 0) + 1
        
        # Log delegation in trace
        trace_entry = {
            "action": "delegate",
            "fromAgent": self.name,
            "toAgent": to_agent_name,
            "stepId": step.get("id"),
            "depth": depth,
            "timestamp": datetime_now() if 'datetime_now' in globals() else None
        }
        if "trace" not in runtime:
            runtime["trace"] = []
        runtime["trace"].append(trace_entry)
        
        # Prepare delegated step
        delegated_step = step.copy()
        delegated_step["assignedAgent"] = to_agent_name
        delegated_step["_delegation_depth"] = depth
        delegated_step["_parent_agent"] = self.name
        
        # Execute via the target agent
        logger.info(f"Agent {self.name} delegating {step.get('id')} to {to_agent_name}")
        return to_agent.execute(delegated_step, context, runtime)

    def _find_specialist_for_intent(self, intent: str) -> Optional[str]:
        """
        Phase 15: Generic specialist lookup based on backend agent definitions.
        Matches intent against capabilities and functional tool keywords.
        """
        intent_normalized = intent.lower().replace("_", "")
        for name, defn in AGENT_DEFINITIONS.items():
            if name == "ALPHA": continue # Skip commander
            
            # Match against tools or capabilities
            combined_search = [t.lower().replace(" ", "").replace("_", "") for t in (defn.tools + defn.capabilities)]
            if any(intent_normalized in item for item in combined_search):
                return name
        return None

AGENT_ID_MAP = {d.agent_id: k for k, d in AGENT_DEFINITIONS.items()}

class AgentRegistry:
    _agents: Dict[str, BaseAgent] = {}

    @classmethod
    def register(cls, name: str, agent: BaseAgent):
        cls._agents[name] = agent

    @classmethod
    def get(cls, name_or_id: str) -> Optional[BaseAgent]:
        if not name_or_id:
            return None
        # Check by name first
        if name_or_id in cls._agents:
            return cls._agents[name_or_id]
        # Then check map
        name = AGENT_ID_MAP.get(name_or_id, name_or_id)
        return cls._agents.get(name)

# --- Basic Core Agents for phase integration ---
class AlphaAgent(BaseAgent):
    def __init__(self):
        super().__init__("ALPHA")
    
    def execute(self, step: dict, context: dict, runtime: dict) -> dict:
        # Alpha can specifically synthesize multiple knowledge points
        return super().execute(step, context, runtime)

class CharlieAgent(BaseAgent):
    def __init__(self):
        super().__init__("CHARLIE")

class EchoAgent(BaseAgent):
    def __init__(self):
        super().__init__("ECHO")

# Initial Registration
AgentRegistry.register("ALPHA", AlphaAgent())
AgentRegistry.register("CHARLIE", CharlieAgent())
AgentRegistry.register("ECHO", EchoAgent())
# Plus others as needed
for name in AGENT_DEFINITIONS:
    if name not in ["ALPHA", "CHARLIE", "ECHO"]:
        AgentRegistry.register(name, BaseAgent(name))
