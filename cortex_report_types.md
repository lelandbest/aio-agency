# Cortex Report Types & Prompts

## Overview
Cortex provides 13 insight report types for operational intelligence. Each report includes a descriptive label, description, and a generation prompt that can be wired to an AI model.

---

## Report Types

| ID | Label | Description |
|----|-------|-------------|
| `brand-avatar` | Brand Avatar Intelligence | Define exactly who buys and why using CRM and engagement data. |
| `awareness-attention` | Awareness & Attention | Measure top-of-funnel effectiveness and hook strength. |
| `content-performance` | Content Performance | Identify content themes that drive direct revenue. |
| `offer-conversion` | Offer & Conversion | Diagnose funnel leaks and pricing sensitivity. |
| `customer-journey` | Customer Journey Mapping | Track the full path to purchase from first touch. |
| `market-intelligence` | Market Intelligence | Track emerging niches and shifting demand. |
| `competitive-intelligence` | Competitive Intelligence | Spot competitor positioning gaps and messaging flaws. |
| `service-performance` | Product / Service Performance | Evaluate delivery bottlenecks and client results. |
| `operational-efficiency` | Operational Efficiency | Optimize internal systems and automation ROI. |
| `revenue-intelligence` | Revenue Intelligence | Understand LTV and revenue concentration risk. |
| `client-retention` | Client Retention & Satisfaction | Prevent churn and identify expansion opportunities. |
| `innovation-opportunity` | Innovation & Opportunity | Identify new products and blue ocean strategies. |

---

## Generation Prompts

### brand-avatar
**Prompt:**
```
Analyze CRM data, content engagement, and sales call transcripts to define the Top 3-5 ICPs, their emotional drivers (pain, aspiration, fear), and specific buying triggers.
```

### awareness-attention
**Prompt:**
```
Evaluate impressions vs. watch time vs. retention across social platforms. Provide insights on hook effectiveness and specific drop-off points.
```

### content-performance
**Prompt:**
```
Map content themes and formats to revenue generated. Identify the most profitable content categories and track money per piece of content.
```

### offer-conversion
**Prompt:**
```
Review funnel analytics and sales conversations to identify conversion rates by offer, drop-off points, and pricing sensitivity insights.
```

### customer-journey
**Prompt:**
```
Analyze multi-touch attribution and CRM timelines. Map the key touchpoints that matter most and identify friction points in the automation path.
```

### market-intelligence
**Prompt:**
```
Scan search trends and social listening data. Identify emerging niches, seasonal demand spikes, and service demand trends.
```

### competitive-intelligence
**Prompt:**
```
Compare competitor content and offers. Map positioning gaps, pricing benchmarks, and messaging differences to find blue ocean space.
```

### service-performance
**Prompt:**
```
Review project completion data and support tickets. Identify the most profitable services and bottlenecks in scaling delivery.
```

### operational-efficiency
**Prompt:**
```
Audit automation logs (Make/n8n) and task completion times. Calculate time saved via automation and identify failure points in workflows.
```

### revenue-intelligence
**Prompt:**
```
Analyze CRM deals and subscription revenue. Map revenue by channel and assess customer lifetime value (LTV) and concentration risk.
```

### client-retention
**Prompt:**
```
Review NPS feedback and automation usage. Identify churn reasons, high-retention client traits, and specific expansion opportunities.
```

### innovation-opportunity
**Prompt:**
```
Analyze feature requests and failed deal reasons. Provide a roadmap for new offer ideas and signals for product innovation.
```

---

## Implementation Status

| Component | Status |
|-----------|--------|
| Report definitions | ✅ Complete |
| UI trigger | ✅ Working |
| Prompt storage | ✅ Complete |
| AI generation | ❌ Not wired |
| Analytics data | ✅ Available |

### Current Behavior
The prompts exist but are **not connected to AI generation**. Currently, the system produces template-based reports using analytics data only.

### Required for AI Generation
1. Wire prompts to AI model invocation
2. Pass analytics context as input
3. Use AI response as report output
4. Add error handling for model failures
