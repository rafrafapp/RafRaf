---
name: RafRaf
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#444651'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#242b32'
  on-tertiary: '#ffffff'
  tertiary-container: '#3a4148'
  on-tertiary-container: '#a6adb5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#dce3ec'
  tertiary-fixed-dim: '#c0c7d0'
  on-tertiary-fixed: '#151c23'
  on-tertiary-fixed-variant: '#40484f'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-stat:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  margin-side: 16px
  gutter: 12px
  tap-target-min: 48px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style
The design system is engineered for Syrian merchants requiring a robust, enterprise-grade inventory management solution. The brand personality is rooted in reliability, precision, and stability, mirroring the security of a modern banking application. 

The visual style follows a **Modern Corporate** aesthetic with high-density information layouts tailored for professional use. It prioritizes clarity and efficiency through a strict adherence to RTL (Right-to-Left) hierarchy, substantial whitespace to reduce cognitive load during stocktakes, and a disciplined color application that signals trust and institutional authority.

## Colors
The palette is dominated by "Trust Blues." The primary Navy (#1E3A8A) is used for headers and structural branding to establish authority. The Accent Blue (#2563EB) is reserved strictly for interactive elements and primary calls to action. 

Surface colors utilize a very cool, high-brightness blue-grey (#F8FAFF) to distinguish content areas from the pure white background without creating heavy visual breaks. Semantic colors (Red, Amber, Green) are calibrated for high legibility against white backgrounds to ensure stock alerts and financial statuses are immediately recognizable.

## Typography
IBM Plex Sans Arabic is the sole typeface, chosen for its technical precision and exceptional legibility in professional contexts. 

A specific "Display Stat" level is utilized for inventory counts and financial totals, where the numeral is significantly larger and heavier than its accompanying label to allow for rapid scanning of data. All typography is aligned to the right (RTL), with particular attention paid to line heights to accommodate Arabic diacritics without clipping.

## Layout & Spacing
The layout follows a structured 12-column grid for desktop and a single-column fluid flow for mobile. 

**Key Layout Rules:**
- **Side Margins:** A consistent 16px padding on mobile ensures content doesn't bleed into device edges.
- **Rhythm:** A vertical 8px baseline grid maintains alignment between text and icons.
- **RTL Flow:** All layouts mirror horizontally; sidebars appear on the right, and "Back" actions point to the right.
- **Navigation:** A fixed bottom navigation bar is mandatory for mobile views to ensure primary modules (Inventory, Sales, Reports, Profile) are always within thumb reach.

## Elevation & Depth
This design system avoids heavy shadows, opting for a **Tonal Layering** and **Low-Contrast Outline** approach to maintain a clean, "flat" banking feel.

- **Level 0 (Background):** #FFFFFF.
- **Level 1 (Section Containers):** Used for grouping list items, defined by a 1px border (#E2E8F0) rather than a shadow.
- **Level 2 (Modals/Popovers):** Soft, high-diffusion shadows (0px 4px 20px rgba(15, 23, 42, 0.08)) are used only when an element physically sits above the main interface.
- **Separation:** Horizontal dividers (1px, #E2E8F0) are the primary tool for separating list items, reinforcing the systematic, spreadsheet-like clarity required for inventory management.

## Shapes
The shape language is professional and balanced. A base radius of 12px (`rounded-lg`) is applied to primary interactive elements like buttons, input fields, and container blocks. This softens the industrial nature of the data without appearing overly casual or "bubbly." Smaller components like badges use a 4px or 6px radius to maintain a sharp, technical appearance.

## Components

### Buttons & Targets
- **Primary CTA:** Solid #2563EB with white text. Minimum height of 48px to meet ergonomic standards for merchants in fast-paced environments.
- **Secondary:** Ghost style with #2563EB border and text.
- **Touch Areas:** All interactive icons and list items must maintain a 48px minimum hit area, regardless of the visual size of the icon.

### Inventory Lists
- Use row-based lists rather than cards.
- Each row is separated by a 1px #E2E8F0 divider.
- Right-aligned: Item name and SKU. 
- Left-aligned: Quantity/Price (using the Display Stat typographic style).

### Input Fields
- Outlined style using #E2E8F0. 
- On focus, the border transitions to #2563EB with a 2px thickness. 
- Labels are always persistent (not floating) to ensure the user never loses context of the data being entered.

### Status Badges
- Used for "In Stock", "Low Stock", or "Out of Order".
- Background: #EFF6FF (Light Blue) for neutral; semantic tints for others.
- Text: Bold, condensed labels using `label-sm`.

### Fixed Bottom Nav
- Background: #FFFFFF with a top border of 1px #E2E8F0.
- Icons: 24px stroke-based icons. 
- Active State: Primary Blue (#1E3A8A) for both icon and text label.