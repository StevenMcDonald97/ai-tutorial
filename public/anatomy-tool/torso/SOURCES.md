# Torso pilot: sources and interpretation

## Included female-specific material

The female skin and bony pelvis come from the **Visible Human Female**, via the HuBMAP Human Reference Atlas. They are not reshaped male meshes. They represent an individual reference body, not a universal female body type.

- Kristen Browne and Heidi Schlehlein. *3D Reference Organ for Skin, Female v1.3* (2022). [DOI](https://doi.org/10.48539/HBM466.LKPQ.876).
- Kristen Browne and Heidi Schlehlein. *3D Reference Organ for Pelvis, Female v1.2* (2022). [DOI](https://doi.org/10.48539/HBM427.CCRP.887).
- Kristen Browne and Heidi Schlehlein. *3D Reference Organ for Skin, Male v1.2* (2022). [DOI](https://doi.org/10.48539/HBM369.SBSP.863).

All three assets are **Creative Commons Attribution 4.0 International**: https://creativecommons.org/licenses/by/4.0/ . No licensing fee is required. Retain attribution and identify changes when redistributing them or their derivatives.

Publisher: HuBMAP. Project lead: Katy Börner. Funder: National Institutes of Health, OT2OD026671. Underlying Visible Human imaging provided by the U.S. National Library of Medicine.

The HRA female skin source itself has documented adjustments to its torso and lower limbs. The male skin also has documented lower-limb adjustments. These are anatomical reference models, not untouched scan surfaces.

Changes in this pilot: cropped neutral skin to a torso study, removed internal trabecular shells from the pelvis display, repacked buffers, assigned uniform materials, and rendered orthographic shaded/outline images. Cut boundaries are presentation cuts, not anatomical edges. Source file paths and SHA-256 hashes are in manifest.json. The original metadata is preserved in the adjacent source metadata files. Source repository: https://github.com/hubmapconsortium/ccf-releases . The specific checked-out source revision is in SOURCE-REVISION.txt.

## Male internal anatomy

The male bone and muscle layers retain Z-Anatomy / BodyParts3D geometry and their attribution/share-alike terms, documented in ../ANATOMY-CREDITS.txt. This is a **different specimen** from the HRA skin. The pilot does not claim that these models are registered or that the skin fits those muscles.

## Drawing diagrams — revision 06

Current displayed diagrams are generated from the source meshes, using one camera and coordinate frame across all three stages. Stage one uses selected actual skeletal structures, stage two adds the full regional bone contours, and stage three adds the selected muscles (male) or developed bony surface (female pelvis). Every numbered point stores its source mesh, vertex index and coordinates in ../schemas/mapped.json. Some points are behind the visible surface; the legend identifies these for the bone view.

The mapped studies cover the male torso, back, pelvis and left hand, and the female pelvis. They are neutral anatomical studies, not posed diagrams or completed skin drawings. Labels such as anterior or lower extent identify a sampled geometric extremum of the named bone; they are not assertions that every sampled point is a clinically defined landmark. Source contour accuracy remains limited by the underlying atlas and prior mesh conversion.

The main viewer now uses actual Visible Human female skin and pelvic bones. Female muscles and the rest of the female skeleton are unavailable; the old male-derived anatomical substitute is no longer rendered. The male muscle/bone atlas remains Z-Anatomy. Skin surfaces of both sexes are neutral references with posing disabled until a fitted rig is available. Construction mannequins remain schematic.

Full-surface metadata and input hashes are in ../reference-bodies/manifest.json. The shared source attribution above applies to these full surfaces as well as the torso crops. Skin selection regions are approximate interface partitions, not segmented anatomical structures.
