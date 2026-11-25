/**
 * Local map from exhibition id to its 3D model files and credits.
 * Each exhibition can have several models; the viewer shows a switcher.
 * Exhibitions without an entry here show no "Preview in 3D" option.
 * If the database later gains a modelUrl field on exhibitions,
 * this map is replaced by that field with no change to the viewer.
 */
export const models = {
  1: [
    { name: 'Antique Camera', url: './models/AntiqueCamera.glb', credit: 'Antique Camera by Microsoft, CC-BY 4.0' },
    { name: 'Antique Gramophone', url: './models/AntiqueGramophone.glb', credit: 'Antique Gramophone, modeled by Pallav' },
  ],
  2: [
    { name: 'Human Heart', url: './models/HumanHeart.glb', credit: 'Realistic Human Heart, modeled by Pallav' },
    { name: 'DNA Strand', url: './models/DNAStrand.glb', credit: 'DNA Strand, modeled by Pallav' },
  ],
  3: [
    { name: 'Indominus Rex', url: './models/IndominusRex.glb', credit: 'Indominus rex by Pablo Lara and Mauricio Vega, CC-BY-SA 3.0 (fan art, non-commercial)' },
    { name: 'T-Rex Skeleton', url: './models/TRexSkeleton.glb', credit: 'T-Rex skeleton: original model by Andres Rojas (CC-BY 3.0), rigged and animated by Blend Swap author #93054' },
  ],
};

/** Returns the model list for an exhibition id, or undefined when it has none. */
export function modelsFor(exhibitionId) {
  if (exhibitionId == null) return undefined;
  const list = models[exhibitionId];
  return list?.length ? list : undefined;
}
