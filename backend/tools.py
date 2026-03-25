import logging
from typing import Any, Dict, Optional
from backend.cortext_service import cortext_service

logger = logging.getLogger(__name__)

class BaseTool:
    name: str = "base_tool"
    
    def run(self, parameters: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

class QueryVaultTool(BaseTool):
    name = "query_vault"
    
    def run(self, parameters: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = parameters.get("query", "")
        top_k = parameters.get("topK", 5)
        strategy = parameters.get("strategy", "hybrid")
        
        logger.info(f"Tool {self.name} received query: {query}")
        results = cortext_service.query_vault(query, limit=top_k, strategy=strategy)
        
        return {
            "status": "success",
            "count": len(results),
            "results": results,
            "summary": cortext_service.get_context_summary(results)
        }

class DraftEmailTool(BaseTool):
    name = "draft_email"
    
    def run(self, parameters: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        # Existing draft email logic hook
        # This will be called by StepExecutor for backward compatibility
        return {
            "status": "success",
            "body": parameters.get("body", ""),
            "thread_id": parameters.get("thread_id")
        }

class AIOToolRegistry:
    _tools: Dict[str, BaseTool] = {}
    
    @classmethod
    def register(cls, tool: BaseTool):
        cls._tools[tool.name] = tool
        
    @classmethod
    def get(cls, name: str) -> Optional[BaseTool]:
        return cls._tools.get(name)

# Initial Tool Registration
AIOToolRegistry.register(QueryVaultTool())
AIOToolRegistry.register(DraftEmailTool())
