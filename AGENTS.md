<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the Tier measurement experience in the index route, with reusable sidebar and chart components; the requested first screen must be directly accessible at `/`.
- Keep simulation data browser-local and explicitly demonstrative; no backend is required for the requested dummy-data interactions.
- Define all dashboard colors and component treatments in the global design system so charts, navigation, and controls remain visually consistent.
- Non-index pages wrap content in the shared AppShell (sidebar + header + notice) so navigation stays consistent.
- Holdings, formation drafts, saved and shared formations live in browser localStorage via the useLocal hook; share links encode formations in a base64url `?d=` param on /share.

- Preserve existing browser storage keys across rebrands so holdings and formations remain available.
- Normalize squad troop types centrally, defaulting legacy squads to 足軽; use the same field for editor, previews, shares and simulation to preserve round trips.
- Use the shared SearchSelect for general and tactic pickers so partial-name search and disabled-option restrictions stay consistent.
- Troop matchup multipliers in the demonstrative simulator are +15% for advantageous attacks and -15% for disadvantaged attacks; keep this assumption centralized until official values are provided.
- 荷駄崩し is simulated separately at maximum tactic level (128% damage and 50% recovery reduction), avoiding the generic recovery heuristic for its debuff text.
