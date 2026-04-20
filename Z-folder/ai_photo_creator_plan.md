# AI Photo Creator System Plan

## Overview
This document outlines a scalable AI-powered photo generation system using a structured prompt framework and a simple user interface.

---

## Architecture

User → UI Form → Master AI → Worker AI Prompt → Image Generator → Email Delivery

---

## Core Concept

- Users interact with a simple form (radio buttons + text fields)
- A Master AI converts inputs into a structured, high-quality prompt
- A Worker AI generates the final image
- Output is delivered via email

---

## Prompt Modules

1. Image Quality & Camera
2. Subject Description
3. Wardrobe & Styling
4. Pose & Expression
5. Props
6. Environment
7. Lighting & Mood
8. Color Palette
9. Constraints

---

## Master Prompt Template

Ultra-realistic {resolution} portrait shot on a {lens} lens with {lighting_style} lighting.

Subject:
{subject_description}

Makeup & Grooming:
{makeup}

Wardrobe:
{outfit}

Pose & Composition:
{pose}

Props:
{props}

Set & Environment:
{environment}

Lighting & Mood:
{lighting_details}

Color Palette:
{color_palette}

Overall Style:
{style}

Constraints:
- Preserve facial identity
- Maintain photorealism
- No distortion

---

## UI Form Structure

- Email (required)
- Resolution (4K, 8K, 12K)
- Lens (35mm, 50mm, 55mm, 85mm)
- Gender
- Hair description (text)
- Eye color
- Expression
- Makeup style
- Outfit (text)
- Pose
- Occasion
- Holiday (conditional)
- Setting
- Props
- Lighting style

---

## Frontend

- Single HTML file
- Clean modern UI
- Responsive
- No frameworks required

---

## Backend / Automation

Connect form submission to:
- Make (Integromat)
- n8n
- Latenode
- Cloudflare Workers

Steps:
1. Receive form data
2. Pass to Master AI
3. Generate Worker prompt
4. Call image generation API
5. Email result

---

## Key Advantages

- Scalable prompt system
- Low user friction
- High-quality outputs
- Modular and extensible

---

## Future Enhancements

- Preset style packs
- Branding customization
- Pricing tiers
- User accounts
- Prompt validation rules

---

## Created
2026-03-30 14:53:32
