# Minimal Player Hub

## Current scope
The website intentionally keeps only:
- The sixth-anniversary visual shell and responsive layout.
- Home page with Taiwan public player UID lookup entry.
- Dedicated public player lookup page backed by Hi Sekai.
- Appearance settings: six SEKAI themes and glass opacity.

## Removed from the active product
All previous feature pages and their scripts/assets have been removed from the repository: song/Dojo, card and character catalogues, event calculators, chart analysis, old My SEKAI local editors, admin dashboard, Sonolus runtime, story/resource tools, and legacy data import/export/share flows.

## Product and data rules
- Public lookup does not require a login.
- Never claim a field is available until the source returns it.
- Show source, region, timestamp, loading, empty, and failure states.
- Never collect game passwords or private account credentials.
- Preserve the anniversary UI while rebuilding future features as separate, tested vertical slices.
