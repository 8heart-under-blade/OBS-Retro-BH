# Styling your OBS overlay

Use the studio's **CSS** tab. Global CSS applies first, then the selected scene's CSS. Draft CSS changes preview immediately; **Save to OBS** updates live outputs without restarting celestial animation or shared timers.

Your logical design canvas is **1920×1080** regardless of preview size. Keep key text at least 48 px from the edge. Readable titles normally need 56–72 px at Full HD. These are recommendations, not an advanced-CSS position whitelist.

## Stable hooks

| Selector | Element |
|---|---|
| `.scene-root[data-scene="starting"]` | Root for Starting; other values: `brb`, `goodbye` |
| `#captions` | Caption group, positioned independently of artwork |
| `#scene-title` | Title |
| `#scene-subtitle` | Optional subtitle |
| `#scene-timer` | Timer group |
| `#timer-label`, `#timer-value` | Timer label and digits/completion message |
| `#scene-clock`, `#scene-date` | Optional clock/date |
| `#scene-announcement` | Optional announcement |
| `#scene-social` | Optional social/short link text |
| `#scene-next-stream` | Optional next-stream message |
| `#module-rail`, `#time-rail` | Default timer and clock/date positioning groups |
| `.module` | Enabled/disabled module containers |

Basic visibility controls set the `hidden` attribute. Enable a module in Content before styling it. Empty/disabled content is not invented automatically by CSS.

## Variables

Set these on `:root` in your stylesheet to override the basic-control defaults:

```css
:root {
  --ink: #d9dac0;
  --muted: #a0a58e;
  --title-size: 64px;
  --title-width: 1100px;
  --module-size: 56px;
  --font-title: Jost, Arial, sans-serif;
  --font-body: Jost, Arial, sans-serif;
  --caption-x: 960px;
  --caption-y: 950px;
  --caption-transform: translate(-50%, -100%);
  --align: center;
}
```

`--caption-x/y` locate the caption anchor within the Full HD canvas. The transform determines which edge is anchored. Basic presets change those variables; advanced CSS loads afterward and may override them.

Fonts bundled offline: **Jost** normal, variable weight 100–900; **Spectral** normal, weight 400. Their OFL files live under `public/fonts/`. The Plate theme sets its title font on the root; to override it explicitly, style `#scene-title { font-family: ... }` rather than relying only on inherited font variables.

## Example: quiet planetarium title with a lower-left timer

```css
#scene-title {
  font-family: Jost, sans-serif;
  font-size: 68px;
  font-weight: 400;
  letter-spacing: .015em;
  line-height: 1.08;
}
#scene-subtitle {
  font-size: 24px;
  color: var(--muted);
}
#module-rail {
  left: 115px;
  right: auto;
  bottom: 130px;
  width: 320px;
  text-align: left;
}
#timer-value {
  font-size: 52px;
  font-variant-numeric: tabular-nums;
}
```

Check that a timer placed here does not collide with your chosen caption anchor. The preview reports box overlaps and safe-area overflow; it does not change/hide your text automatically.

## Example: scene-specific global styling

```css
.scene-root[data-scene="goodbye"] #scene-title {
  font-family: Spectral, Georgia, serif;
  letter-spacing: -.015em;
}
.scene-root[data-scene="brb"] #scene-timer {
  color: var(--muted);
}
```

Do not write `[data-scene="starting|brb|goodbye"]`; that is a literal attribute value, not a selector alternative.

## Safety and limits

CSS is applied as stylesheet text, not as HTML. No custom JavaScript or arbitrary HTML is accepted. It runs in a distinct overlay document, so selectors cannot reach the canvas or configuration controls. This isolation is a document boundary—not a regex pretending to sanitize all CSS.

CSP blocks external network resources, remote fonts, imports and scripts. Local bundled fonts/resources are available. Do not paste Google Fonts `@import` snippets; choose bundled fonts instead. A stylesheet may intentionally move or hide its own overlay content, but warnings flag enabled text that becomes hidden or leaves the safe area. The configuration page stays usable for recovery.

Up to 32,768 characters per global/per-scene stylesheet; full JSON imports/requests are limited to 256 KB. Invalid CSS declarations may simply be ignored by the browser; use the preview and Reset/Reload controls. Basic-control changes cannot override a more specific advanced stylesheet until you edit/remove its rule.

## Prompt for an AI

> Write CSS only for a 1920×1080 OBS text overlay. Theme: restrained 1970s astronomical print, warm ivory on near-black, ink-stipple celestial artwork. Use locally bundled Jost or Spectral. The canvas and controls live outside the overlay and must remain untouched. Style the documented selectors/variables above; no HTML/JavaScript, remote URLs, HUDs, panels, telemetry or flashing/audio-reactive text. Use readable titles, optional tabular timer digits, natural wrapping, and preserve enabled user text. Specify the scene for any scene-specific rule. Return a complete stylesheet I can paste into the CSS tab.
