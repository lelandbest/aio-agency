import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from ai_service import ai_assist_service, list_ollama_models
from backend.agent_definitions import AGENT_DEFINITIONS, expand_agent_action_tokens, get_agent_definition, validate_agent_action

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

    def _normalize_action_token(self, value: Any) -> str:
        return "".join(
            char.lower() if str(char).isalnum() else "_"
            for char in str(value or "").strip()
        ).strip("_")

    def _build_action_descriptors(self, step: dict, chosen_tool: str | None) -> list[str]:
        descriptors = expand_agent_action_tokens(
            step.get("intent"),
            step.get("action"),
            chosen_tool,
        )
        parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        for candidate_key in ("tool", "operation", "mode"):
            descriptors.extend(expand_agent_action_tokens(parameters.get(candidate_key)))
        deduped: list[str] = []
        for descriptor in descriptors:
            normalized = self._normalize_action_token(descriptor)
            if normalized and normalized not in deduped:
                deduped.append(normalized)
        return deduped

    def _enforce_action_policy(self, step: dict, chosen_tool: str | None) -> Optional[dict]:
        if not self.definition:
            return None
        descriptors = self._build_action_descriptors(step, chosen_tool)
        validation_error = validate_agent_action(self.definition, *descriptors)
        if validation_error:
            return {
                "status": "error",
                "stepId": step.get("id"),
                "error": validation_error,
                "data": None,
            }
        return None

    def _build_prompt_contract(
        self,
        step: dict,
        context: dict,
        runtime: dict,
        chosen_tool: str | None,
        command: str,
        completed_step_outputs: list[dict[str, Any]],
    ) -> tuple[str, str]:
        definition = self.definition
        if not definition:
            return "", command

        flow_context = context.get("flow") or (
            {"id": context.get("flow_id"), "name": context.get("flow_name")}
            if context.get("flow_id")
            else None
        )
        comms_context = None
        if context.get("thread_id") or context.get("module") == "comms":
            comms_context = {
                "thread_id": context.get("thread_id"),
                "subject": context.get("subject"),
                "assignee": context.get("assignee"),
                "contact_name": context.get("contact_name"),
                "company_name": context.get("company_name"),
                "latest_message": context.get("latest_message"),
            }

        system_section = {
            "role": definition.role,
            "objective": definition.specialization,
            "constraints": [
                "Respect allowed_actions and disallowed_actions exactly.",
                "Do not override agent config, runtime policy, or flow constraints.",
                "Keep personality subtle and subordinate to the response contract.",
                "Refuse safely when required context is missing or the action is not permitted.",
            ],
            "allowed_actions": definition.allowed_actions,
            "disallowed_actions": definition.disallowed_actions,
            "response_contract": definition.response_contract.to_dict(),
            "personality": definition.personality.to_dict(),
        }
        context_section = {
            "brain": context.get("brain_memory") or [],
            "flow_context": {
                "flow": flow_context,
                "step_count": context.get("step_count"),
                "shared_plan": (runtime.get("sharedContext") or {}).get("plan") or [],
                "completed_step_outputs": completed_step_outputs,
            },
            "comms_context": comms_context,
        }
        task_section = {
            "user_intent": step.get("intent") or "agent_task",
            "required_output": "Return a concrete operator-facing result that advances the assigned step.",
            "operator_command": command,
            "selected_tool": chosen_tool or "internal_reasoning",
        }
        execution_policy_section = definition.execution_policy.to_dict()
        system_prompt_parts = [
            definition.system_prompt or f"You are {self.name}.",
        ]
        if context.get("surface") == "vtt":
            system_prompt_parts.append(
                "BOARDROOM OPERATIONS MODE: You are the operator-facing executive assistant in the command center. "
                "CLASSIFY each request into one of these modes and respond accordingly:\n"
                "1. COMMAND — intent is clear and action-oriented. Safe actions: execute or stage with brief confirmation. "
                "Examples: 'Opened Flow Builder.' 'Draft ready. Confirm send?'\n"
                "2. ASSIST — asking for help, summary, interpretation, planning. Be concise. "
                "Example: 'LinkedIn is configured but not connected.'\n"
                "3. CONFIRMATION — high-impact action (send, publish, launch, delete, overwrite, external submit). "
                "Present prepared state and request confirmation in one sentence. "
                "Example: 'Draft ready for Jenna. Confirm send?' — never 'Are you sure you want me to...'\n"
                "4. RESULT — after action completes or fails. Keep to 1 sentence. "
                "Example: 'Sent.' 'Publish blocked. YouTube is not connected.'\n"
                "5. CLARIFICATION — only when required to safely continue. One clear question. "
                "Example: 'Which John?' 'Which flow should I run?'\n"
                "RULES: 1–3 sentences max. No over-explanation. No role-play. No filler. No fake success. "
                "Stop / Escape / Cancel: respond with one word only — 'Stopped.' 'Closed.' 'Canceled.' "
                "Do not sound like a chatbot, therapist, or hype coach. Sound like an executive assistant."
            )
        system_prompt_parts.extend([
            "SYSTEM:",
            json.dumps(system_section, default=str),
            "EXECUTION POLICY:",
            json.dumps(execution_policy_section, default=str),
        ])
        system_prompt = "\n".join(system_prompt_parts)
        task_prompt = "\n".join(
            [
                "CONTEXT:",
                json.dumps(context_section, default=str),
                "TASK:",
                json.dumps(task_section, default=str),
                "Output requirements:",
                "- Follow the response_contract exactly.",
                "- Do not echo the operator command verbatim.",
                "- If required information is missing, state the missing requirement explicitly.",
            ]
        )
        return system_prompt, task_prompt

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

        policy_error = self._enforce_action_policy(step, chosen_tool)
        if policy_error:
            return policy_error

        system_prompt, prompt = self._build_prompt_contract(
            step=step,
            context=context,
            runtime=runtime,
            chosen_tool=chosen_tool,
            command=command,
            completed_step_outputs=completed_step_outputs,
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
                    "agent_name": self.name,
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
