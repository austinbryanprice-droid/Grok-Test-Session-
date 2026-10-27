# Asset pipeline

The playable sample generates meshes and painterly textures in the browser, so the first load is the JavaScript bundle and stays inside the 20–30 MB budget. Authored assets use the same budgets and this export path.

## Blender glTF

- Format: glTF 2.0, binary `.glb` when you only need the runtime file. For the pack step below, export glTF Separate so textures stay external.
- Include: UVs, normals, vertex colors, and the team-mask vertex group or vertex color if the mask is not a texture.
- Apply modifiers. Forward axis +Y, up axis +Z (glTF).
- Apply transforms so the object origin sits on the ground contact and the figure faces +Z.
- Do not export cameras, lights, or the Blender lightmap. AO is already in the albedo or the packed mask texture.

## Geometry compression

[gltfpack](https://github.com/zeux/meshoptimizer) with meshopt, normal quantization, and simplification inputs ready for LODs:

```bash
gltfpack -i Source.gltf -o Building.glb -cc -kn -si 1 -sa -mi
```

`-cc` compresses with meshopt. `-kn` keeps the nodes. `-si 1` simplifies less than the default so LOD0 stays crisp. Build LOD1 and LOD2 by raising the simplify ratio (`-si 0.5`, `-si 0.2`) into separate files. `-sa` simplifies aggressively only when you pass a lower `-si`. `-mi` uses mesh instancing for repeated parts.

## Textures

[KTX-Software `toktx`](https://github.com/KhronosGroup/KTX-Software) with Basis Universal. Mipmaps on. Albedo, roughness, and masks use ETC1S. Normals use UASTC.

```bash
toktx --genmipmap --encode etc1s --clevel 2 --qlevel 128 Building_albedo.ktx2 Building_albedo.png
toktx --genmipmap --encode etc1s --clevel 2 --qlevel 128 Building_mask.ktx2 Building_mask.png
toktx --genmipmap --encode uastc --uastc_quality 2 Building_normal.ktx2 Building_normal.png
```

Assign sRGB to albedo only. Leave normal, roughness, AO, and mask textures linear. The runtime loads them with `GLTFLoader`, `MeshoptDecoder`, and `KTX2Loader.detectSupport(renderer)`.

## Runtime budgets

Medium target: under 200 draw calls, under 500k triangles, 2048 shadow map, pixel ratio capped at 1.5. See `src/rts/quality.ts` for Low, Medium, High, and Ultra. Presets never change the palette or the team colors.
