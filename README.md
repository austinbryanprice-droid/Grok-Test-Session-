# Werewolf lookdev

One original character in a small browser court, for visual testing. The scene is `npm run dev`.

The visible character is a generated mesh of a crouched digitigrade werewolf: long muzzle, pointed ears, amber irises, and a dark mane. `public/werewolf.glb` is loaded at startup and mounted so its measured front lies on local −z. The signed-distance field remains as the crouch tests. A verlet solver moves the banner strips.

This is not a MakeHuman base and not a Quaternius retarget. Those are humanoid. The mesh is generated from a cleaned plate of the reference pose. The source still is not in the repo.

## Run

```
npm install
npm run dev
```

Open the printed local URL. Drag to orbit. The overlay shows fps, CPU submit time, GPU time when timestamp queries are available, and draw calls.

Lighting is a cool key, a cool fill, and a dim hall. Bloom is taken from the emissive buffer. Anti-aliasing is MSAA, then a light sharpen.

If the GPU line names Intel UHD or Iris, Windows Graphics settings can pin the browser to the high-performance GPU.
