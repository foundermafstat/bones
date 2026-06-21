# Silhouette Rig Studio: 25 implementation milestones

Документ разбивает полную реализацию из `doc.md` на 25 последовательных этапов. Каждый этап оформлен как промт для отдельной реализации. Этапы идут от доказательства runtime-формата к редактору, preview, оптимизации и выпуску продукта.

## 1. Monorepo foundation

Промт:

Создай базовую структуру проекта Bones как TypeScript monorepo без реализации бизнес-логики. Нужны рабочие пакеты `apps/editor`, `packages/runtime-pixi`, `packages/schema`, `packages/compiler`, `packages/vector-core`, `packages/ldtk-adapter`, `packages/platformer-preview`. Настрой единый TypeScript, lint/build scripts, package exports и минимальные index-файлы. Не добавляй лишние фреймворки сверх редактора на React/Next.js и runtime на PixiJS 8. Результат этапа: проект устанавливается, пакеты типизируются, editor запускается как пустое приложение, runtime пакет собирается как чистая TypeScript-библиотека без React/DOM зависимости.

Проверка результата: targeted build/typecheck для созданных пакетов, открытие пустого editor shell.

## 2. Schema v1 and source JSON model

Промт:

Реализуй пакет `packages/schema` с версионированными типами и JSON Schema для source-формата редактора: `RigProject`, `RigDefinition`, `BoneDefinition`, `PartDefinition`, `Transform2D`, `AnimationClip`, `AnimationTrack`, `Keyframe`, `AnimationStateMachine`, `PoseDefinition`, procedural presets и editor metadata. Добавь runtime target `pixi-v8`, `schemaVersion`, базовые validators и понятные ошибки валидации. Формат должен быть человекочитаемым, удобным для Git и миграций. Не реализуй compiled format на этом этапе, только source JSON.

Проверка результата: unit tests валидируют минимальный проект, проект с rig/animation/stateMachine и несколько invalid cases.

## 3. Vector path core

Промт:

Реализуй `packages/vector-core` для внутреннего path-формата `M/L/Q/C/Z`: модели команд, парсер/нормализатор, проверку closed/open paths, reverse/mirror path, normalize direction, упрощение и smoothing как безопасные операции. Добавь shape factory для procedural tapered limb, базовых органических форм и conversion helpers для PixiJS Graphics commands без привязки к React. SVG пока поддержи только как импортируемый внешний источник через модель, без полноценного UI.

Проверка результата: unit tests для path normalization, mirror, direction, tapered limb generation и корректной сериализации.

## 4. Compiled JSON format and compiler baseline

Промт:

Создай `packages/compiler` и compiled JSON v1. Source JSON должен компилироваться в компактный runtime format: numeric ids, flattened bone arrays, packed transform channels, prebuilt track lookup, pre-parsed curve data, state machine lookup и stripped editor metadata. Добавь `compileRig`, `validateProject`, `flattenKeyframes`, `optimizeCurves`, `buildLookupTables`. Не оптимизируй преждевременно, но API должен быть стабильным для runtime.

Проверка результата: fixture source project компилируется в deterministic compiled JSON, invalid source не компилируется с понятной ошибкой.

## 5. Runtime skeleton and loader

Промт:

Реализуй первый вертикальный срез `packages/runtime-pixi`: `RigLoader`, `RigInstance`, базовые runtime структуры костей/частей, загрузку compiled JSON и создание PixiJS `Container` hierarchy. Runtime не должен зависеть от React, Next.js или DOM API. Пока достаточно построить кости и пустые containers, применить default transforms и поддержать `update(dt, params)` без анимации.

Проверка результата: runtime test создает `RigInstance` из compiled fixture, проверяет иерархию containers и default transforms.

## 6. PixiJS vector rendering

Промт:

Добавь rendering static vector parts в `runtime-pixi`: `GraphicsContext` reuse для path/procedural/svg-converted parts, `Graphics` instances внутри bone containers, zIndex/draw order, fill/opacity/pivot/local transform. Mesh-поддержку пока заложи интерфейсом, но реализуй только простейший mesh part без cloth physics. Важно: не перерисовывать статические формы каждый frame.

Проверка результата: fixture персонаж с body/head/limbs отображается в PixiJS, повторный update меняет только transforms, а не пересоздает GraphicsContext.

## 7. Animation clip sampling

Промт:

Реализуй sampling `AnimationClip`: tracks для bone transform, part properties, visibility, zIndex, deform/proceduralParam как расширяемые каналы. Поддержи keyframes с interpolation `linear`, `step`, `hold`, базовый `bezier`; rotation интерполируй через shortest angle. Добавь normalized time, loop/non-loop playback и deterministic sampling без allocations в hot path насколько это возможно.

Проверка результата: unit tests проверяют значения transform tracks на разных временах, loop boundaries и shortest angle rotation.

## 8. Animation mixer and blending

Промт:

Реализуй `AnimationMixer`: crossfade между клипами, additive layers, partial body masks, normalized transition weight, phase matching для walk/run на базовом уровне. Добавь layer model: base, breathing/additive, impact, look/aim placeholder, IK placeholder. Результат должен устранять резкие щелчки между idle/walk/run/jump/fall/land.

Проверка результата: tests для blend weight, additive application, masked blending и phase matched transition.

## 9. Runtime state machine

Промт:

Реализуй `StateMachine` в runtime: states с `clipId` или blend tree, transitions с duration/easing/conditions/priority/canInterrupt/syncMode, parameters из платформерного контроллера. Поддержи operators для чисел/boolean/string и корректный `timeInState`. Добавь 1D locomotion blend tree по `absSpeed`: idle/walk/run.

Проверка результата: tests для transitions idle->walk->run, jump/fall/land, priorities, interrupt behavior и 1D blend tree output.

## 10. Procedural animation layers

Промт:

Реализуй procedural layer stack: breathing, squash/stretch, secondary motion для cloak/hair, landing impact. Слои должны применяться после base/transition blending и до constraints/IK. Параметры берутся из compiled JSON и `AnimationParameters`. Secondary motion должен учитывать velocity, damping, stiffness, gravity/wind influence и max offset. Не делай AAA cloth simulation.

Проверка результата: tests или visual fixture подтверждают breathing idle, squash на jump/land и cloak lag при изменении velocity.

## 11. Constraints and Foot IK prototype

Промт:

Добавь `ConstraintSolver` и Foot IK prototype: raycast adapter interface, feet config, maxCorrection, blend, rotation by surface normal, enable only when grounded, disable in jump/fall. Solver не должен ломать основную walk animation, а только мягко корректировать foot/shin/thigh bones. API collision world должен быть абстрактным, чтобы LDtk preview и игра могли дать свою реализацию.

Проверка результата: tests с fake raycast world проверяют foot correction, blend, grounded gating и отсутствие коррекции в воздухе.

## 12. First character compiled fixture

Промт:

Создай минимального первого персонажа по документу: body, head, front/back arms, front/back legs, feet, cloak. Используй органические tapered shapes, перекрытия частей и одноцветную заливку силуэта. Добавь клипы `idle`, `walk`, `jump`, `fall`, `land`, базовую state machine и compiled fixture. Цель не художественный финал, а доказательство, что JSON -> runtime -> PixiJS выглядит живо и не как палочная марионетка.

Проверка результата: demo scene проигрывает idle/walk/jump/fall/land, персонаж читается на светлом и темном фоне.

## 13. Editor application shell

Промт:

Собери `apps/editor` как браузерный visual editor shell: top toolbar, left hierarchy panel, central PixiJS canvas, right inspector, bottom timeline area. Добавь режимы Rig, Shape, Pose, Timeline, Curve, State Machine, Procedural, Preview как навигацию без полной реализации. Подключи project store и загрузку sample source JSON. Не делай landing page.

Проверка результата: editor запускается, показывает layout, canvas, hierarchy и переключение режимов без ошибок.

## 14. Editor state, commands, undo/redo

Промт:

Реализуй editor state отдельно от runtime state: project store, selection store, viewport state, dirty flags, autosave draft, command pattern undo/redo. Команды: move/rotate bone, edit path point, add/delete keyframe, change curve, create transition, rename animation. Все будущие editor modes должны изменять проект только через commands.

Проверка результата: targeted tests для command do/undo/redo и dirty flags; UI buttons undo/redo работают на простом изменении bone transform.

## 15. Rig Mode editor

Промт:

Реализуй Rig Mode: создание/удаление/переименование bones, parent change, pivot move, local/world transform display, mirror group, tags, draw order, default pose и facing direction. В canvas должны быть overlays bones/pivots/selection handles. Inspector редактирует transform и metadata. Все операции проходят через command system.

Проверка результата: пользователь может собрать skeleton первого персонажа, сохранить source JSON и снова загрузить без потери иерархии.

## 16. Shape Mode editor

Промт:

Реализуй Shape Mode для path/procedural parts: Pen tool, Bezier handles, sharp/smooth points, simplify/smooth path, mirror path, normalize direction, set pivot from selection, bind shape to bone, preview fill, silhouette overlap overlay, reusable part preset export. SVG import можно ограничить простыми paths с конвертацией во внутренний path.

Проверка результата: пользователь создает органическую tapered limb форму, привязывает к bone, сохраняет/загружает проект и видит тот же силуэт.

## 17. Pose Mode and pose library

Промт:

Реализуй Pose Mode: создание, переименование, применение, дублирование, mirror pose, copy/paste pose и хранение `PoseDefinition` с transforms/deforms/tags. Добавь библиотеку стартовых поз: idle neutral, breath in/out, walk contacts, jump start/peak, fall fast, land heavy, turn, wall slide. Pose application должна быть undoable.

Проверка результата: позы применяются к rig, сохраняются в source JSON и используются как основа для keyframes.

## 18. Timeline and dopesheet

Промт:

Реализуй Timeline Mode: animation clips, tracks, keyframes, auto-key, play/pause, loop preview, frame snapping, add/delete/move/scale selected keys, copy/paste keys, copy/paste pose, reverse animation, retime clip, normalize loop, events/markers. Dopesheet должен быть виртуализируемым для больших проектов. На этом этапе достаточно basic interpolation UI без полноценного graph editor.

Проверка результата: пользователь создает idle/walk/jump clip, ставит transform keys, проигрывает preview и сохраняет animation source JSON.

## 19. Curve Mode and Graph Editor

Промт:

Реализуй Curve Mode: graph editor для value curves, interpolation presets `linear`, `easeIn`, `easeOut`, `easeInOut`, `cubicBezier`, `stepped`, `spring`, `overshoot`, `anticipation`, custom. Поддержи редактирование bezier handles, tangentIn/tangentOut, preview transition from state A to state B. Цель: убрать механическую линейность анимации.

Проверка результата: пользователь меняет jump/land curves, runtime preview отражает anticipation, overshoot и мягкий возврат.

## 20. State Machine editor

Промт:

Реализуй визуальный State Machine Mode: graph states, transitions, conditions, duration, easing, priority, canInterrupt, syncMode, preview button. Добавь parameters panel для speed/absSpeed/velocity/grounded/jump/facing/wallContact/timeInState. Поддержи locomotion 1D blend tree editor для idle/walk/run. Экспорт должен попадать в source JSON и compiled JSON.

Проверка результата: пользователь настраивает idle/walk/run/jump/fall/land transitions и preview показывает мягкие переходы.

## 21. Procedural Mode editor

Промт:

Реализуй Procedural Mode: UI для breathing, cloak/hair secondary motion, squash/stretch, foot IK. Добавь controls для frequency/amplitude, affected bones, stiffness/damping/velocity/gravity/wind, landing impact rules, IK feet settings. Все параметры должны сразу влиять на runtime preview и сохраняться как procedural presets.

Проверка результата: пользователь включает breathing, cloak lag, landing squash и foot IK; compiled runtime воспроизводит то же поведение.

## 22. Platformer preview and LDtk adapter

Промт:

Реализуй `packages/ldtk-adapter` и `packages/platformer-preview`: загрузка LDtk test level, parsing colliders, spawn points, light emitters, moving platforms, death zones, wall jump surfaces, camera zones, animation test triggers. В editor Preview Mode добавь platformer controller, keyboard/touch joystick simulator, collision debug, animation state debug и camera. Редактор не должен становиться level editor.

Проверка результата: персонаж бегает/прыгает/падает/приземляется/wall-slides в LDtk preview сцене, state debug показывает активные состояния.

## 23. Import, export, persistence, migrations

Промт:

Заверши project IO: локальное сохранение/загрузка source JSON, экспорт `hero.rig.json`, `hero.animations.json`, `hero.state-machine.json`, экспорт `hero.compiled.json`, schema validation before export, миграции между schemaVersion, понятные ошибки пользователю. Добавь import SVG/simple source JSON/compiled preview where appropriate. Runtime в игре должен использовать compiled JSON, editor source JSON.

Проверка результата: проект сохраняется локально, перезагружается, компилируется, validated export подключается к standalone PixiJS demo.

## 24. Performance, mobile quality presets, profiler

Промт:

Проведи целевую оптимизацию runtime/editor: 0 allocations per frame в hot paths где реально возможно, typed arrays для transforms, object pools for events, precompiled curves/lookups, no SVG parsing during gameplay, no full redraw each frame, LOD presets, mobile quality presets low/medium/high, strategic render groups, editor dirty flags, throttled autosave, virtualized timeline. Добавь profiler overlay для runtime и editor preview.

Проверка результата: demo работает на desktop и mobile web settings, profiler показывает стабильный update/render cost, статические vector parts не пересоздаются каждый frame.

## 25. Product hardening, docs, examples, release candidate

Промт:

Собери release candidate качественного продукта: документация по формату JSON, runtime API, editor workflow, known limitations, migration guide, example PixiJS platformer integration, example LDtk test room, sample character project, smoke tests и focused regression tests. Проверь character quality checklist: idle breathing, walk/run weight transfer, jump anticipation, fall reaction, land squash/dust event, cloak/hair secondary motion, silhouette readability. Не расширяй scope до Spine replacement, server, marketplace, complex mesh skinning всего тела или экспорта в десятки форматов.

Проверка результата: новый пользователь может открыть editor, загрузить sample project, изменить rig/animation, экспортировать compiled JSON и запустить его в example PixiJS platformer.
