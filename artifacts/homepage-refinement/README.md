# Homepage refinement

## Design read

Preserve and refine a warm, local shopping homepage. Keep the green and gold identity, Manrope typography, map backdrop, photo showcase, navigation, routes, and metadata. Native CSS extends the existing design system. DESIGN_VARIANCE: 5; MOTION_INTENSITY: 6 (existing showcase, no added continuous motion); VISUAL_DENSITY: 4.

## Audit and changes

- The hero badge inherited a general paragraph font and margin. Excluding the badge from that rule restores its compact dimensions; mobile height measures 23.4px, previously 44px.
- Removed the duplicate location field from hero search. The date picker now has a styled listbox with keyboard navigation, type-ahead, Escape, outside dismissal, and viewport-aware placement. Search retains the existing `date` query parameter.
- Increased mobile top padding and balanced the image-strip height so the hero content sits lower while its search remains visible.
- Homepage cards inherited the search directory's horizontal columns while a media aspect ratio expanded the image across the body. Scoped homepage layouts now constrain media and reserve space for titles, schedules, and actions. Missing photos receive a labeled fallback.
- Removed the old white heading color on the light trust section. Its heading now measures 11.75:1 contrast. Shorter copy describes address release times without implementation terminology.

## Verification

- Local browser: desktop 1440px, mobile 390px, and narrow 375px layouts; no horizontal page overflow or photo/body intersection.
- Confirmed keyboard selection submits `/search?date=weekend`; Escape and clicking outside dismiss the picker.
- Confirmed the date menu fits within a 375x667 viewport.
- Visually reviewed the hero, cards, sale-type sections, journey, and trust section.
- TypeScript, scoped ESLint, architecture checks, and seven relevant listing unit tests passed.

The existing light-first brand and motion preferences remain in place. No deployment or production-data changes were made.
