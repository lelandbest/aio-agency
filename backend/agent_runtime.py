import logging
from typing import Any, Dict, Optional
from datetime import datetime
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

        # --- 5. ACT (Tool Selection) ---
        chosen_tool = None
        if self.definition and self.definition.tools:
            intent = step.get("intent", "").lower().replace("_", "")
            for tool_name in self.definition.tools:
                if intent in tool_name.lower().replace("_", ""):
                    chosen_tool = tool_name
                    break

        self._add_note(runtime, f"Executing with tool: {chosen_tool or 'internal'}")

        return {
            "status": "success",
            "agent": self.name,
            "agentId": self.definition.agent_id if self.definition else None,
            "stepId": step.get("id"),
            "chosenTool": chosen_tool,
            "intelligenceSummary": "Retrieved additional context autonomously" if needs_more_context else "Used existing context",
            "data": {}
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
