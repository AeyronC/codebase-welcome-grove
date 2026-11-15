<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Survival simulation rules live in pure functions in src/game/sim.ts (tested in sim.test.ts); UI only calls tick/act so balance stays testable.
- Audio rules (volumes, alert priority/cooldowns, music mood, ambience) live in pure functions in src/game/audioRules.ts (tested in audioRules.test.ts); src/game/sound.ts only synthesizes, so audio behaviour stays testable and no audio files are needed.
- Phone layout is chosen by the media queries in src/hooks/use-compact.ts; on compact screens management panels render as the shared SHEET bottom sheet sized from the measured --hud-top, so panels never overlap the status bar.
- Camera zoom rules (limits, wheel/pinch/button steps, never past map edge) live in pure functions in src/game/zoom.ts (tested in zoom.test.ts); GameCanvas only reads the shared zoom multiplier ref, so HUD buttons and gestures stay in sync.
