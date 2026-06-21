# Bones Production Readiness Plan

Дата: 2026-06-21

Основание: `doc.md` как source of truth, `implementation-milestones.md` как staged order, текущая реализация в `apps/editor` и `packages/*`.

## Текущий статус

Bones уже имеет рабочий монорепозиторий с пакетами `schema`, `vector-core`, `compiler`, `runtime-pixi`, `ldtk-adapter`, `platformer-preview` и Next.js editor shell. В runtime есть базовая загрузка compiled rig, Pixi `Container` hierarchy, static part rendering, animation sampling, mixer, state machine controller, procedural layer prototypes, foot IK prototype и profiler primitives. В editor есть shell, hierarchy, inspector, timeline placeholder, command pattern, localStorage draft и Pixi preview из текущего in-memory проекта.

До production система пока не дошла: editor state не соответствует canonical source JSON, runtime pipeline не объединяет state machine, mixer, procedural layers и constraints в `RigInstance.update()`, SVG assets используются как preview-прототип, export/import не склеены с schema/compiler, Shape/Timeline/Curve/State Machine/Procedural/LDtk modes в основном представлены UI-заглушками.

## 25 доработок до production

1. **Свести editor model к canonical source JSON**
   Текущий `EditorProjectState` в `apps/editor/app/editorState.ts` живёт отдельно от `RigProject` из `packages/schema`. Нужно ввести единый source-project adapter или заменить editor state на schema-compatible модель с `schemaVersion`, `runtimeTarget`, `rigs`, `animations`, `poses`, `stateMachines`, editor metadata.

2. **Закрыть schema gaps**
   `packages/schema` уже валидирует базовые rigs, parts, tracks, poses и state machines. Нужно добавить недостающие поля из `doc.md`: `projectId/defaultFrameRate/units`, `fill.type`, `local` naming consistency, animation `events/markers/rootMotion/tags`, transition `easing/syncMode`, procedural presets, preview settings, migrations.

3. **Усилить cross-reference validation**
   Валидация должна проверять не только форму JSON, но и связи: track target exists, state clip exists, pose bone exists, duplicate ids, циклы в bone hierarchy, root uniqueness, invalid parent graph, part shape payload matches `type`.

4. **Стабилизировать source-to-compiled contract**
   `packages/compiler` уже пакует ids и transforms. Нужно сделать deterministic compiled output contract: stable ordering, strict source validation before compile, compile errors with source paths, schema for compiled JSON, versioned migrations, snapshot fixtures.

5. **Сделать compiled runtime единственным gameplay input**
   Editor preview сейчас строит rig напрямую из `EditorProjectState` и SVG sprites. Production preview должен идти через `source JSON -> compiler -> compiled JSON -> runtime-pixi`, чтобы editor и game видели один и тот же результат.

6. **Интегрировать runtime execution order в `RigInstance.update()`**
   Сейчас `RigInstance.update()` применяет default transforms, а mixer/state machine/procedural/constraints существуют отдельно. Нужно реализовать порядок из `doc.md`: params -> state machine -> clip/blend tree -> transition blending -> additive/procedural -> IK -> final transforms -> mesh updates -> events.

7. **Подключить `AnimationMixer` к state machine**
   `RuntimeStateMachineController` выбирает state/clip, но не управляет mixer. Нужно связать transitions, crossfade duration, phase matching, blend tree output и active animation layers с `AnimationMixer`.

8. **Довести animation sampling до production**
   Сэмплер поддерживает linear/step/hold/bezier и shortest rotation. Нужно добавить track lookup hot path без `find`, preallocated sample buffers, typed arrays, part/deform/procedural/gameplay tracks, event sampling, normalized loop boundary behavior.

9. **Реализовать полноценные animation events**
   `doc.md` требует footstep, dust, attack windows, land events. Нужно хранить events в source/compiled JSON, сэмплить их при update, очередь событий в runtime и подписку `hero.on("animationEvent", ...)`.

10. **Перевести SVG-прототип в editable vector parts**
    Asset pack полезен для старта, но production не должен зависеть от SVG parsing/texture import в gameplay. Нужно импортировать SVG в internal `path` или `mesh`, сохранять path commands, уметь редактировать точки и компилировать в GraphicsContext/mesh.

11. **Доделать `vector-core` для editor-grade shape editing**
    Сейчас есть path parsing/normalize/mirror/reverse/smooth/factories. Нужны Bezier handle operations, point insert/delete, sharp/smooth conversion, path hit testing, bounding boxes, pivot calculation, boolean-like overlap preview, SVG importer beyond simple path data.

12. **Сделать Shape Mode реальным инструментом**
    В UI сейчас есть только команды-заглушки. Нужно canvas interaction: pen tool, select/move points, handles, mirror, simplify/smooth, bind to bone, set pivot, draw order, live fill preview, save/load without loss.

13. **Сделать Rig Mode production-ready**
    Нужны interactive bone handles, local/world transform, parent reassignment, pivot editing, mirror groups, tags, draw order, default pose, facing direction, locked/hidden metadata и корректный undo/redo для всех операций.

14. **Расширить command system**
    Базовые commands есть, но часть операций shallow/placeholder. Нужно покрыть все editor mutations command pattern-ом, добавить transaction/grouped commands, selection-aware undo, dirty scopes, autosave throttling, regression tests для do/undo/redo.

15. **Сделать Pose Mode и pose library**
    Сейчас poses статичны и применяются кнопкой. Нужны create/rename/duplicate/mirror/copy/paste pose, pose tags, transforms/deforms/part props, undoable application, стартовая библиотека `idle`, `walk`, `jump`, `fall`, `land`, `turn`, `wall_slide`.

16. **Реализовать Timeline/Dopesheet**
    Текущий timeline визуально показывает несколько строк, но не редактирует клипы. Нужны clip CRUD, tracks, keyframes, auto-key, snapping, move/scale/delete/copy/paste keys, loop preview, markers/events, retime/reverse/normalize loop.

17. **Реализовать Curve/Graph Editor**
    Нужно уйти от механической linear-анимации: value curves, bezier handles, presets `easeIn/easeOut/easeInOut/spring/overshoot/anticipation`, preview transition A/B, tangent editing и сохранение в source/compiled JSON.

18. **Сделать State Machine editor**
    В runtime есть controller, но editor graph отсутствует. Нужен визуальный graph states/transitions, conditions, priorities, canInterrupt, duration, easing, syncMode, parameter panel, locomotion 1D blend tree editor и live preview.

19. **Довести procedural layers**
    Runtime prototypes есть, editor показывает только параметры. Нужно source/compiled procedural schema, UI для breathing/secondary/squash/foot IK, применение в preview, trigger rules для jump/land, velocity/gravity/wind, max offsets, persistence.

20. **Довести Foot IK и constraints**
    `ConstraintSolver` работает с fake world params, но не интегрирован с actual bone world transforms. Нужны world transform extraction, raycast adapter, grounded gating, jump/fall disable, foot lock, normal rotation, blend, tests на неровные поверхности.

21. **Реализовать mesh deformation для плаща/волос**
    `PixiPartRenderer` создаёт mesh, но dynamic vertex update pipeline отсутствует. Нужны mesh authoring/import, runtime vertex deformation, secondary motion на вершины, quality presets, no per-frame shape rebuild.

22. **Собрать LDtk platformer preview**
    `ldtk-adapter` парсит часть entities, `platformer-preview` имеет простой controller. Нужно загрузка LDtk файла в editor, colliders/spawn/light/moving platforms/death/wall zones, camera, keyboard/touch input, collision debug, animation state debug.

23. **Завершить import/export/persistence**
    `projectIo.ts` сохраняет localStorage draft в editor-specific формате. Нужно native project open/save, export `hero.rig.json`, `hero.animations.json`, `hero.state-machine.json`, `hero.compiled.json`, import source JSON/SVG, validation errors in UI, migration path.

24. **Провести performance hardening**
    Нужны typed arrays for transforms, object pools/events, no allocations in runtime hot paths, precompiled curves/lookups, no SVG parsing in gameplay, LOD presets, mobile quality settings, strategic render groups, virtualized timeline, profiler overlay with real measurements.

25. **Собрать release candidate package**
    Нужны docs по JSON formats, runtime API, editor workflow, migration guide, known limitations, example PixiJS platformer integration, sample LDtk room, sample character project, smoke/focused regression tests и visual quality checklist из `doc.md`.

## Рекомендуемый порядок

Сначала закрыть contract pipeline: schema/source model -> compiler -> runtime update loop -> editor preview через runtime. После этого строить полноценные editor modes. Иначе есть риск улучшать UI вокруг временной модели, которую всё равно придётся заменить.

Минимальный production вертикальный срез:

```txt
source JSON
  -> schema validation
  -> compiled JSON
  -> runtime RigInstance.update(params)
  -> editor preview
  -> export compiled demo
```

После этого можно безопасно расширять Shape/Timeline/Curve/State Machine/Procedural/LDtk без расхождения редактора и runtime.
