# Look comparison

Side-by-side frames are `{shot}-side.png` (reference on the left, render on the right). Earlier passes are in `pass1/` through `pass4/`.

Pixel checks use an 8×4 downsample, not a visual impression from the shaders.

## What changed after looking

- Pass 1 was gray and, in the vista, nearly black. Structure shaders failed to compile, so cottages did not draw. The lake basin was only a few centimeters deep.
- Pass 2 opened the basin, compiled the chamfered materials, and still crushed shadows to black.
- Later passes moved tone mapping into the output pass, widened the sun glow, lifted the darkest shadows with a cool bias, and aimed the fixed cameras at the cottages, the timber wall, and the lake.

## Closest three gaps that remain

1. Bright sky is warm cream (about #dccfc2) where the village and roof references are saturated amber (about #e6c18b to #f2c27e). The sun color is in the light, but the grade does not push the sky that far.
2. The timber close-up now has light and dark faces, and it is redder (about #8d4927) than the reference oak (about #a77a4e fading to #4c3e32).
3. The forest frame is a bright haze with a few trunks. The reference is a denser olive canopy and cooler shade, with the shafts reading as beams rather than a general glow.

Lake water in the lower frame sits near #4f6a72, which is the requested depth tint. The HUD frame includes the parchment vitals and the eight-slot hotbar.

## Frame time

On this machine’s software renderer, the in-page counter reported about 24 fps for the ultra village shot. A second requestAnimationFrame sampler in the capture script stalled near 1 fps, so it is not a laptop-GPU measurement. Low, Balanced, and Ultra still change shadows, foliage, bloom, shafts, reflections, and pixel ratio.
