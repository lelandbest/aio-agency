# Flow Builder Agent Tool List

This file captures the current Flow Builder AI tool inventory from `frontend/src/modules/Flows/data/toolTemplates.js`.

## ALPHA

- `tool-alpha-mission-brief` - Mission Brief Generator
- `tool-alpha-resource-alloc` - Resource Allocation Optimizer
- `tool-alpha-squad-dashboard` - Squad Performance Dashboard
- `tool-alpha-integration-protocol` - Integration Protocol Generator
- `tool-alpha-directive` - Strategic Directive Builder

## ECHO

- `tool-echo-email-template` - Email Template Generator
- `tool-echo-newsletter` - Newsletter Builder
- `tool-echo-comms-plan` - Communication Plan Creator
- `tool-echo-auto-response` - Automated Response Generator
- `tool-echo-campaign-seq` - Campaign Sequence Builder
- `tool-echo-social-calendar` - Social Media Calendar Generator
- `tool-echo-hashtag` - Hashtag Strategy Builder
- `tool-echo-engagement` - Engagement Response Templates
- `tool-echo-post-formatter` - Platform-Specific Post Formatter
- `tool-echo-social-campaign` - Social Campaign Builder

## GHOST

- `tool-ghost-architecture` - System Architecture Planner
- `tool-ghost-automation` - Automation Playbook Builder
- `tool-ghost-integration-map` - Integration Map Generator
- `tool-ghost-devops` - DevOps Checklist Generator
- `tool-ghost-incident` - Incident Response Protocol
- `tool-ghost-cicd` - CI/CD Pipeline Planner
- `tool-ghost-infra` - Infrastructure Blueprint Generator
- `tool-ghost-api` - API Integration Design
- `tool-ghost-security` - Security Hardening Checklist

## Notes

- These tools are palette-visible action nodes.
- They currently behave as agent-mediated nodes rather than explicit deterministic runtime operators.
- Runtime hardening should define a common agent-tool contract before adding more tools.
