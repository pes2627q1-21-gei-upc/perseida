# Google "G" (Sign in with Google)

`google-g.png`, `google-g@2x.png` and `google-g@3x.png` are the official **icon button** assets (theme Light, no text, circle, Android + Web) from Google's _Sign in with Google_ branding bundle, copied **without any change**:

- Source: https://developers.google.com/static/identity/images/signin-assets.zip (linked from https://developers.google.com/identity/branding-guidelines).
- Paths in the bundle: `Android + Web/PNG @1x|@2x|@3x/Light/Theme=Light, Show text=No, Shape=Pill, Platform=Android+Web[@2x|@3x].png`.
- Size: 40, 80 and 120 px (1x, 2x, 3x). Verified byte for byte (SHA-256) against the bundle on 2026-10-21.

Google's rules: use the standard colour "G" on a white background, never redraw, recolour or stretch it, and use only the current logo (the previous four-colour "G" is outdated). If Google publishes a new bundle, replace the three files with its icon button and keep the names.

Used by `src/features/auth/components/GoogleLogo.tsx`.
