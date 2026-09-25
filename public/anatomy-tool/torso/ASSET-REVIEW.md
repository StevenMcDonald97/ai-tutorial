# Asset check and torso pilot

## What is now available

| Requirement | Finding | Pilot status |
|---|---|---|
| Female-specific pelvis | HRA / Visible Human Female, CC BY 4.0 | Included as a separate, neutral female pelvis |
| Female skin | HRA female surface, CC BY 4.0 | Included as a neutral torso crop |
| Male skin | HRA male surface, CC BY 4.0 | Included as a neutral torso crop |
| Female pelvic and lower-limb muscles | University of Denver Visible Human Female, CC BY 4.0 | Suitable candidate identified; download endpoint was unavailable in this session; not included |
| Female upper-torso musculoskeletal anatomy | No complete, suitable source verified in this check | Not included; female muscle control disabled in the pilot |
| Construction | Original simplified 3D volume guides | Interactive torso view and static studies included |
| Drawing schemas | Four angles; three stages for both surface references | Included for the torso only |
| Fitted and poseable skin | Requires registration, rigging and deformation corrections | Not completed by this neutral pilot |

## The strongest next anatomical source

The University of Denver Center for Orthopaedic Biomechanics publishes female and male pelvis-to-foot bones, muscles and other tissues from the Visible Human data under CC BY 4.0:
https://digitalcommons.du.edu/visiblehuman/
https://digitalcommons.du.edu/visiblehuman/1/

Andreassen et al. (2023), *Three Dimensional Lower Extremity Musculoskeletal Geometry of the Visible Human Female and Male*, Scientific Data 10, 34.
https://doi.org/10.1038/s41597-022-01905-2

This would address much of the female lower-body anatomy but does not supply all upper-torso muscles. Its file availability needs to be resolved before integration. No fees or purchases were incurred in this asset check.

## Surface alternative

MakeHuman/MPFB core assets use CC0, making them a practical alternative for artist-oriented, riggable exterior bodies:
https://static.makehumancommunity.org/about/license.html

They are character surfaces, not a substitute for a female-specific internal atlas. They were researched but are not bundled here.

## Work still required before full rollout

1. Evaluate the torso diagram progression and the reference bodies visually.
2. Acquire and align a coherent female musculoskeletal dataset; document any missing or reconstructed structures.
3. Fit male and female exterior surfaces to their respective internal models. Different source specimens must not be treated as automatically interchangeable.
4. Rig and correct skin, muscle and joint deformation together. Validate the shoulders, hips and hands through useful drawing poses.
5. Extend the diagram system region by region, with body-part-specific volumes and landmarks rather than repeating the torso template.

These remain substantial modeling and illustration tasks. This pilot establishes a reviewable direction; it does not complete the three full-body upgrades.

## Revision 06 implementation status

The source download for the Denver female muscle dataset remains unavailable (HTTP 403). No female muscle geometry has been substituted or fabricated. The main viewer now displays the available female pelvis and neutral full skin surface, replacing the earlier male-derived anatomy. Male and female skin references are fixed neutral assets; posing is disabled for them. Female muscle controls are disabled with an explanation.

The displayed diagrams now use exact source-mesh contours and stored source vertices instead of the original generalized barrel/block diagrams. Mapped regions: male torso, back, pelvis and left hand; female pelvis. Other male regions remain clearly identified as legacy schematics; unsupported female diagrams are not shown.
