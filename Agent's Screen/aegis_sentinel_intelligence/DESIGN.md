---
name: Aegis Sentinel Intelligence
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#ca8100'
  on-tertiary-container: '#3e2400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-max: 1440px
---

## Brand & Style

The design system is engineered for forensic precision and high-stakes data analysis. The brand personality is restrained, authoritative, and clinical, designed to maintain user focus during high-pressure investigative workflows. 

The aesthetic follows a **Modern Corporate** style infused with **Minimalist** and **Technical** influences. It prioritizes clarity over decoration, using subtle tonal shifts rather than aggressive shadows to define hierarchy. The interface aims to feel like a high-end laboratory instrument: cold, efficient, and impeccably organized. Every pixel must serve a functional purpose in the forensic narrative.

## Colors

The design system utilizes a **dark-mode-first** architecture to reduce eye strain during prolonged forensic sessions. The palette is built on a foundation of deep, desaturated slates to provide a stable backdrop for high-contrast data visualization.

- **Primary (Action):** A crisp blue used for critical paths and Aegis-generated insights.
- **Secondary (Success/Verify):** A muted emerald for validated forensic data.
- **Tertiary (Alert/Caution):** A burnt amber for anomalies that require immediate attention.
- **Neutral (Surface):** A multi-tiered slate system (#0F172A base) that uses lightness increments to define elevation rather than shadows.

All forensic indicators must maintain a 4.5:1 contrast ratio against their respective surface tier to ensure legibility in dimly lit security operations centers.

## Typography

Typography in the design system differentiates between "Instructional/UI" and "Evidence/Data." 

**Inter** is utilized for all interface elements, navigation, and Aegis-generated insights, providing a modern and highly readable humanist sans-serif experience. 

**JetBrains Mono** is reserved strictly for forensic data, terminal outputs, hashes, and coordinate strings. This distinction ensures that investigators can instantly recognize raw evidence versus platform-generated analysis. Line heights are kept tight to maximize data density without sacrificing vertical rhythm.

## Layout & Spacing

The layout utilizes a **Fixed Grid** model for desktop analysis views to ensure that data columns remain predictable and scannable. A 12-column grid is standard, with 16px gutters and 24px outer margins.

The spacing rhythm is based on a strict 4px base unit. 
- Use **8px (2 units)** for internal component padding.
- Use **16px (4 units)** for spacing between logical groups.
- Use **24px (6 units)** for section headers and major layout blocks.

On mobile devices, the grid collapses to a 4-column fluid layout, prioritizing the chronological flow of forensic events. Tables must transition to detailed card views, maintaining the JetBrains Mono formatting for all data-centric strings.

## Elevation & Depth

This design system eschews traditional shadows in favor of **Tonal Layers**. Depth is communicated through the progressive lightening of surface hex values. 

1. **Level 0 (Background):** Base Slate-950 (#020617) — used for the main application backdrop.
2. **Level 1 (Surface):** Slate-900 (#0F172A) — used for primary sidebars and navigation containers.
3. **Level 2 (Container):** Slate-800 (#1E293B) — used for content cards and data tables.
4. **Level 3 (Overlay):** Slate-700 (#334155) — used for tooltips, dropdowns, and modals.

A subtle **1px inner border** (Low-contrast outline) in a slightly lighter shade (Opacity 10% white) is applied to Level 2 and Level 3 elements to define boundaries without adding visual bulk.

## Shapes

The design system employs a **Soft** shape language to provide a slight visual reprieve from the high-density data. A consistent **4px (0.25rem)** border radius is applied to all standard components including input fields, buttons, and card containers. 

This specific radius maintains a "technical" feel—appearing sharp at a glance but lacking the harshness of a true 0px corner. Interactive elements like checkboxes use a 2px radius, while larger structural components like modals may scale to 8px (rounded-lg) to soften the focal point of the UI.

## Components

### Confidence Gauge
A signature component for Aegis. It consists of a circular progress indicator with a 4px stroke width. The stroke color shifts based on value: Tertiary (0-40%), Primary (41-80%), and Secondary (81-100%). The center contains a `headline-sm` numeral representing the percentage, rendered in JetBrains Mono to emphasize its calculated nature.

### Buttons
Primary buttons use a solid Primary Blue fill with white text. Secondary buttons use a transparent background with a 1px border of the Primary Blue. All buttons must have a height of 32px or 40px, never exceeding 40px to maintain data density.

### Data Tables
Rows are separated by 1px Slate-800 borders. The header row uses `label-caps` for titles. Data cells containing forensic evidence must use `data-md` (JetBrains Mono).

### Input Fields
Fields use the Level 2 surface color with a 1px Slate-700 border. Focus states are indicated by a 1px Primary Blue border and a subtle outer glow of the same color (3px blur).

### Aegis-generated Insights
Insights are housed in Level 2 containers with a 2px left-accent border in Primary Blue. This distinguishes platform intelligence from raw user-inputted data.