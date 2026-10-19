# Site photos

`menu/` holds one 800×600 WebP per dish and drink, named by the slug in `js/menu-data.js`
(for example `steak-frites.webp`). `site/` holds the hero (`hero.webp`, 1920 px wide), the three
About-section photos (1200 px wide) and `og.jpg`, the preview image used by social networks.

All photos were generated in October 2026 with Wan 2.7 Image (standard tier, 2K, 4:3) in one
house style, so a new dish photo should use the same wording to stay consistent:

```
Professional editorial food photograph. <the dish, described in one or two sentences>.
Plated on fine white porcelain on a dark walnut table with a cream linen napkin and brass cutlery,
shot at a 45-degree angle, soft directional window light from the left, warm shadows, shallow depth
of field, rich natural colours. Photorealistic editorial food photography for an upscale French
brasserie. No people, no text, no logo, no watermark.
```

For drinks, replace the plating sentence with: "Set on a dark walnut brasserie table beside a cream
linen napkin, soft directional window light from the left, warm shadows, shallow depth of field,
rich natural colours. Photorealistic editorial beverage photography for an upscale French brasserie.
No people, no text, no labels, no logo, no watermark."

Convert the result with `cwebp -q 80 -resize 800 0 photo.png -o menu/<slug>.webp`, add the slug to
`js/menu-data.js`, and (for an existing database row) set the dish's `photo_url` to
`images/menu/<slug>.webp` in the team app or with SQL.
