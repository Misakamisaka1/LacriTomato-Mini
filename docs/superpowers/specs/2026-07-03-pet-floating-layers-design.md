# Pet Floating Layers Design

## Goal

Remove pet UI jitter caused by resizing the main transparent pet window when bubbles or menus appear, while keeping the pet's configured size adjustable.

## Current Problem

The renderer currently measures pet bubble and menu content, calculates a larger content size, and asks the main process to resize the pet `BrowserWindow`. This makes the native window bounds change when a bubble is shown, a menu opens, a menu flips to the side, or bubble text wraps. Because the pet body is anchored inside that changing rectangle, the pet and menu can visibly jitter.

## Decision

Keep the main pet window dedicated to the pet sprite and make it stable. The main window may resize when the user changes `config.pet.defaultHeight`, because that is a deliberate pet size change. Bubbles and menus should no longer change the main pet window size.

Bubbles and menus will be rendered in separate transparent, frameless, always-on-top overlay windows positioned relative to the pet window bounds. They should visually appear attached to the pet but be native-window independent from the pet body. Closing a bubble or menu closes or hides only its overlay.

## Window Model

- Main pet window: contains only the pet body, drag/hover behavior, and context-menu trigger. Its size is derived from `config.pet.defaultHeight` and the sprite aspect ratio.
- Bubble layer window: transparent frameless window sized to the bubble content, placed above the pet center with an edge clamp inside the current display work area.
- Menu layer window: transparent frameless window sized to menu content, placed above the pet when there is room, otherwise on the left or right edge side.

## Behavior

- Pet size remains adjustable through existing pet config.
- Changing pet height resizes the main pet window once to the sprite dimensions and keeps the bottom-center anchor stable.
- Showing, updating, or hiding a bubble does not resize the main pet window.
- Opening or closing the menu does not resize the main pet window.
- Moving the pet moves visible bubble and menu overlays with it.
- Plugin menu actions still work through the existing plugin invocation flow.

## Testing

Tests should prove the main pet renderer no longer calls `resizeToContent` for bubble/menu layout, except for deliberate pet-size sync. Main-process tests should cover fixed pet-size resizing and overlay position calculations.
