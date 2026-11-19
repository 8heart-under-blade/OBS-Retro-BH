# Production design decision — first direction

## Consultation

Two OpenCode free models produced independent concepts and then each cross-critiqued the other using the user's expanded requirements (Full HD, live configuration, optional timers/date/announcements and user/AI-authored CSS). All four tasks were read-only.

- **Beam Free — Meridian Plate:** quiet Jost-based geometric planetarium typography; scene-specific negative-space placement, no old chrome. Original 20–34 px titles were too small.
- **DeepSeek V4.1 Flash Free — Plate Caption:** Spectral/Archivo editorial astronomy-plate typography, 60–66 px titles and a caption/module hierarchy. Original fixed lower-left treatment was too close to the POC; default scrim and auto-hidden subtitle were rejected.

During reciprocal review, both conceded their undersizing/placement problems, rejected default scrims and silently hiding user text, and agreed on static type, no HUD/telemetry/branding, measured overflow and a separate configuration surface. They **did not reach unanimity on font or placement**: Beam retained geometric type and scene-specific positions; DeepSeek retained serif captions and a consistent two-column module rail.

## Parent recommendation

Use **Meridian** (restrained geometric title card) as the primary direction, borrowing the editorial proposal's clear module hierarchy and readable sizing—not its serif default, old lower-left block or dark scrim. Provide a secondary editorial theme through the same CSS contract rather than hard-coding typography into the renderer.

- Locally bundled Jost, weight 400, primary status title around **64 px at 1080p**, adjustable by the operator.
- Optional subtitle around 24 px; primary countdown around 48–60 px; elapsed-break timer around 44 px; clock/date/supporting text 18–22 px where appropriate.
- Warm ivory on existing near-black. No headers, footers, fake telemetry, numbering, rules, pills, borders or panels in output.
- No moving/audio-reactive typography. Optional short opacity entry only; instant under reduced motion.
- Default placements must be verified over all three accepted animated compositions, not only a still. Start from a clean lower-center titlecard for Starting/Goodbye and a negative-space side preset for BRB; keep optional timer/announcement modules in a distinct lane. These are initial design parameters, **not a claim that layouts are visually verified yet**.
- Never move/hide planets or alter the orbital/black-hole model to protect a text caption. Keep the artwork and typography independent.
- Long text wraps. Report measured overflow in preview. Never silently hide a subtitle or shrink a title based solely on character count.
- Advanced CSS may replace the default layout, fonts and styling; safe zones are warnings, not a position whitelist.

The first production UI/output implementation now uses this direction: 64 px Jost status titles, a 24 px optional subtitle, clean lower-center captions for Starting/Goodbye, a side-caption preset for BRB, and independent optional timer/clock lanes. Plate/Spectral remains a selectable secondary theme. Root styling and every module can be changed through the editor or advanced CSS. Browser tests verify actual visible default title bounds, loaded fonts, clean outputs and isolated live CSS; final aesthetic/OBS review is still the user's.

## Font licensing research

The official Google Fonts repository contains SIL Open Font License 1.1 files for Jost and Spectral:

- https://github.com/google/fonts/blob/main/ofl/jost/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/spectral/OFL.txt

Jost Variable and Spectral Regular are now bundled under public/fonts/, with their actual OFL files retained. OBS does not need runtime Google Fonts requests.
