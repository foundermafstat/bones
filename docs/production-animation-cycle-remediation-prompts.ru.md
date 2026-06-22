# Production-доработки Bones: полный цикл создания анимаций

Дата: 2026-06-22

## 1. Цель документа

Этот документ фиксирует повторный глубокий анализ текущего состояния Bones и полный список доработок, которые нужны, чтобы довести проект до production-уровня именно как редактор полного цикла создания анимаций.

Целевой результат:

```txt
создать/импортировать silhouette parts
-> собрать skeleton/rig
-> привязать части к костям
-> отредактировать формы/path/mesh
-> создать poses
-> создать animation clips/keyframes/curves/events
-> собрать state machine/blend tree/procedural layers/IK
-> проверить переходы в LDtk/platformer preview
-> экспортировать production-safe source + compiled JSON
-> загрузить compiled JSON в PixiJS runtime
-> бесшовно менять состояния анимаций в игре
```

Бесшовность означает:

- переходы `idle -> walk -> run -> jump -> fall -> land -> idle` не дергают силуэт;
- transition blending смешивает transform/scale/rotation/part opacity/deform tracks;
- state machine учитывает условия, приоритеты, `canInterrupt`, `syncMode`, duration/easing;
- locomotion работает через blend tree, а не через набор ручных кнопок;
- procedural layers, squash/stretch и Foot IK применяются после base animation и не ломают authored pose;
- runtime и editor preview показывают один и тот же compiled результат.

## 2. Текущее состояние на 2026-06-22

Проверено:

- `pnpm --filter @bones/editor test` проходит: 19 tests.
- `pnpm --filter @bones/editor typecheck` проходит.
- `pnpm rc:smoke` проходит.
- Browser smoke на `http://localhost:3000/` проходит:
  - Preview показывает `idle/walk/jump/fall/land`;
  - `State Machine Graph` отображается;
  - `Export Bundle` создает 5 файлов;
  - `hero.source.rig.json` и `hero.compiled.json` после export не содержат `type: "svg"`.

Сильные стороны:

- Есть рабочий monorepo layout: `apps/editor`, `packages/schema`, `packages/compiler`, `packages/runtime-pixi`, `packages/vector-core`, `packages/ldtk-adapter`, `packages/platformer-preview`.
- Runtime уже не заглушка: `RigInstance.update()` выполняет state machine -> mixer/crossfade/blend tree -> base sample -> procedural -> constraints -> events.
- Editor уже имеет Rig/Shape/Pose/Timeline/Curve/State Machine/Procedural/Preview modes.
- Export production bundle уже vectorize SVG parts перед compiled export.
- Timeline уже поддерживает keyframe drag, group selection/drag, markers/events, retime/reverse/normalize.
- State Machine уже имеет базовый SVG graph preview.

Главный остаточный разрыв:

```txt
Runtime core уже близок к production vertical slice.
Editor authoring еще не является полноразмерным animation production tool.
Preview еще недостаточно доказывает бесшовный state transition runtime в условиях игры.
```

Оценка готовности после последних фиксов:

| Слой | Готовность | Комментарий |
| --- | ---: | --- |
| Runtime animation core | 78-82% | Есть sampling/mixer/state machine/procedural/constraints/events; нужны hot path, richer transition semantics, runtime QA. |
| Compiler/export | 75-80% | Source->compiled работает, SVG vectorize в export есть; нужны строгие production profiles, compressed packaging, compatibility tests. |
| Editor shell | 70% | Панели, modes, resize, preview, smoke работают; нужна зрелая UX-модель инструментов. |
| Rig/Shape authoring | 55-60% | Есть базовые controls; нужны canvas handles, pivots, parenting, mesh/path editor quality. |
| Timeline/Curve authoring | 60-65% | Есть keyframes/curves/group drag; нужны lanes, dope sheet, graph editor, event/marker UX, auto-key discipline. |
| State Machine authoring | 55% | Есть graph preview; нужен полноценный graph editor, live parameters, blend tree editor, transition debug. |
| Procedural/IK authoring | 45-50% | Есть controls; нужна compiled/runtime parity, presets, preview stress scenes. |
| Production QA/performance | 45% | `rc:smoke` есть; нужны visual regression, performance budgets, mobile gates, package artifacts. |

## 3. Production target architecture

Production-цикл должен быть построен вокруг одной истины:

```txt
Editor authored project
  -> canonical RigProject source JSON
  -> schema validation + migrations
  -> compiler production profile
  -> compiled runtime JSON
  -> RigInstance.update(dt, params)
  -> state machine + mixer + procedural + IK
  -> Pixi render
```

Редактор не должен иметь отдельную анимационную правду, отличную от runtime. Любое действие в UI должно либо сразу отражаться в canonical source model, либо иметь явный draft/transaction state, который при commit становится source-compatible.

## 4. Milestone P0 — Source model parity и project transactions

### Что доработать

Нужно убрать последние расхождения между `EditorProjectState` и canonical `RigProject`.

Сейчас editor state удобен для UI, но production tool должен иметь надежную модель:

- все editor mutations должны проходить через command/transaction layer;
- все изменения должны иметь dirty scope;
- source JSON после любой операции должен валидироваться;
- undo/redo должен корректно восстанавливать selection, mode-local UI state, timeline selection и graph selection;
- autosave должен сохранять source-compatible проект, а не legacy wrapper;
- import должен поддерживать migration path и показывать структурированные validation errors.

### Технический промт

```txt
Реализуй production-grade project model layer для Bones editor.

Фокус:
- apps/editor/app/editorState.ts
- apps/editor/app/editorSourceProject.ts
- apps/editor/app/projectIo.ts
- packages/schema/src/*

Требования:
1. Ввести явный adapter boundary: EditorProjectState <-> RigProject без потерь.
2. Добавить validate-after-command режим для dev/editor smoke: после command проверять toSourceProject(project).
3. Убрать legacy-wrapper как основной save format; оставить только migration import.
4. Добавить ProjectTransaction API для grouped changes: begin/commit/rollback.
5. Dirty scopes должны покрывать bones, parts, poses, animations, stateMachine, procedural, preview.
6. Undo/redo должен сохранять selectedBoneId, selectedPartId, selectedKeyIds, selectedTransitionId через editor metadata или UI state bridge.
7. Добавить focused tests на roundtrip: initial project -> source -> editor -> source без потери ids/tracks/state/procedural.
```

### Проверка

- `pnpm --filter @bones/editor test`
- `pnpm --filter @bones/editor typecheck`
- Новый test: `source roundtrip preserves animation/state/procedural data`.
- Browser smoke:
  - изменить rig, shape, timeline, state machine;
  - export source;
  - import source назад;
  - проверить, что UI и export совпадают.

### Успех

- Любой authored project экспортируется в валидный `RigProject`.
- Source roundtrip не теряет bones/parts/tracks/transitions/procedural.
- Legacy wrapper больше не является production save format.

## 5. Milestone P1 — Production Rig Mode

### Что доработать

Rig Mode должен стать полноценным skeleton authoring tool.

Нужно расширить:

- canvas handles для bone head/tail/pivot;
- drag parent/child relationship;
- local/world transform switch;
- mirror workflow;
- lock/hidden/facing/tag metadata;
- bone length/orientation;
- safe rename/delete с impact preview;
- transform numeric inspector + canvas manipulation;
- onion/current pose overlay;
- auto-key transform changes в выбранной временной точке.

### Технический промт

```txt
Доведи Rig Mode до production authoring уровня.

Файлы:
- apps/editor/app/page.tsx
- apps/editor/app/editorState.ts
- apps/editor/app/editorSourceProject.ts
- apps/editor/tests/editorState.test.mjs

Реализуй:
1. Bone handles: head point, tail point, pivot point, rotation ring.
2. Drag bone head меняет local x/y; drag tail меняет length/rotation.
3. Parent reassignment через canvas: drag bone на parent target + explicit commit.
4. World/local inspector toggle.
5. Mirror tools:
   - assign mirror group;
   - mirror selected bone transform;
   - mirror hierarchy branch.
6. Delete/Rename impact modal:
   - children;
   - bound parts;
   - animation tracks;
   - pose refs;
   - procedural refs.
7. Auto-key mode:
   - если выбран clip/time и auto-key on, rig drag пишет transform keyframes.
8. Все операции undoable через commands.
```

### Проверка

- Unit tests:
  - rename updates animations/poses/procedural refs;
  - delete rebinds children safely;
  - mirror branch creates expected transforms;
  - auto-key writes x/y/rotation keys.
- Browser:
  - создать bone;
  - drag head/tail;
  - parent body/root;
  - включить auto-key и сдвинуть bone на time `0.5`;
  - проверить keyframe в timeline/source JSON.

### Успех

- Скелет можно собрать с нуля без ручного JSON.
- Любая rig-операция сохраняется в source и undoable.
- Изменения в rig могут сразу становиться animation keyframes.

## 6. Milestone P2 — Shape/Vector/Mesh authoring

### Что доработать

Shape Mode должен закрыть полный путь от SVG import до production path/mesh.

Нужно:

- import SVG с группами/path selection;
- path editor с bezier handles;
- fill/stroke/opacity/draw order;
- pivot/anchor editor;
- bind/rebind to bone;
- mesh-lite deformation для частей тела;
- path simplification/smoothing;
- shape validation: no empty path, invalid commands, huge command count;
- production profile: no runtime SVG.

### Технический промт

```txt
Реализуй Shape Mode как production vector/mesh editor.

Файлы:
- packages/vector-core/src/*
- apps/editor/app/editorVectorImport.ts
- apps/editor/app/editorState.ts
- apps/editor/app/page.tsx
- packages/compiler/src/compiler.ts
- packages/runtime-pixi/src/PixiPartRenderer.ts

Требования:
1. SVG importer должен читать все path элементы, а не только первый.
2. UI должен показывать список imported paths с preview и allow merge/select.
3. Path editor:
   - add/delete/move points;
   - edit cubic/quadratic handles;
   - convert line -> cubic;
   - close/open path;
   - reverse winding;
   - smooth/simplify.
4. Part inspector:
   - bone binding;
   - draw order;
   - pivot/anchor;
   - local transform;
   - fill color/alpha.
5. Mesh-lite:
   - create mesh from path bounds;
   - edit vertices;
   - support part deform tracks.
6. Export:
   - source may preserve original assetPath in editor metadata;
   - compiled production parts must be path/procedural/mesh only.
```

### Проверка

- Unit tests:
  - multi-path SVG import;
  - path roundtrip;
  - mesh deform compile/runtime update;
  - production export rejects or vectorizes SVG.
- Browser:
  - add SVG part;
  - vectorize;
  - edit bezier point;
  - bind to bone;
  - export;
  - assert compiled has no SVG.

### Успех

- Художник может импортировать SVG, превратить его в editable path/mesh и экспортировать без runtime SVG.
- Shape edits видны в Pixi preview и сохраняются.

## 7. Milestone P3 — Pose Library и pose-to-animation bridge

### Что доработать

Pose Mode должен быть не просто набором saved transforms, а мостом между rig editing и animation authoring.

Нужно:

- capture current pose;
- apply pose partially by mask;
- mirror pose;
- blend two poses;
- generate keyframes from pose at current time;
- pose tags: idle/walk/jump/fall/land/attack/wall;
- pose thumbnails;
- pose diff view;
- pose library import/export.

### Технический промт

```txt
Доведи Pose Mode до production workflow.

Реализуй:
1. Capture current pose with selected bones/parts mask.
2. Apply pose with blend weight 0..1.
3. Mirror pose using bone mirror groups.
4. Convert pose to keyframes at current timeline time.
5. Pose thumbnails rendered from compiled preview.
6. Pose diff: changed bones, parts, deforms.
7. Pose library JSON import/export.

Все операции должны сохраняться в source poses[] и быть undoable.
```

### Проверка

- Tests:
  - capture/apply/mirror/blend pose;
  - pose-to-keyframe writes transform tracks;
  - source export includes poses.
- Browser:
  - создать jump_start pose;
  - apply at `0.1` in jump clip;
  - увидеть keyframes в timeline;
  - export/import без потерь.

### Успех

- Поза становится reusable animation building block.
- Jump/land/walk можно собирать через poses, а не ручным вводом всех tracks.

## 8. Milestone P4 — Timeline/Dopesheet production editor

### Что доработать

Timeline должен стать полноценным dopesheet:

- tracks tree by bone/part/project/stateMachine;
- multi-select box selection;
- drag selected keys;
- scale/retime selected keys;
- copy/paste across clips;
- snapping/grid/frame ruler;
- playhead drag;
- markers/events lanes;
- ghost/onion preview;
- auto-key;
- loop range;
- keyboard shortcuts;
- virtualization for many tracks.

### Технический промт

```txt
Доведи Timeline Mode до production dopesheet.

Требования:
1. Track tree:
   - bones grouped;
   - parts grouped;
   - project/stateMachine/procedural tracks.
2. Selection:
   - click;
   - shift-click;
   - marquee select;
   - select all in track/range.
3. Editing:
   - drag one/many keys;
   - scale around pivot;
   - retime selected;
   - copy/paste;
   - delete;
   - duplicate;
   - snap to frames.
4. Playhead:
   - draggable;
   - shows current pose in preview;
   - updates selected time.
5. Events/markers:
   - dedicated lanes;
   - event payload editor;
   - footstep/land/attack window presets.
6. Auto-key:
   - rig/shape/procedural changes write keys at current time when enabled.
7. Performance:
   - virtualize rows;
   - no layout shift when dragging.
```

### Проверка

- Tests:
  - multi-key move/scale/delete/copy/paste;
  - event payload roundtrip;
  - playhead updates preview sample;
  - auto-key from rig drag.
- Browser:
  - create clip;
  - add tracks;
  - marquee select keys;
  - drag group;
  - add footstep event;
  - export compiled and assert events exist.

### Успех

- Полный animation clip можно собрать без JSON.
- Timeline edits immediately affect preview and compiled export.

## 9. Milestone P5 — Curve Graph Editor

### Что доработать

Curve Mode должен управлять качеством движения:

- graph view for selected track;
- bezier handles visually draggable;
- curve presets;
- tangent editing;
- velocity visualization;
- overshoot/spring preview;
- per-key interpolation;
- batch apply curves to selected keys;
- compare A/B transition.

### Технический промт

```txt
Реализуй production Curve Graph Editor.

Требования:
1. Показывать selected track as value-over-time graph.
2. Draggable bezier handles для selected key segment.
3. Presets: linear, hold, easeIn, easeOut, easeInOut, anticipation, overshoot, spring.
4. Batch apply preset to selected keys.
5. Show sampled curve preview at 60 fps ticks.
6. A/B compare:
   - clip A;
   - clip B;
   - transition weight;
   - expected blended values.
7. Persist curves in source and compile optimized curve representation.
```

### Проверка

- Tests:
  - bezier sample matches expected values;
  - preset compile roundtrip;
  - batch apply.
- Browser:
  - выбрать key;
  - drag handle;
  - preview changes;
  - export source/compiled includes curve.

### Успех

- Анимация перестает быть механической.
- Transition blend визуально прогнозируем до runtime.

## 10. Milestone P6 — State Machine Graph production editor

### Что доработать

Текущий graph preview нужно расширить до полноценного editor:

- drag nodes;
- add/delete/rename states;
- create transitions by dragging edge;
- transition inspector;
- parameters panel;
- conditions builder;
- interruption rules;
- sync mode/phase matching;
- blend tree editor;
- live simulation with params.

### Технический промт

```txt
Доведи State Machine Mode до production graph editor.

Требования:
1. Graph canvas:
   - draggable nodes;
   - persisted node positions in editor metadata;
   - create transition by dragging connector;
   - delete transition/state with impact validation.
2. State inspector:
   - clip;
   - tags;
   - blendTree;
   - entry/exit events.
3. Transition inspector:
   - conditions;
   - duration;
   - easing;
   - priority;
   - canInterrupt;
   - syncMode: none/normalizedTime/phaseMatch;
   - interruption window.
4. Parameters panel:
   - speed/absSpeed/velocityX/velocityY/grounded/jumpPressed/facing/wallContact/timeInState;
   - manual sliders/toggles for live preview.
5. Live simulation:
   - run state machine with params;
   - show active state, previous state, transition id, transition weight, blend tree weights.
6. Export:
   - source stateMachines[];
   - compiled numeric state machine;
   - validation for missing clips/params.
```

### Проверка

- Tests:
  - create graph state/transition;
  - transition condition validation;
  - phaseMatch transition calls mixer with phase matching;
  - blend tree outputs expected clip weights.
- Browser:
  - drag node;
  - create `idle -> walk`;
  - create `walk -> jump`;
  - toggle params and watch live state changes;
  - export compiled and assert numeric transitions.

### Успех

- User can author full locomotion graph without JSON.
- Transitions are inspectable and simulate live.
- Runtime preview proves seamless state changes.

## 11. Milestone P7 — Seamless transition runtime contract

### Что доработать

Нужно усилить runtime transition semantics, чтобы конечный результат действительно безшовно менял состояния.

Требования:

- transition blending should blend all supported track types;
- normalized time and phase matching must be deterministic;
- interruption rules must avoid snapping;
- root motion / body offset continuity;
- optional transition clips;
- additive layers;
- transition events and windows;
- no duplicate events during crossfade;
- clear debug state.

### Технический промт

```txt
Усиль runtime transition contract для бесшовных переходов.

Файлы:
- packages/runtime-pixi/src/RuntimeStateMachine.ts
- packages/runtime-pixi/src/AnimationMixer.ts
- packages/runtime-pixi/src/AnimationSampler.ts
- packages/runtime-pixi/src/RigInstance.ts
- packages/compiler/src/compiler.ts
- packages/schema/src/types.ts

Реализуй:
1. Transition model:
   - duration/easing/syncMode/priority/canInterrupt;
   - optional transition clip;
   - interruption window;
   - exitTime / minStateTime.
2. Blending:
   - bone transform tracks;
   - part transform/opacity/visibility;
   - deform tracks;
   - project tracks;
   - stateMachine tracks.
3. Phase matching:
   - normalizedTime;
   - phaseMatch by foot events/markers if available;
   - fallback by normalized loop time.
4. Continuity:
   - keep body/root offset continuous;
   - prevent scale/rotation snap at transition start;
   - event dedupe during crossfade.
5. Debug:
   - RigUpdateState includes activeClip, previousClip, activeTransition, transitionWeight, layer weights, sampled clip times.
```

### Проверка

- Tests:
  - idle->walk crossfade has monotonic transition weight;
  - walk->jump respects priority;
  - jump->fall uses normalizedTime;
  - land cannot be interrupted when `canInterrupt=false`;
  - events are not duplicated during crossfade.
- Browser:
  - simulate idle/walk/jump/fall/land params;
  - inspect debug overlay;
  - no visible snapping at transition boundaries.

### Успех

- Runtime state changes are smooth and deterministic.
- State transition transforms are blended, not instant jumps.

## 12. Milestone P8 — Locomotion blend tree editor

### Что доработать

Для платформера нужен не только `idle -> walk`, а blend tree:

- idle/walk/run by `absSpeed`;
- optional crouch/climb/wallSlide;
- threshold editing;
- clip preview per threshold;
- automatic state machine integration;
- graph debug of weights.

### Технический промт

```txt
Реализуй 1D locomotion blend tree editor.

Требования:
1. State can be either direct clip or blendTree.
2. Blend tree UI:
   - parameter select;
   - threshold rows;
   - clip select;
   - add/remove/reorder thresholds;
   - graph line showing current parameter and weights.
3. Runtime:
   - evaluate lower/upper clips;
   - expose weights;
   - support transition from/to blend tree state.
4. Validation:
   - sorted thresholds;
   - existing clips;
   - parameter exists and is number.
```

### Проверка

- Tests:
  - threshold interpolation;
  - idle/walk/run weights by absSpeed;
  - transition into blend tree state.
- Browser:
  - edit thresholds;
  - move absSpeed slider;
  - observe live blend weights and pose changes.

### Успех

- Locomotion is smooth across speed, not a hard state jump.

## 13. Milestone P9 — Procedural animation and Foot IK as compiled contract

### Что доработать

Procedural сейчас частично работает как editor/runtime option. Production требует compiled contract.

Нужно:

- procedural presets in source;
- compiler emits runtime procedural configs;
- RigInstance creates ProceduralLayerStack from compiled data by default;
- Foot IK chains compile from source;
- LDtk/platformer world feeds real raycasts;
- jump/fall disables IK;
- landing squash triggers from params/events;
- secondary motion targets parts/bones with authored limits.

### Технический промт

```txt
Сделай procedural/IK полноценной частью source->compiled->runtime pipeline.

Файлы:
- packages/schema/src/types.ts
- packages/schema/src/validate.ts
- packages/compiler/src/compiler.ts
- packages/runtime-pixi/src/ProceduralLayers.ts
- packages/runtime-pixi/src/ConstraintSolver.ts
- packages/runtime-pixi/src/RigInstance.ts
- apps/editor/app/editorState.ts
- apps/editor/app/editorSourceProject.ts
- apps/editor/app/page.tsx

Реализуй:
1. Source procedural presets:
   - breathing;
   - secondaryMotion;
   - squashStretch;
   - footIK.
2. Compiler output:
   - compiled procedural configs;
   - target bone/part numeric ids;
   - validation errors for missing refs.
3. Runtime:
   - RigInstance applies compiled procedural configs automatically unless disabled.
   - Foot IK consumes raycast world from platformer preview/game adapter.
4. Editor:
   - procedural controls affect compiled preview;
   - presets can be saved/duplicated;
   - visual debug for offsets/IK corrections.
```

### Проверка

- Tests:
  - source procedural compiles to numeric runtime config;
  - breathing affects body/head;
  - squash applies on landing param;
  - Foot IK disabled in air and enabled grounded;
  - missing bone refs fail validation.
- Browser:
  - enable breathing/secondary/squash/foot IK;
  - export;
  - runtime preview shows same behavior.

### Успех

- Procedural life ships inside compiled JSON.
- Game integration does not need manually reconstructed procedural config.

## 14. Milestone P10 — LDtk gameplay preview as transition proof

### Что доработать

Preview Mode должен доказывать не только render, а gameplay transition behavior.

Нужно:

- load LDtk file or sample room;
- keyboard/touch simulation;
- parameter recorder;
- state debug overlay;
- transition debug overlay;
- collision/ground/wall/death/moving platform debug;
- record/replay scenarios;
- export visual smoke snapshots.

### Технический промт

```txt
Доведи Preview Mode до production validation harness.

Требования:
1. Preview runs compiled runtime through RigInstance.update(dt, params), not direct clip sampling.
2. Provide scenario controls:
   - idle;
   - walk;
   - run;
   - jump;
   - fall;
   - land;
   - wallSlide;
   - movingPlatform.
3. Add live params panel:
   - absSpeed;
   - velocityX/Y;
   - grounded;
   - jumpPressed;
   - landed/landingImpact;
   - wallContact;
   - facing.
4. Add debug overlay:
   - active state;
   - previous state;
   - active transition;
   - transition weight;
   - blend tree weights;
   - events fired.
5. Add scenario recorder:
   - record params over time;
   - replay deterministic transition sequence.
```

### Проверка

- Browser smoke:
  - click idle/walk/run/jump/fall/land;
  - debug overlay shows active transitions;
  - events list updates;
  - no console errors.
- Runtime tests:
  - recorded params replay leads to expected state sequence.

### Успех

- Preview proves seamless animation state changes before game integration.

## 15. Milestone P11 — Animation events and gameplay windows

### Что доработать

Events должны быть first-class:

- footstep events;
- land/dust events;
- attack windows;
- invulnerability windows;
- sound/camera events;
- event payload schema;
- event lanes in timeline;
- event dispatch in runtime with dedupe.

### Технический промт

```txt
Реализуй production animation events workflow.

Требования:
1. Schema:
   - typed event categories;
   - payload validation;
   - event duration/windows where needed.
2. Timeline:
   - event lane;
   - add/edit/delete event;
   - payload inspector;
   - presets: footstep, land, dust, attackStart, attackEnd.
3. Compiler:
   - sort events;
   - numeric target refs if needed;
   - preserve payload.
4. Runtime:
   - emit events once across loops/crossfades;
   - event subscription API;
   - event debug history.
```

### Проверка

- Tests:
  - loop boundary event once;
  - crossfade no duplicate;
  - payload roundtrip.
- Browser:
  - add footstep/land event;
  - preview emits event;
  - export compiled includes event.

### Успех

- Animation drives gameplay/audio/VFX hooks reliably.

## 16. Milestone P12 — Production export, packaging and compressed runtime format

### Что доработать

Export должен стать release artifact pipeline:

- source bundle;
- compiled bundle;
- compressed packaging;
- production profile validation;
- no SVG;
- no editor metadata in compiled;
- content hash/version;
- migration metadata;
- optional gzip/brotli;
- standalone Pixi demo artifact.

### Технический промт

```txt
Доведи export pipeline до production release artifact.

Требования:
1. Export profiles:
   - development;
   - production;
   - debug.
2. Production validation:
   - no SVG parts;
   - no missing refs;
   - no empty clips used by state machine;
   - no invalid transition params;
   - no excessive path command count without warning.
3. Files:
   - hero.source.rig.json;
   - hero.rig.json;
   - hero.animations.json;
   - hero.state-machine.json;
   - hero.compiled.json;
   - hero.compiled.br or .gz optional.
4. Add packaging script:
   - compile source;
   - validate compiled;
   - compress;
   - write manifest with hashes/sizes.
5. UI export summary:
   - sizes;
   - warnings/errors;
   - animations/states/parts count;
   - download all as zip when dependency policy allows.
```

### Проверка

- `pnpm rc:smoke`
- New script: `pnpm export:sample`
- Assert:
  - compiled has no editor metadata;
  - compressed artifact exists;
  - manifest hashes match;
  - standalone Pixi example loads compiled.

### Успех

- Exported artifact can be shipped directly to game runtime.

## 17. Milestone P13 — Runtime performance and mobile readiness

### Что доработать

Production требует performance gates:

- no allocations in hot path where practical;
- typed arrays for transform buffers;
- precompiled track lookup;
- object pool for events/samples;
- GraphicsContext reuse;
- no SVG parsing in gameplay;
- quality presets;
- mobile stress scene;
- profiler overlay.

### Технический промт

```txt
Проведи runtime/editor performance hardening.

Требования:
1. Add benchmark harness for:
   - 1 hero;
   - 10 heroes;
   - 50 heroes;
   - low/medium/high presets.
2. Track allocations:
   - RigInstance.update;
   - AnimationMixer.update;
   - ProceduralLayerStack.update;
   - ConstraintSolver.solve.
3. Optimize:
   - track lookup by numeric id;
   - reusable samples;
   - event pools;
   - typed transform buffers;
   - no per-frame shape rebuild.
4. Editor:
   - virtualized timeline rows;
   - throttled preview compile;
   - profiler panel with update/render/export timings.
```

### Проверка

- Bench script outputs budgets.
- `pnpm rc:smoke` still passes.
- Browser profiler shows stable frame/update values.
- No SVG parsing in compiled production path.

### Успех

- Mobile/desktop quality presets have measured budgets.

## 18. Milestone P14 — Visual regression and browser automation gates

### Что доработать

Нужна автоматизированная проверка редактора:

- app loads;
- no framework overlay;
- no console errors;
- preview idle/walk/jump/fall/land;
- state machine graph;
- export no SVG;
- timeline drag;
- responsive layout.

### Технический промт

```txt
Создай browser visual smoke automation для editor.

Требования:
1. Использовать существующий dev server `http://localhost:3000/`.
2. Проверить:
   - page identity;
   - nonblank editor;
   - no framework overlay;
   - console health;
   - Rig mode one skeleton overlay;
   - Preview scenarios idle/walk/jump/fall/land;
   - State Machine Graph exists;
   - Export Bundle has 5 files and no SVG parts.
3. Сохранить screenshots outside repo или в documented artifacts path только если явно нужно.
4. Добавить manual fallback checklist в docs.
```

### Проверка

- Browser automation returns structured JSON:
  - scenarios pass;
  - graph pass;
  - export pass;
  - console errors empty or explained.

### Успех

- Любой regression в основном animation cycle ловится до ручной проверки.

## 19. Milestone P15 — First production character quality pass

### Что доработать

Нужен один эталонный персонаж, который доказывает продукт:

- silhouette readability;
- no cloak by default, если sample должен быть без cloak;
- idle breathing;
- walk with weight transfer;
- jump anticipation/stretch;
- fall reaction;
- land squash/recover;
- foot events;
- state transitions smooth;
- production export loads in Pixi platformer example.

### Технический промт

```txt
Сделай first production character quality pass для Shadow Hero.

Требования:
1. Source sample:
   - clean skeleton;
   - no duplicate overlays;
   - no cloak unless explicitly enabled as optional part.
2. Clips:
   - idle;
   - walk;
   - run if blend tree needs it;
   - jump;
   - fall;
   - land;
   - wallSlide optional.
3. Curves:
   - no linear mechanical motion unless intentional;
   - anticipation/overshoot on jump/land.
4. Events:
   - footstep;
   - liftoff;
   - land.
5. State machine:
   - idle/walk/run locomotion;
   - jump/fall/land transitions;
   - no snapping.
6. Export:
   - production compiled;
   - example loads it.
```

### Проверка

- Browser visual smoke for all clips.
- Runtime tests for state sequence.
- Export no SVG.
- Manual visual checklist:
  - readable silhouette at mobile scale;
  - no limb popping;
  - landing squash recovers;
  - walk loop closes.

### Успех

- Один персонаж проходит полный production authoring + runtime cycle.

## 20. Milestone P16 — Documentation and handoff package

### Что доработать

Нужен handoff для будущих разработчиков/пользователей:

- source JSON format guide;
- compiled JSON guide;
- editor workflow;
- animation workflow;
- state machine/blend tree guide;
- export guide;
- runtime integration guide;
- troubleshooting;
- known limitations.

### Технический промт

```txt
Собери production handoff docs для Bones.

Документы:
1. docs/source-format.ru.md
2. docs/compiled-format.ru.md
3. docs/editor-workflow.ru.md
4. docs/animation-authoring-workflow.ru.md
5. docs/state-machine-authoring.ru.md
6. docs/runtime-pixi-integration.ru.md
7. docs/release-checklist.ru.md

Каждый документ должен содержать:
- цель;
- happy path;
- JSON examples;
- команды проверки;
- known limitations;
- troubleshooting.
```

### Проверка

- Документы ссылаются на актуальные scripts/tests.
- Новый пользователь может пройти `editor-scenario-smoke.ru.md`.
- Release checklist совпадает с `pnpm rc:smoke`.

### Успех

- Проект можно передать другому агенту/разработчику без потери контекста.

## 21. Рекомендуемый порядок выполнения

Расширенный порядок, без минимизации:

1. P0 Source model parity и project transactions.
2. P1 Production Rig Mode.
3. P2 Shape/Vector/Mesh authoring.
4. P3 Pose Library и pose-to-animation bridge.
5. P4 Timeline/Dopesheet production editor.
6. P5 Curve Graph Editor.
7. P6 State Machine Graph production editor.
8. P7 Seamless transition runtime contract.
9. P8 Locomotion blend tree editor.
10. P9 Procedural animation and Foot IK as compiled contract.
11. P10 LDtk gameplay preview as transition proof.
12. P11 Animation events and gameplay windows.
13. P12 Production export, packaging and compressed runtime format.
14. P13 Runtime performance and mobile readiness.
15. P14 Visual regression and browser automation gates.
16. P15 First production character quality pass.
17. P16 Documentation and handoff package.

Почему так:

- сначала нужна надежная data model;
- потом authoring tools;
- потом runtime transition semantics;
- потом gameplay preview, export, performance и release gates.

## 22. Definition of Done для production

Проект можно считать production-ready для полного цикла анимаций, когда выполнены все условия:

- Новый пользователь может открыть editor и с нуля создать skeleton.
- Пользователь может импортировать SVG, vectorize, отредактировать path/mesh и bind к костям.
- Пользователь может создать poses, clips, keyframes, curves, events.
- Пользователь может создать state machine с transitions и blend tree.
- Preview Mode проигрывает compiled runtime через `RigInstance.update(dt, params)`.
- Переходы `idle/walk/run/jump/fall/land` бесшовные визуально и подтверждены debug state.
- Procedural/IK сохраняются в source, компилируются и воспроизводятся runtime.
- Export production bundle не содержит SVG parts и проходит validation.
- `pnpm rc:smoke` проходит.
- Browser visual smoke проходит.
- Есть performance budget для low/medium/high.
- Есть release docs и integration example.

## 23. Главные риски

1. **Editor и runtime могут снова разойтись.**
   Лечение: preview всегда должен идти через source->compiled->runtime, а не через отдельную UI-модель.

2. **State Machine graph может стать только декоративным.**
   Лечение: каждый graph action должен менять source stateMachine и compiled output.

3. **Timeline может стать неудобным при большом количестве tracks.**
   Лечение: virtualization, grouped track tree, keyboard shortcuts, selection model.

4. **Procedural/IK могут остаться runtime-only настройками.**
   Лечение: все procedural presets должны жить в source/compiled contract.

5. **Бесшовность переходов нельзя доказать unit-тестами полностью.**
   Лечение: добавить visual/browser smoke + replay сценарии с debug overlay.

6. **Compression может быть спутана с compact runtime JSON.**
   Лечение: отдельно держать compact compiled JSON и packaging step `.gz/.br`.

## 24. Следующий практический шаг

Начать с P0, потому что без source/model parity дальнейшее расширение UI будет накапливать технический долг.

Первый prompt к выполнению:

```txt
Выполни Milestone P0 из docs/production-animation-cycle-remediation-prompts.ru.md.
Сделай project model parity и transaction layer.
После выполнения:
- запусти pnpm --filter @bones/editor test;
- запусти pnpm --filter @bones/editor typecheck;
- запусти pnpm rc:smoke;
- проверь browser smoke import/export roundtrip;
- сделай отдельный commit.
```
