import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

@dataclass
class AgentDefinition:
    name: str
    agent_id: str
    role: str
    capabilities: List[str]
    tools: List[str]
    rank: str
    subordinates: List[str] = field(default_factory=list)
    system_prompt: str = ""

# Backend source of truth mapping the UI's SPECIALIST_REGISTRY
AGENT_DEFINITIONS: Dict[str, AgentDefinition] = {
    "ALPHA": AgentDefinition(
        name="ALPHA",
        agent_id="AGT-CMD-001",
        role="Command",
        rank="Commander-in-Chief",
        capabilities=["Routing", "Strategic Planning", "Resource Optimization"],
        tools=[
            "Mission Brief Generator",
            "Resource Allocation Optimizer",
            "Squad Performance Dashboard",
            "Integration Protocol Generator",
            "Strategic Directive Builder",
            "query_vault", "draft_email"
        ],
        subordinates=["BRAVO", "CHARLIE", "DELTA", "ECHO", "FORGE", "APEX", "ARCHER", "ATLAS", "RANGER", "SCOUT", "STRIKER", "VECTOR"],
        system_prompt="You are ALPHA, Commander-in-Chief. You govern all subordinate AI agents and synthesize multi-agent intelligence contexts.",
    ),
    "BRAVO": AgentDefinition(
        name="BRAVO",
        agent_id="AGT-STR-002",
        role="Strategy",
        rank="AI Agent",
        capabilities=["Business Analysis", "Market Research", "swot_analysis"],
        tools=["Strategic Plan Generator", "SWOT Analysis Builder", "Market Research Template", "market_research"],
        system_prompt="You are BRAVO, Business Strategy Specialist.",
    ),
    "CHARLIE": AgentDefinition(
        name="CHARLIE",
        agent_id="AGT-CS-003",
        role="Support",
        rank="AI Agent",
        capabilities=["Customer Support", "Ticket Resolution", "support_ticket"],
        tools=["Support Script Generator", "FAQ Builder", "Customer Response Templates", "add_crm_note"],
        system_prompt="You are CHARLIE, Customer Support Specialist.",
    ),
    "DELTA": AgentDefinition(
        name="DELTA",
        agent_id="AGT-CRD-004",
        role="Coordination",
        rank="AI Agent",
        capabilities=["Project Management", "Visual Tracking", "schedule_calendar"],
        tools=["Project Timeline Generator", "Resource Allocation Matrix", "schedule_meeting"],
        system_prompt="You are DELTA, Coordination Specialist.",
    ),
    "ECHO": AgentDefinition(
        name="ECHO",
        agent_id="AGT-COMMS-002",  # Frontend matches this
        role="Comms",
        rank="AI Agent",
        capabilities=["Email Drafts", "Social Media", "Newsletters"],
        tools=["Email Template Generator", "Newsletter Builder", "Communication Plan Creator", "draft_email", "query_vault"],
        system_prompt="You are ECHO, Communications and Email Specialist.",
    ),
    "FORGE": AgentDefinition(
        name="FORGE",
        agent_id="AGT-CPY-006",
        role="Copy",
        rank="AI Agent",
        capabilities=["Copywriting", "Article Generation"],
        tools=["Article Generator", "Product Description Writer", "draft_article"],
        system_prompt="You are FORGE, Content and Copywriting Specialist.",
    ),
    "APEX": AgentDefinition(
        name="APEX",
        agent_id="AGT-DEV-007",
        role="Engineering",
        rank="AI Agent",
        capabilities=["Code Architecture", "Automation", "Deployment", "coding"],
        tools=["System Architecture Planner", "Automation Playbook Builder", "API Integration Design", "code_review"],
        system_prompt="You are APEX, IT and Systems Engineering Specialist.",
    ),
    "ARCHER": AgentDefinition(
        name="ARCHER",
        agent_id="AGT-FIN-008",
        role="Analytics",
        rank="AI Agent",
        capabilities=["Financial Modeling", "KPI Tracking", "financial_analysis"],
        tools=["KPI Dashboard Generator", "Financial Report Builder", "ROI Calculator", "kpi_track"],
        system_prompt="You are ARCHER, Analytics and Financial Specialist.",
    ),
    "ATLAS": AgentDefinition(
        name="ATLAS",
        agent_id="AGT-LOG-009",
        role="Logistics",
        rank="AI Agent",
        capabilities=["Systems Mapping", "Deployment Planning"],
        tools=["Deployment Coordination Plan", "Systems Map Builder", "Resource Movement Tracker"],
        system_prompt="You are ATLAS, Logistics Specialist.",
    ),
    "RANGER": AgentDefinition(
        name="RANGER",
        agent_id="AGT-SEO-010",
        role="SEO",
        rank="AI Agent",
        capabilities=["SEO Optimization", "Keyword Tactics", "seo_audit"],
        tools=["SEO Blog Writer", "SEO Auditor", "Keyword Research Generator"],
        system_prompt="You are RANGER, SEO and Content Optimization Specialist.",
    ),
    "SCOUT": AgentDefinition(
        name="SCOUT",
        agent_id="AGT-HR-011",
        role="Recruitment",
        rank="AI Agent",
        capabilities=["Hiring", "Onboarding", "recruitment"],
        tools=["Job Description Generator", "Interview Question Builder", "Candidate Assessment Template", "hiring"],
        system_prompt="You are SCOUT, Recruitment and Hiring Specialist.",
    ),
    "STRIKER": AgentDefinition(
        name="STRIKER",
        agent_id="AGT-SLS-012",
        role="Sales",
        rank="AI Agent",
        capabilities=["Sales", "Outbound", "Negotiation"],
        tools=["Cold Email Generator", "Discovery Call Script Writer", "Proposal Builder", "draft_email", "query_vault", "add_contact"],
        system_prompt="You are STRIKER, Sales and Negotiation Specialist.",
    ),
    "VECTOR": AgentDefinition(
        name="VECTOR",
        agent_id="AGT-DES-013",
        role="Design",
        rank="AI Agent",
        capabilities=["Graphics", "Visual Generation"],
        tools=["Image Generation", "Upscale Image", "Brand Style Guide Generator"],
        system_prompt="You are VECTOR, Graphic Design Specialist.",
    ),
    "OMEGA": AgentDefinition(
        name="OMEGA",
        agent_id="AGT-OMG-999",
        role="Governance",
        rank="Shadow Authority",
        capabilities=["Emergency Governance"],
        tools=["Emergency Purge Arming", "Purge Countdown Control"],
        system_prompt="You are OMEGA. Restricted access.",
    ),
}

def get_agent_definition(name_or_id: str) -> Optional[AgentDefinition]:
    if not name_or_id:
        return None
    # Map from ID back to name
    name_map = {d.agent_id: k for k, d in AGENT_DEFINITIONS.items()}
    name = name_map.get(name_or_id, name_or_id.upper())
    return AGENT_DEFINITIONS.get(name)

