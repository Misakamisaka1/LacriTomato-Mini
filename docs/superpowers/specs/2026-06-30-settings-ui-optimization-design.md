# Settings UI Optimization Design

## Goal

Improve the settings window so it feels like a compact desktop app settings surface instead of a long web form.

## Current Problems

- The chat settings section is a single vertical form, so important controls fall below the first viewport.
- Destructive actions such as clearing memory and history sit in the same visual flow as normal fields.
- The page lacks grouping, making it hard to scan which controls affect prompts, memory, proactive topics, or global saving.
- The sidebar and content use a working dark theme, but spacing and hierarchy are too flat.

## Design

Use a compact grouped settings layout:

- Keep the left sidebar and existing section navigation.
- Wrap each active section in a `settings-page` container with a header, short description, and a consistent action area.
- Use `settings-card` groups for related controls.
- Use a responsive two-column grid for sections that have enough controls, especially chat.
- In chat settings:
  - Left card: personality, prompt template, custom prompt, history limit.
  - Right card: memory toggle, memory textarea, memory actions.
  - Bottom card: proactive topic toggle and interval inputs.
- Keep the primary "保存" action visually distinct and place it in a sticky footer row inside the content area.
- Style danger actions as quiet outline buttons rather than primary buttons.

## Constraints

- Do not redesign plugin, model, screenshot, OCR, translator, or pet settings behavior.
- Do not add new settings fields.
- Keep existing accessible labels so current tests and keyboard usage remain valid.
- Use CSS-only layout refinements where possible.

## Acceptance Criteria

- The chat page shows grouped cards for prompt, memory, and proactive topic controls.
- The settings content has a clear header and sticky save row.
- Existing settings tests still pass.
- New tests assert the grouped chat layout exists.
- Typecheck, tests, and build pass.
