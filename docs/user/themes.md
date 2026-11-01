# Custom themes

Mirlo can restyle the player with a preset palette or with your own CSS.
Both live in **Settings → Custom theme**. The plugin ships enabled but does
nothing until you pick a palette or write CSS, and changes apply with the
**Reload player** button.

## Palettes

| Palette | Look |
| --- | --- |
| `native` | YouTube Music's own colors (default, no overrides) |
| `midnight` | dark blue-black surfaces |
| `amoled` | pure black, for OLED screens |
| `warm` | brown-black surfaces |
| `forest` | green-black surfaces |

Presets assume YouTube Music is using its **dark** theme. They only set CSS
variables the player already defines, so they survive most YouTube updates.
A preset also removes the per-track hero image/gradient at the top of the
page (the one whose colors follow the current song) and its visible seam
against the page background; `native` leaves that behavior untouched.

## Your own CSS

The *Custom CSS* box takes any CSS and applies it **after** the palette, so
your rules win on equal specificity. The reliable way to theme is to override
the same variables the palettes use:

```css
:root {
  --yt-spec-base-background: #101014 !important;
  --yt-spec-raised-background: #191922 !important;
  --yt-spec-menu-background: #191922 !important;
  --yt-spec-text-primary: #f2f2f7 !important;
}
```

Useful variables (all defined by YouTube Music):

`--yt-spec-base-background`, `--yt-spec-raised-background`,
`--yt-spec-menu-background`, `--yt-spec-general-background-a/b/c`,
`--yt-spec-black-1..4`, `--yt-spec-text-primary`, `--yt-spec-text-secondary`,
`--ytmusic-color-black1..4`, `--ytmusic-background`.

Rules that target page elements are less stable: YouTube changes its class
names, so those themes can break after an update.

## Sharing and limits

- A theme is just text: copy the *Custom CSS* content to share it.
- `@import` and remote `url(...)` are removed before the CSS is applied, so a
  pasted theme cannot pull remote files. That filter is best effort, not a
  sanitizer: read themes you copy from strangers.
- The *album color* plugin (per-track gradient) is suppressed while a
  non-native palette is active: its inline colors are removed and it stops
  reapplying. Switch back to `native` to let it run again.
- A palette is one setting for the whole player; per-page themes are not
  supported.
