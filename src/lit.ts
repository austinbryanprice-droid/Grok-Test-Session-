import { Material, MeshStandardMaterial, MeshStandardMaterialParameters } from 'three';

type Hook = (material: MeshStandardMaterial) => void;

const entries: { material: MeshStandardMaterial; hook?: Hook }[] = [];

export function lit(params: MeshStandardMaterialParameters, hook?: Hook): MeshStandardMaterial {
  const material = new MeshStandardMaterial(params);
  entries.push({ material, hook });
  return material;
}

export function applyMaterials(csm?: { setupMaterial: (material: Material) => void }): void {
  for (const entry of entries) {
    csm?.setupMaterial(entry.material);
    entry.hook?.(entry.material);
  }
}
