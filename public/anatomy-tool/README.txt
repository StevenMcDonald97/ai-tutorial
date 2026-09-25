Hand attachment and stance update
Long finger and thumb tendon slips now follow their phalange joint chains.
The four ecorche gestures use revised planted stances; the original standing
pose remains the default. Foot contact and an estimated construction-volume
mass center are checked for each preset. This is not a full biomechanics or
balance simulation, and custom joint edits are not automatically rebalanced.

Current construction view
The construction layer now uses planar envelopes measured from the neutral
Z-Anatomy atlas, with the same bone-based joint locations as muscle and skeleton.
It shows major forms rather than separate muscles. Finger segments follow the
source phalanges; individual toes and fine facial anatomy are simplified.
Posing is an approximation, without soft-tissue collision or volume simulation.
The original standing pose remains the default. Skin and female views remain disabled.

Earlier release notes follow:

ÉCORCHÉ POSES
Skin view removed. Four photo-inspired presets: Thrower, Extended arm, Upward reach, Borghese gladiator. These are rigged approximations of supplied sculpture poses, not scans of those sculptures. Reset selected pose restores the chosen reference pose.

APPROVED DRAWING SCHEMAS
The study panel contains 17 approved original drawing sheets. Select a body region, then open a sheet to enlarge it. The collection link lists all sheets. Ankle and isolated toe drafts are excluded. Model posing does not change fixed drawings.

CURRENT RELEASE 08
Female anatomy is temporarily disabled in both viewers. Existing female links open the male figure. Female assets are retained for future restoration.

CURRENT RELEASE 07
Female skeletal and muscle coverage expanded. Select Female, then Skeleton or Muscle. Coverage remains partial; upper body and feet are not complete. These reference layers cannot be posed. Previous release notes below are historical.

REVISION 07 — FEMALE LOWER-LIMB EXTENSION
Female-source skeletal additions: HRA female v1.10, Kristen Browne and Heidi Schlehlein / HuBMAP, CC BY 4.0. https://lod.humanatlas.io/ref-organ/united-female/v1.10
76 female lower-limb muscles: Thor E. Andreassen, Donald R. Hume, Landon D. Hamilton, Karen E. Walker, Sean E. Higinbotham and Kevin B. Shelburne (2023), Three Dimensional Lower Extremity Musculoskeletal Geometry, Scientific Data 10, 34. https://doi.org/10.1038/s41597-022-01905-2 ; https://digitalcommons.du.edu/visiblehuman/1/ ; CC BY 4.0 https://creativecommons.org/licenses/by/4.0/
Adapted through slorksmo/Human-Atlas, revision 5bb5713aab18d7fe9380c3339eb09f173491ea06: https://github.com/slorksmo/Human-Atlas . Its female-source muscles were fitted by anatomical group using rotation, uniform scale and translation, then simplified with quantized normals. Reported bone agreement is 17–36 mm. The assembly combines different female references; it is not a validated anatomical or biomechanical atlas.
Our changes: select 35 skeletal meshes and all 76 donor-muscle meshes, decode normals, translate into existing female pelvis coordinates and assign selectable regions. No borrowed male geometry is included. The original higher-resolution female pelvis and mapped landmarks are retained unchanged. Neutral pose only. See reference-bodies/female-provenance.json and FEMALE-SOURCE-ATTRIBUTION.md.

FIGURE STUDY — INTERACTIVE PROTOTYPE 04

Posing
Choose Pose above the figure, then click or tap a joint marker.
Its available movements open beside the figure. Study returns to anatomy
selection. Reset joint restores only the selected joint to neutral. Undo pose
reverses the last adjustment, joint reset, or preset change (up to 50 steps).
Tab to joint markers and press Enter for keyboard selection; arrow keys adjust
focused movement sliders. The joint selector in the panel is useful when
markers overlap. Drag the figure background to orbit; scroll or pinch to zoom.


Self-hosting
Serve this directory over HTTP(S) with any static website host. No backend,
API keys, subscription, remote model viewer, or runtime CDN is needed.
The entry point is index.html. Keep all files together.

Models and diagrams — version 04
Bone and muscle views now use detailed Z-Anatomy / BodyParts3D meshes:
252 skeletal meshes (including teeth), 507 muscle/tendon meshes, and 37
cartilage/disc meshes. These are mesh counts, not counts of human structures.
The muscle view retains the underlying skeleton and cartilage. Click a visible
structure in Study mode to see its source name and region. Pose mode retains
joint selection, finger articulation, shoulders, presets, and undo.

The source atlas is adult male. The female option is explicitly a proportion
adaptation of that male atlas, NOT independently validated female anatomy;
its pelvis and sex-specific structures should not be treated as a reliable
female anatomical reference. A separately sourced female atlas is still needed.
The neutral male geometry retains detailed source forms after documented mesh
conversion and limited simplification. Pose deformation uses approximate
weights, not physiological muscle changes, scapular contact or collision.
Extreme poses can distort or intersect structures. This remains an artist-tool
prototype, not a completed, anatomically validated teaching atlas.

Skin/construction views and all lesson schemas retain their original simplified
procedural geometry. The schemas have not been upgraded in this version.
No uploaded reference images are redistributed.

Detailed geometry downloads about 25 MB locally from anatomy/ on first load.
Use a modern browser supporting WebGL2 and DecompressionStream. Extraction of
the entire ZIP is required; opening index.html directly as file:// will not
load its modules and fetched meshes. Serve over HTTP(S). A simple local option:
python3 -m http.server 8000
Then open http://localhost:8000 in your browser.

Upgrade boundary
model.js exports createFigure(sex, layer, diagram), REGIONS, JOINTS, PRESETS.
The figure adapter returns root, joints, meshes, setPose(pose), dispose().
Each selectable mesh has userData.region. Preserve those region IDs when
replacing procedural geometry with rigged assets. Pose values are XYZ Euler
degrees at named joints. Detailed rigs may need an adapter and corrective
shapes; they are not assumed to be drop-in without preparation.
lessons.js contains independent teaching content. app.js renders the controls
and fixed lesson views. All dependencies are bundled locally.

Reuse
Detailed anatomical material has CC BY-SA attribution/share-alike conditions;
see ANATOMY-CREDITS.txt and anatomy/ for full notices and provenance.
No recurring model license fee is required. Keep these notices when hosting.
Original application code and original procedural geometry in this project
are provided under the MIT license in APP-LICENSE.txt.
Three.js 0.180.0 is redistributed under its MIT license in THREE-LICENSE.txt.
Retain both license notices in redistributed copies. No recurring license fees
are required by those bundled licenses. Hosting service costs are separate.

Verification
JavaScript syntax and model/lesson coverage are checked before publication.
Browser visual and interaction QA has not been performed in this build.

Version 03 — hands and shoulders
Each hand now has four fingers with MCP, PIP, and DIP joints, plus thumb CMC,
MCP, and IP joints. Click a wrist to zoom in; finger markers appear for that
hand. Select individual joints or use the joint menu. Open hand resets that
hand's digit joints, leaving the wrist pose intact. Undo restores the pose.

Shoulders use elevation (0–180 degrees), reach direction (−90 back, 0 side,
90 forward, up to 135 across), and local upper-arm rotation. A moving girdle
shares elevation after the first 30 degrees. The elevation envelope narrows
for backward and across-body reaches; internal rotation is limited overhead.
These are deliberately simplified artist-rig rules, not normative medical
limits. They do not model individual anatomy, ligament mechanics, muscle
bulging, collision/contact, or scapular sliding on a detailed rib cage.
Some self-intersections remain possible, particularly at extreme poses.
Finger spread narrows with MCP flexion. Fingers and thumb have rigid segments;
independent articulation does not guarantee a collision-free grasp.

Rig format change: shoulder tuples now mean elevation, direction, rotation,
NOT the version 01/02 XYZ Euler angles. Shipped presets have been migrated.
normalizeJoint and jointLimits define the same constraints for model and UI.
Other original body-joint tuples retain their prior meanings.

Reference informing the moving shoulder-girdle approach:
Soltani-Zarrin et al., A Computational Approach for Human-like Motion Generation
in Upper Limb Exoskeletons Supporting Scapulohumeral Rhythms (2017).
https://arxiv.org/abs/1712.02336
The paper supports accounting for a moving shoulder center; it does not
validate this prototype's numeric pose envelope.

Validation: checked every joint anchor on both models and all four layers;
tested finger-chain motion, thumb motion, cardinal shoulder reaches, joint
limits, and normalization stability. Browser visual/interaction QA not run.

Version 04 validation
Imported all four male/female and bone/muscle combinations. Sampled neutral
skinned vertices match converted geometry within 0.000001 scene units. Checked
all presets for finite transformed geometry and verified finger-bone movement.
Inspected orthographic images of the imported neutral bone and muscle meshes.
Browser visual/interaction QA has not been performed for this build.

Source rebuild
The site runs without npm dependencies. To regenerate geometry separately,
install three@0.180.0 and meshoptimizer@0.23.0 in a development checkout and run:
node scripts/build-anatomy.mjs DIRECTORY_CONTAINING_SOURCE_FBX_FILES
Use the source revision and SHA-256 input hashes recorded in
anatomy/PROVENANCE.json. The three input files are SkeletalSystem100.fbx,
MuscularSystem100.fbx and Joints100.fbx. The generated anatomy buffers are
already bundled; rebuilding is optional. Preserve license/provenance files.

Version 05 — neutral torso pilot
Open torso-study.html or choose New: torso drawing study in the main header.
Separate female-source pelvis and male/female skin surfaces are included in
this pilot, with construction studies from front, three-quarter, side and back.
See torso/SOURCES.md and torso/ASSET-REVIEW.md for attribution, source gaps,
and the distinction between this neutral sample and the full-figure rig.
The full-figure female internal model has NOT been replaced in this release.

The website download link assembles the local site files into a ZIP in your
browser. It does not contact an external service. A separately downloaded ZIP
can also be extracted and hosted normally.

Version 06 — anatomy-mapped studies and female source correction
Female muscle controls are disabled: a suitable available source has not yet
been acquired. The main female bone layer contains actual female-source pelvis
only, not a distorted full male skeleton. Both skin layers now show full
Visible Human source surfaces, fixed in their neutral poses. Pose controls
remain available for the male anatomical rig and schematic construction.
Mapped studies cover male torso, back, pelvis and hand, and female pelvis.
Numbered structures link to their source in the main viewer. Select a diagram
to open its full-resolution image. Stages share coordinates and viewing angle.
Other male regions are marked legacy schematics; unsupported female studies
are explicitly unavailable. All diagrams are neutral and do not follow posing.

Validation: source buffer integrity, exact landmark-to-vertex correspondence,
all diagram variants, module syntax, and reference-model source selection
checked. Browser visual/interaction QA has not been performed in this build.
