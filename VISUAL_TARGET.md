# Visual target

The look to match is Age of Empires IV with every graphics option at its highest setting, after the Season Five renderer (15 June 2023, build 7.0.5861). This scene is an original temperate riverside settlement in late-afternoon sun. It does not copy Age of Empires meshes, textures, or interface, and it does not add game systems.

## Highest settings

Image Quality **Low** is a separate minimum-spec renderer. The target is the full renderer:

- Image Quality: High
- Lighting Quality: High
- Texture Detail: High
- Geometry Detail: High, including trees and shrubs when zoomed out
- Shadow Quality: High
- Animation Quality: High
- Physics: High
- Anti-aliasing: High

## Lighting loop

The sun lights the ground, the sky (atmospheric scattering), and the clouds. Clouds tint the key light and cast soft moving shadows on land and water. Terrain color bounces back into the fill and onto the clouds. Sun angle sets the mood; this scene is late afternoon, with long filtered shadows. Screen-space ambient occlusion darkens crevices and gives forests their volume. Fog desaturates distance. A torch is the local warm light.

Materials are physically based: stone, timber, plaster, tile, and a small metal torch cup, with roughness variation. Wet mud and metal carry a clearer specular. Terrain blends grass, dirt, mud, and rock per pixel, cliffs are real meshes, and the river has depth color, flow, shore foam, and a reflection of the sky and banks.

The image stays readable at an RTS camera. It is detailed and sunlit, closer to a finely made historical miniature than to a path-traced city.

## Acceptance framings

Open the scene and use the keyboard.

- **1 — far.** Rolling ground, a readable forest mass, the river, haze on the far ridge, long stable shadows, warm late-day grade.
- **2 — near.** Stone and wood on the hall, the roof silhouette, crevice occlusion, a contact shadow, and detail that stays put while the camera orbits.

Drag to orbit. The wheel changes distance.
