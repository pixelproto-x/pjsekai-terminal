# Player Hub functional refactor

## Goal
Move the site from a large page script with feature-specific globals into independent, testable feature modules. Keep the public site usable without an account. Authentication is optional for cloud sync, saved settings, and sharing—not a prerequisite for public game data.

## Product rules
- Preserve current user-facing capabilities until replacements pass regression checks.
- Public lookups must work without signing in wherever the upstream source permits.
- Never claim a field is available until a source actually returns it.
- Every source adapter declares region, capabilities, freshness, attribution, and failure behavior.
- Keep secrets and privileged credentials off the static client. Do not bypass upstream access controls or retrieve private account data.
- Expose loading, empty, partial-data, stale-data, unsupported-region, rate-limit, and outage states.
- Share API, cache, validation, and formatting logic across features.
- A failure in one tool must not disable unrelated tools.

## Target architecture
- src/core: errors, HTTP, cache, validation, shared state primitives.
- src/data: source adapters, registry, normalizers, freshness metadata.
- src/domain: player, cards, songs, charts, events, teams, My SEKAI models.
- src/features: player lookup, collection, records, team builder, planners, practice.
- src/ui: shared components, routing, dialogs, notifications.
- src/app: bootstrap and feature registration.
- tests: core, data adapters, feature behavior, and regression coverage.

The current root-level scripts remain the compatibility layer during migration. New modules must not silently shadow legacy behavior.

## Workstreams
### 1. Player UID lookup — first priority
- Normalize and validate a public UID.
- Resolve sources by region and explicitly report coverage.
- Fetch public profile and supported public records through adapters.
- Normalize source-specific responses into one stable player model.
- Return partial results when optional endpoints fail, identifying unavailable sections.
- Cache public results with source-aware TTLs and timestamps.
- Add shareable profile URLs and export only data actually returned.
- Do not require login for public lookup. Cloud saves remain optional.

### 2. Shared game-data layer
Centralize songs, charts/difficulties, cards, characters, events, costumes, and asset metadata. Version datasets, validate generated JSON, and expose normalized models to search, profiles, team tools, and planners. Record source, region, retrieval time, and dataset version.

### 3. Feature rebuilds
Player profile, collection, play records, AP/FC progress, rankings, team builder, event scoring, event tier and crystal planning, song/chart search, chart analysis, practice tools, My SEKAI planner, costume/card/character/story indexes, sharing, local saves, optional sync, and import/export.

### 4. Reliability and security
Add request timeouts, cancellation, safe retry policy, rate-limit handling, escaped user content, admin authorization/RLS review, and graceful operation when optional services are not configured. Add unit, adapter-contract, smoke, and browser regression tests.

## Migration sequence
1. Establish shared core contracts and tests (this branch).
2. Complete the page, script, action, and data-source inventory.
3. Build the public UID lookup vertical slice end-to-end.
4. Move shared game data behind normalized repositories.
5. Rebuild feature groups and compare old/new results.
6. Replace legacy global wiring only after dependent features migrate.
7. Run full regression and mobile/browser checks before release.

## Status
- [x] Shared core: UID normalization, provider registry, HTTP JSON helper, versioned TTL cache.
- [x] Unit tests for shared core.
- [ ] Complete script/page/action inventory.
- [ ] Verify public UID sources and regional coverage.
- [ ] Implement a real UID source adapter and end-to-end lookup.
- [ ] Migrate legacy features to shared data services.
- [ ] Remove legacy globals after migration and regression coverage.
