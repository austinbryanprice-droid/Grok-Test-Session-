# Werewolf lookdev

One original character in a small browser court, for visual testing. The scene is `npm run dev`.

The character is a crouched digitigrade werewolf: long muzzle, pointed ears, amber irises, and a short dark mane. It is sculpted in code from a signed-distance field and meshed at load. Claws, teeth, ears, and banner strips are separate meshes. A verlet solver moves the mane tips and the banners. The body is one skinned mesh and the only character shadow caster.

This is not a MakeHuman base and not a Quaternius retarget. Those are humanoid. Putting a human run cycle on this muzzle, hock, and paw would break the silhouette the reference asks for. The body, fur, claws, and court are original. No downloaded character mesh is in the repo.

Code-built models stop at strong stylized-indie quality. Fine facial pores and a groomed hair system need a hand sculpt.

## Run

```
npm install
npm run dev
```

Open the printed local URL. Drag to orbit. The overlay shows fps, CPU submit time, GPU time when timestamp queries are available, and draw calls.

Lighting is a fixed warm sun plus a cool fill. Fog starts at 30 m. Bloom is taken from the emissive buffer, so it hits the brazier and not sunlit marble. Anti-aliasing is MSAA, then a light sharpen.

If the GPU line names Intel UHD or Iris, Windows Graphics settings can pin the browser to the high-performance GPU.
