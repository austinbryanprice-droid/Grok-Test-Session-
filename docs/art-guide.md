# Marchfield art guide

Painterly stylized realism for a browser RTS. Real proportions and materials, painted like a bright history-book illustration. Readability comes first, then beauty, then realism. Do not copy another game's assets, UI, or logos.

## Color

Environment colors stay soft. Saturation 25–55%, never above 60%.

| Role | Hex |
| --- | --- |
| Grass | `#7E9A4B` |
| Sunlit grass | `#9DB35E` |
| Dark grass | `#5F7A3A` |
| Dry field | `#B7A660` |
| Dirt path | `#A88B62` |
| Soil | `#6E5338` |
| Sand | `#D8C49A` |
| Light rock | `#B8AE9C` |
| Dark rock | `#7D7466` |
| Wood | `#7A5A3C` |
| Weathered wood | `#A08566` |
| Thatch | `#B89A5E` |
| Clay tile | `#A5533B` |
| Slate | `#5E6670` |
| Plaster | `#E7DCC6` |
| Stone | `#C2B59D` |
| Deep water | `#2F5F73` |
| Shallow water | `#5FA6A0` |
| Temperate leaves | `#5E7F3A` to `#87A548` |
| Pine | `#3F5E3A` |

Team colors are the only pure, saturated colors. Saturation 70–90%, value 75–95%.

| Team | Hex |
| --- | --- |
| Blue | `#2F6FE0` |
| Red | `#D8312B` |
| Yellow | `#F2C230` |
| Green | `#3FAF3F` |
| Purple | `#8A44C8` |
| Orange | `#F07F1E` |
| Teal | `#2BB5B5` |
| Pink | `#E35DA4` |

Green must stay brighter and bluer than grass. Gold is `#E8B830`. Fire is `#FFD27A` at the core and `#FF6A1E` at the edge. Own selection is `#6CFF6C`. Enemy selection is `#FF4A4A`.

## Painterly albedo

Start from the flat palette color. Block in three or four large value steps: light, mid, dark, accent. Keep transitions soft and brush-like. Paint lighter, warmer edges on top corners. Bake cavity shading at about 30–50% strength. Tall surfaces get a top-to-bottom gradient, at most 15% darker at the base. Shift hue (yellow-green against blue-green, orange-brown against gray-brown) instead of adding noise.

Do not ship a raw photo or photogrammetry scan. If a photo is the start, blur away anything smaller than about 2–4 pixels at final size, cut the micro-contrast by 50–70%, and paint the steps above over it. Light wear on edges only. No grime, rust streaks, or decay. Shrunk to 25%, the texture must still read as clean shapes.

Normal maps carry medium forms only: stones, planks, tiles, folds. Intensity about 0.5–0.8 of a default map. No pores or scratches.

Most surfaces are matte, roughness 0.65–0.95. Steel is metallic 0.8–1.0 and roughness 0.30–0.50, with clean bevel highlights. Gold is `#D9A93A`, metallic 1, roughness 0.3. Water roughness is 0.05–0.15. Roughness changes in large painted shapes, not noise.

## Texel density

Buildings: about 100–200 pixels per meter. 1024 for a large building, 512 for a small one. Share one trim sheet per culture. Units: one 256 or 512 atlas, or one 1024–2048 atlas for a whole faction. Terrain layers: 512 or 1024, tiling every 2–4 meters, plus a macro color texture with patches 20–80 meters across (±10–15% value, ±5–10° hue).

Pack roughness, metal, ambient occlusion, and the team mask into one texture: R = AO, G = roughness, B = metal, A = team mask. Normals only where the form needs them. Units can skip normals. Ship KTX2/Basis (UASTC for normals, ETC1S for albedo and masks). Mipmaps on. Anisotropic filtering 4x–8x. No negative mip bias.

Team mask covers 20–35% of a unit (tabard, cloak, shield, plume, caparison) and 5–15% of a building (flag, awning, painted trim). Flags must read at max zoom. In the shader, `mix(albedo, luma(albedo) * teamColor * 1.2, mask)` keeps the painted shading inside the dyed area.

## Scale

People are about 1.2–1.4× real size next to buildings. This sample uses a 2.2 m person and doors about 2.86 m. Heads and hands are 1.1–1.15×. Weapons are 1.3–1.6×. Arrows in flight are 2–3×. Animals match the people at 1.2–1.3×. Trees stay at 0.8–1.0× real height so forests do not hide the field.

## Units

About 7 heads tall, slightly heroic. Infantry 1,000–3,000 triangles, cavalry 3,000–6,000, two or three LODs (100%, 50%, 20%), at most 30–40 bones. Crowds use instancing and vertex-animation textures, not one skinned draw per soldier.

Each type needs its own silhouette: spear is a long vertical, archer is bow and quiver, knight is helmet, lance, and horse, worker is a tool. No tiny buckles or straps under about 5 cm. No fine fabric patterns. Faces are simple paint. Workers get 4–8 variations. Soldiers of one type stay uniform aside from a slight tint.

## Buildings

Small buildings 1,500–5,000 triangles, large ones 5,000–15,000, landmarks up to 30,000–40,000, three LODs. Bevel hard edges, or bake the bevel into the normal. Merge crates, flowers, and banners into the building mesh. Roofs, eaves, beams, doors, and windows stay chunky. A barracks shows a yard and racks, a lumber camp shows logs, a mill shows a wheel. The place looks kept and prosperous. Flowers and clutter never block the door or the footprint.
