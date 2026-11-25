# 3D model credits

Models are bundled under `client/public/models/` and served locally — no CDN requests.

| File | Model | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `AntiqueCamera.glb` | Antique Camera | Microsoft | CC-BY 4.0 | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/AntiqueCamera |
| `AntiqueGramophone.glb` | Antique Gramophone | Pallav | Own work | — |
| `HumanHeart.glb` | Realistic Human Heart | Pallav | Own work | — |
| `DNAStrand.glb` | DNA Strand | Pallav | Own work | — |
| `IndominusRex.glb` | Indominus rex (Blend #81342) | Pablo Lara (model, texture), Mauricio Vega (rig) | CC-BY-SA 3.0, fan art — non-commercial | https://blendswap.com/blend/81342 |
| `Fox.glb` | Fox | PixelMannen | CC-BY 4.0 | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox |

`AntiqueCamera.glb` was optimised with gltf-transform: textures resized to 1024 px and
re-encoded as WebP (17.5 MB → 1.26 MB).

`IndominusRex.glb` was exported from `indominus_rex.blend` (Blender 5.2) after removing
rig-control meshes, billboard planes and the armature. The original 2015 Cycles materials
do not survive glTF export directly, so each material was rebuilt as a Principled BSDF
with the original packed diffuse texture (skin, teeth, eyes, crest, feathers) wired to
Base Color. Meshes were then simplified to 25% and the result is 2.05 MB. The CC-BY-SA
licence requires derivatives (including this glb) to stay CC-BY-SA and non-commercial;
fine for this coursework demo.
