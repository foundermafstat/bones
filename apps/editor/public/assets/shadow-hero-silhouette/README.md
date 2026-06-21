# Shadow Hero Silhouette Asset Pack

Source image: `source.png`

Generated assets:

- `part_01_*.svg` ... `part_43_*.svg` - separated silhouette elements traced from the source image.
- `manifest.json` - source bounding boxes and generated file mapping.

Notes:

- SVGs use a single `#050505` fill and `evenodd` paths.
- The assembled reference pose from the left side of the source sheet is preserved as `part_02_assembled_side_reference.svg`.
- The editor preview builds and animates the skeleton from `initialEditorProject` in `apps/editor/app/editorState.ts`.
