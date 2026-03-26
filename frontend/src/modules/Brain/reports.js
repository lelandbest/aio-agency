export const INSIGHT_REPORTS = [
  {
    id: 'brand-avatar',
    label: 'Brand Avatar Intelligence',
    description: 'Define exactly who buys and why using CRM and engagement data.',
    prompt: `Analyze CRM deals, Signals activity, Comms threads, and content performance to identify the Top 3–5 highest-value ICP segments.
For each ICP:
- define core pain, aspiration, and buying trigger
- identify acquisition channel/source
- map converting content/interactions
- highlight friction/drop-offs
Then:
- rank ICPs by revenue impact and scalability
- identify under-optimized ICP
Finally:
- recommend 3 actions to increase conversion for the top ICP
- recommend 1 new campaign or flow
Output:
- ICP Table
- Key Insights
- Recommended Actions`
  },
  {
    id: 'awareness-attention',
    label: 'Awareness & Attention',
    description: 'Measure top-of-funnel effectiveness and hook strength.',
    prompt: `Analyze impressions, CTR, watch time, retention, and Signals tied to content.
Identify:
- top-performing hooks and why they work
- exact drop-off points and causes
- mismatch between reach and engagement
Then:
- rank top 5 content pieces by attention quality
- identify 3 failing patterns
Finally:
- provide 3 hook rewrites
- recommend 2 content experiments
Output:
- Performance Breakdown
- Drop-off Analysis
- Action Plan`
  },
  {
    id: 'content-performance',
    label: 'Content Performance',
    description: 'Identify content themes that drive direct revenue.',
    prompt: `Map content themes, formats, and distribution to revenue and deal creation.
Identify:
- top revenue-generating content categories
- revenue per content piece
- lag between content and conversion
Then:
- rank top 5 content types by ROI
- identify underperforming content clusters
Finally:
- recommend 3 content shifts
- recommend 1 new content series tied to revenue
Output:
- ROI Table
- Insights
- Content Actions`
  },
  {
    id: 'offer-conversion',
    label: 'Offer & Conversion',
    description: 'Diagnose funnel leaks and pricing sensitivity.',
    prompt: `Analyze funnel stages, deal progression, and Comms interactions.
Identify:
- conversion rates per offer
- pricing sensitivity patterns
- drop-off stages and causes
Then:
- rank offers by conversion efficiency
- identify friction in funnel
Finally:
- recommend 3 conversion improvements
- recommend 1 pricing or positioning change
Output:
- Funnel Metrics
- Friction Points
- Optimization Actions`
  },
  {
    id: 'customer-journey',
    label: 'Customer Journey Mapping',
    description: 'Track the full path to purchase from first touch.',
    prompt: `Analyze CRM timelines, Comms, and automation flows.
Map:
- key touchpoints leading to conversion
- time between stages
- critical interaction triggers
Then:
- identify bottlenecks and delays
- identify unnecessary steps
Finally:
- recommend 3 journey optimizations
- recommend 1 automation improvement
Output:
- Journey Map
- Bottlenecks
- Actions`
  },
  {
    id: 'market-intelligence',
    label: 'Market Intelligence',
    description: 'Track emerging niches and shifting demand.',
    prompt: `Analyze trends, inbound signals, deal sources, and content performance.
Identify:
- emerging niches and demand shifts
- seasonal patterns
- rising service interest
Then:
- rank top opportunities by demand and fit
Finally:
- recommend 3 market plays
- recommend 1 new offer or positioning angle
Output:
- Market Trends
- Opportunities
- Actions`
  },
  {
    id: 'competitive-intelligence',
    label: 'Competitive Intelligence',
    description: 'Spot competitor positioning gaps and messaging flaws.',
    prompt: `Analyze competitor positioning, offers, and content vs your performance.
Identify:
- pricing differences
- messaging gaps
- underserved segments
Then:
- identify competitive weaknesses
Finally:
- recommend 3 positioning advantages
- recommend 1 blue ocean strategy
Output:
- Comparison Table
- Gaps
- Strategy Actions`
  },
  {
    id: 'service-performance',
    label: 'Product / Service Performance',
    description: 'Evaluate delivery bottlenecks and client results.',
    prompt: `Analyze delivery data, support tickets, and fulfillment timelines.
Identify:
- most profitable services
- bottlenecks in delivery
- scaling constraints
Then:
- rank services by margin and effort
Finally:
- recommend 3 optimization actions
- recommend 1 service to expand or cut
Output:
- Service Metrics
- Bottlenecks
- Actions`
  },
  {
    id: 'operational-efficiency',
    label: 'Operational Efficiency',
    description: 'Optimize internal systems and automation ROI.',
    prompt: `Analyze automation logs, task times, and orchestration events.
Identify:
- time saved by automation
- failure points in flows
- manual workload hotspots
Then:
- rank top inefficiencies
Finally:
- recommend 3 automation fixes
- recommend 1 new flow
Output:
- Efficiency Metrics
- Failures
- Actions`
  },
  {
    id: 'revenue-intelligence',
    label: 'Revenue Intelligence',
    description: 'Understand LTV and revenue concentration risk.',
    prompt: `Analyze deals, subscriptions, and revenue streams.
Identify:
- revenue by channel
- LTV patterns
- concentration risk
Then:
- rank revenue drivers
Finally:
- recommend 3 growth actions
- recommend 1 diversification strategy
Output:
- Revenue Breakdown
- Risks
- Actions`
  },
  {
    id: 'client-retention',
    label: 'Client Retention & Satisfaction',
    description: 'Prevent churn and identify expansion opportunities.',
    prompt: `Analyze churn, NPS, usage patterns, and Comms.
Identify:
- churn causes
- retention drivers
- expansion signals
Then:
- rank client segments by retention
Finally:
- recommend 3 retention actions
- recommend 1 upsell strategy
Output:
- Retention Metrics
- Risks
- Actions`
  },
  {
    id: 'innovation-opportunity',
    label: 'Innovation & Opportunity',
    description: 'Identify new products and blue ocean strategies.',
    prompt: `Analyze feature requests, lost deals, and Signals.
Identify:
- unmet demand
- repeated objections
- emerging needs
Then:
- rank opportunities by impact
Finally:
- recommend 3 new offers
- recommend 1 product direction
Output:
- Opportunity Map
- Insights
- Actions`
  }
];
