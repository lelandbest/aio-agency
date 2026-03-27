import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

@dataclass
class AgentDefinition:
    name: str
    agent_id: str
    label: str
    role: str
    specialization: str
    capabilities: List[str]
    tools: List[str]
    rank: str
    visibility: str = "visible"
    capability_tier: str = "tier-2"
    subordinates: List[str] = field(default_factory=list)
    system_prompt: str = ""

# Backend source of truth mapping the UI's SPECIALIST_REGISTRY
AGENT_DEFINITIONS: Dict[str, AgentDefinition] = {
    "ALPHA": AgentDefinition(
        name="ALPHA",
        agent_id="AGT-CMD-001",
        label="Commander-in-Chief",
        role="Command",
        specialization="Commander-in-Chief",
        rank="Commander-in-Chief",
        capability_tier="tier-1",
        capabilities=["Routing", "Strategic Planning", "Resource Optimization"],
        tools=[
            "Mission Brief Generator",
            "Resource Allocation Optimizer",
            "Squad Performance Dashboard",
            "Integration Protocol Generator",
            "Strategic Directive Builder",
            "query_vault", "draft_email"
        ],
        subordinates=["BRAVO", "CHARLIE", "DELTA", "ECHO", "FORGE", "GHOST", "ARCHER", "ATLAS", "RANGER", "SCOUT", "STRIKER", "VECTOR"],
        system_prompt="You are ALPHA, Commander-in-Chief. You govern all subordinate AI agents and synthesize multi-agent intelligence contexts.",
    ),
    "BRAVO": AgentDefinition(
        name="BRAVO",
        agent_id="AGT-STR-002",
        label="Business Strategy",
        role="Strategy",
        specialization="Business Strategy",
        rank="AI Agent",
        capabilities=["Business Analysis", "Market Research", "swot_analysis"],
        tools=["Strategic Plan Generator", "SWOT Analysis Builder", "Market Research Template", "market_research"],
        system_prompt="You are BRAVO, Business Strategy Specialist.",
    ),
    "CHARLIE": AgentDefinition(
        name="CHARLIE",
        agent_id="AGT-CS-003",
        label="Customer Support",
        role="Support",
        specialization="Customer Support",
        rank="AI Agent",
        capability_tier="tier-1",
        capabilities=["Customer Support", "Ticket Resolution", "support_ticket"],
        tools=["Support Script Generator", "FAQ Builder", "Customer Response Templates", "add_crm_note"],
        system_prompt="You are CHARLIE, Customer Support Specialist.",
    ),
    "DELTA": AgentDefinition(
        name="DELTA",
        agent_id="AGT-CRD-004",
        label="Visual/Project Coordination",
        role="Coordination",
        specialization="Visual/Project Coordination",
        rank="AI Agent",
        capabilities=["Project Management", "Visual Tracking", "schedule_calendar"],
        tools=["Project Timeline Generator", "Resource Allocation Matrix", "schedule_meeting"],
        system_prompt="You are DELTA, Coordination Specialist.",
    ),
    "ECHO": AgentDefinition(
        name="ECHO",
        agent_id="AGT-COMMS-002",  # Frontend matches this
        label="Email/Comms/Socials",
        role="Comms",
        specialization="Email/Comms/Socials",
        rank="AI Agent",
        capability_tier="tier-1",
        capabilities=["Email Drafts", "Social Media", "Newsletters"],
        tools=["Email Template Generator", "Newsletter Builder", "Communication Plan Creator", "draft_email", "query_vault"],
        system_prompt="You are ECHO, Communications and Email Specialist.",
    ),
    "FORGE": AgentDefinition(
        name="FORGE",
        agent_id="AGT-CPY-006",
        label="Content/Copywriting",
        role="Copy",
        specialization="Content/Copywriting",
        rank="AI Agent",
        capabilities=["Copywriting", "Article Generation"],
        tools=["Article Generator", "Product Description Writer", "draft_article"],
        system_prompt="You are FORGE, Content and Copywriting Specialist.",
    ),
    "GHOST": AgentDefinition(
        name="GHOST",
        agent_id="AGT-DEV-007",
        label="Systems Engineering",
        role="Engineering",
        specialization="Systems Engineering",
        rank="AI Agent",
        capability_tier="tier-1",
        capabilities=["Code Architecture", "Automation", "Deployment", "coding"],
        tools=["System Architecture Planner", "Automation Playbook Builder", "API Integration Design", "code_review"],
        system_prompt="You are GHOST, Systems Engineering Specialist.",
    ),
    "ARCHER": AgentDefinition(
        name="ARCHER",
        agent_id="AGT-FIN-008",
        label="Analytics/Financial",
        role="Analytics",
        specialization="Analytics/Financial",
        rank="AI Agent",
        capability_tier="tier-1",
        capabilities=["Financial Modeling", "KPI Tracking", "financial_analysis"],
        tools=["KPI Dashboard Generator", "Financial Report Builder", "ROI Calculator", "kpi_track"],
        system_prompt="You are ARCHER, Analytics and Financial Specialist.",
    ),
    "ATLAS": AgentDefinition(
        name="ATLAS",
        agent_id="AGT-LOG-009",
        label="Logistics/Systems Mapping",
        role="Logistics",
        specialization="Logistics/Systems Mapping",
        rank="AI Agent",
        capability_tier="tier-1",
        capabilities=["Systems Mapping", "Deployment Planning"],
        tools=["Deployment Coordination Plan", "Systems Map Builder", "Resource Movement Tracker"],
        system_prompt="You are ATLAS, Logistics Specialist.",
    ),
    "RANGER": AgentDefinition(
        name="RANGER",
        agent_id="AGT-SEO-010",
        label="SEO/Content Optimization",
        role="SEO",
        specialization="SEO/Content Optimization",
        rank="AI Agent",
        capabilities=["SEO Optimization", "Keyword Tactics", "seo_audit"],
        tools=["SEO Blog Writer", "SEO Auditor", "Keyword Research Generator"],
        system_prompt="You are RANGER, SEO and Content Optimization Specialist.",
    ),
    "SCOUT": AgentDefinition(
        name="SCOUT",
        agent_id="AGT-HR-011",
        label="Hiring/Recruitment",
        role="Recruitment",
        specialization="Hiring/Recruitment",
        rank="AI Agent",
        capabilities=["Hiring", "Onboarding", "recruitment"],
        tools=["Job Description Generator", "Interview Question Builder", "Candidate Assessment Template", "hiring"],
        system_prompt="You are SCOUT, Recruitment and Hiring Specialist.",
    ),
    "STRIKER": AgentDefinition(
        name="STRIKER",
        agent_id="AGT-SLS-012",
        label="Sales/Negotiation",
        role="Sales",
        specialization="Sales/Negotiation",
        rank="AI Agent",
        capability_tier="tier-1",
        capabilities=["Sales", "Outbound", "Negotiation"],
        tools=["Cold Email Generator", "Discovery Call Script Writer", "Proposal Builder", "draft_email", "query_vault", "add_contact"],
        system_prompt="You are STRIKER, Sales and Negotiation Specialist.",
    ),
    "VECTOR": AgentDefinition(
        name="VECTOR",
        agent_id="AGT-DES-013",
        label="Graphics/Design",
        role="Design",
        specialization="Graphics/Design",
        rank="AI Agent",
        capabilities=["Graphics", "Visual Generation"],
        tools=["Image Generation", "Upscale Image", "Brand Style Guide Generator"],
        system_prompt="You are VECTOR, Graphic Design Specialist.",
    ),
    "OMEGA": AgentDefinition(
        name="OMEGA",
        agent_id="AGT-OMG-999",
        label="Emergency Governance",
        role="Governance",
        specialization="Emergency Local Purge Control",
        rank="Shadow Authority",
        visibility="hidden",
        capability_tier="restricted",
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
