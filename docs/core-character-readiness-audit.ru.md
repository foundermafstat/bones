# Аудит готовности Bones относительно основного элемента

Дата: 2026-06-21

## Допущение

Под "основным элементом" в этом аудите понимается главный продуктовый объект из `doc.md`: живой векторный силуэтный персонаж `PlayerRig`, который собирается из костей и векторных/procedural частей, сохраняется в JSON, компилируется и проигрывается в PixiJS 8 runtime.

Если под основным элементом имелся в виду не персонаж/rig, а редактор целиком или конкретный milestone, оценку нужно пересчитать.

## Короткий вывод

Система уже прошла уровень технического прототипа и имеет рабочий вертикальный срез:

```txt
source JSON -> schema validation -> compiler -> compiled JSON -> Pixi runtime -> sample character fixture
```

Относительно основного элемента Bones готов примерно на **60-65% как runtime/формат персонажа** и примерно на **35-40% как полноценный production-инструмент создания этого персонажа в редакторе**.

Главная сильная сторона: core runtime уже умеет строить Pixi hierarchy, рендерить части, сэмплить анимации, переключать состояния, применять procedural layers, constraints/Foot IK prototype, mesh deform и animation events.

Главный риск: editor пока выглядит шире, чем его production-глубина. Большая часть авторинга еще не является полноценным DCC-процессом: инструменты Rig/Shape/Timeline/Curve/State Machine/Procedural существуют, но требуют доведения до интерактивного редактирования, надежной визуальной проверки и production import/export flow.

## Что проверено

- `doc.md`: разделы с главной идеей, требованиями, архитектурой и MVP.
- `implementation-milestones.md`: этапы 1-25 и порядок развития.
- `package.json`, package scripts и workspace layout.
- `packages/schema/src/types.ts`, `packages/schema/src/validate.ts`.
- `packages/compiler/src/compiler.ts`, `packages/compiler/src/types.ts`.
- `packages/vector-core/src/path.ts`.
- `packages/runtime-pixi/src/RigLoader.ts`, `RigInstance.ts`, `PixiPartRenderer.ts`, `AnimationSampler.ts`, `AnimationMixer.ts`, `RuntimeStateMachine.ts`, `ProceduralLayers.ts`, `types.ts`.
- `packages/runtime-pixi/fixtures/shadow-hero.compiled.json`.
- `apps/editor/app/page.tsx`, `editorSourceProject.ts`, `projectIo.ts`.
- `packages/ldtk-adapter/src/index.ts`, `packages/platformer-preview/src/index.ts`.
- `docs/release-candidate.md`, `docs/production-readiness-plan.md`.

Целевой runtime test был запущен напрямую через уже собранные `dist`:

```txt
node --test packages/runtime-pixi/tests/*.test.mjs
39 tests, 39 pass
```

Обычный `pnpm` из PATH не работает: shim ссылается на отсутствующий `@pnpm/exe`. Встроенный Codex `pnpm` попытался перейти в install/deps-status flow и был остановлен, чтобы не менять `node_modules` без подтверждения.

## Готовность по слоям

| Слой | Оценка | Статус |
| --- | ---: | --- |
| Monorepo/package boundaries | 90% | Нужные пакеты есть, runtime отделен от React/DOM, editor отдельно. |
| Source schema | 75% | Типы и валидация покрывают rig, bones, parts, animations, poses, state machines, refs, events, preview. |
| Compiler | 70% | Есть deterministic numeric ids, packed transforms, track/state machine compilation, lookups. |
| Runtime rig hierarchy | 80% | `RigInstance` строит Pixi `Container` hierarchy, применяет transforms, draw order, visibility/opacity. |
| Vector rendering | 65% | Path/procedural/mesh/svg rendering есть; SVG parsing в runtime остается production-риском. |
| Animation runtime | 70% | Sampling, mixer, crossfade, layers, blend tree, events работают и покрыты тестами. |
| Procedural life | 45% | Breathing, secondary motion, squash/stretch есть как runtime prototype; authoring/compiled contract неполный. |
| Foot IK / constraints | 45% | Есть prototype с raycast world и тестами, но это еще не production IK для реальных уровней. |
| First character fixture | 65% | `shadow-hero.compiled.json`: 16 bones, 15 parts, 5 clips, 1 state machine, 4 states, 4 transitions. |
| Editor authoring | 35% | UI широкий, есть commands/store/import/export, но основные режимы еще не полноценные инструменты. |
| LDtk/platformer preview | 40% | Parser/controller helpers есть, но полноценный editor preview/game loop не закрыт. |
| Release readiness | 40% | Есть RC-док, smoke contract и sample artifacts, но full verification не подтверждена в текущем окружении. |

## Что уже реально работает

1. **Canonical формат не пустой.**
   `RigProject` описывает schemaVersion, runtimeTarget, rigs, bones, parts, animations, poses, stateMachines, proceduralPresets и preview. Валидация проверяет root bone, parent refs, part refs, track refs, pose refs, state/transition refs, parameters, events и markers.

2. **Компилятор уже выполняет ключевую роль.**
   `compileRig()` валидирует source project, выбирает rig, строит lookup tables, пакует bone/part transforms, компилирует tracks, keyframes, events и state machine в numeric runtime format.

3. **Runtime уже является настоящим runtime, а не заглушкой.**
   `RigInstance.update()` выполняет последовательность: state machine -> mixer/crossfade/blend tree -> base sample -> procedural layers -> constraints -> events. Это важное отличие от более раннего состояния, описанного в старом `docs/production-readiness-plan.md`.

4. **Есть проверенный sample персонаж.**
   `shadow-hero.compiled.json` содержит полный небольшой character fixture с телом, конечностями, плащом, клипами `idle/walk/jump/fall/land` и state machine. Тесты подтверждают rendering fixture и state machine coverage.

5. **Editor уже связан с source JSON.**
   `editorSourceProject.ts` умеет конвертировать внутреннее состояние редактора в `RigProject` и обратно. `projectIo.ts` умеет создать export bundle, включая `hero.compiled.json`.

6. **Runtime не зависит от React/Next.js.**
   Это соответствует границам проекта: `packages/runtime-pixi` использует Pixi и внутренние пакеты, а editor живет отдельно в `apps/editor`.

## Главные недоработки относительно основного элемента

### 1. Персонаж можно проиграть, но еще нельзя надежно производить в editor

Core runtime уже достаточно силен, но editor authoring не дотягивает до продукта из `doc.md`. В UI есть режимы Rig, Shape, Pose, Timeline, Curve, State Machine, Procedural и Preview, но значительная часть действий выглядит как кнопочные команды/демо-панели, а не как полноценный визуальный инструмент:

- нет production-grade canvas handles для bones/pivots/parents;
- Shape Mode еще не полноценный Bezier/path editor;
- Timeline/Dopesheet не является полноценным редактированием клипов;
- Curve editor не выглядит завершенным graph editor;
- State Machine editor не является полноценным visual graph;
- Procedural editor не закрывает live-настройку всех слоев через source/compiled/runtime pipeline.

Итог: основной элемент как runtime asset уже есть, но основной элемент как удобно создаваемый asset еще не готов.

### 2. Runtime допускает SVG path в gameplay

`PixiPartRenderer` умеет `SVGParser(part.svg.source)`. Для production это опасно:

- SVG parsing тяжелее и менее контролируемо, чем заранее скомпилированный internal path/mesh;
- сложнее гарантировать mobile performance;
- сложнее обеспечить одинаковое поведение editor/game;
- `doc.md` явно ведет к JSON-first и легкому runtime.

SVG стоит оставить как import/editor source, но gameplay compiled fixture должен использовать path/procedural/mesh без runtime SVG parsing.

### 3. Procedural layers и Foot IK пока ближе к prototype

Есть breathing, secondary motion, squash/stretch и constraints, но product target требует более богатую реакцию персонажа на скорость, приземление, склон, стену, foot lock и pose overlap.

Текущий уровень достаточен для доказательства архитектуры, но не для финального "живого силуэта":

- procedural config передается через runtime options, а не полностью живет в compiled JSON contract;
- secondary motion работает на transform offsets, но не закрывает художественный контроль плаща/волос;
- Foot IK требует реальной интеграции с preview/game collision world;
- нужны визуальные тест-сцены на slopes, moving platforms, wall slide, jump/fall/land.

### 4. State machine runtime есть, но authoring еще слабый

Runtime controller поддерживает transitions, priority, canInterrupt, conditions, timeInState и 1D blend tree. Но production-ценность будет только после visual authoring:

- параметры должны редактироваться в UI;
- transitions должны быть видны как graph;
- preview должен показывать active state/transition/blend weights;
- export должен гарантированно попадать в source JSON и compiled JSON.

### 5. Валидация сильная, но compiled/runtime contract еще надо закрыть жестче

Source validation уже неплохая. Следующий уровень:

- отдельная runtime validation для compiled JSON, а не только `runtimeTarget` + наличие arrays;
- запрет/предупреждение для SVG в production compiled output;
- проверка соответствия state machine ids/clip ids в runtime input;
- snapshot tests для compiled fixture;
- versioned migrations не только для source/editor, но и для compiled compatibility.

### 6. Performance readiness пока не доказана

Хорошие признаки уже есть: packed transforms, cached sampling, GraphicsContext reuse, mesh vertex reset/update, profiler primitives. Но production mobile readiness пока не доказана:

- нет full-frame profiling на реальной Pixi scene;
- нет allocation budget;
- нет автоматической visual/performance smoke проверки editor preview;
- нет подтвержденного `pnpm rc:smoke` в текущем окружении;
- SVG parsing в runtime может сломать performance target.

## Сравнение с milestones

Фактически закрыто или почти закрыто:

- 1. Monorepo foundation.
- 2. Schema v1 and source JSON model.
- 3. Vector path core, на уровне core операций.
- 4. Compiled JSON format and compiler baseline.
- 5. Runtime skeleton and loader.
- 6. PixiJS vector rendering, кроме production SVG policy.
- 7. Animation clip sampling.
- 8. Animation mixer and blending, базово.
- 9. Runtime state machine.
- 10. Procedural animation layers, prototype.
- 11. Constraints and Foot IK prototype.
- 12. First character compiled fixture, базово.
- 13. Editor application shell.
- 14. Editor state, commands, undo/redo, частично.

Частично начато, но не production-ready:

- 15. Rig Mode editor.
- 16. Shape Mode editor.
- 17. Pose Mode and pose library.
- 18. Timeline and dopesheet.
- 19. Curve Mode and Graph Editor.
- 20. State Machine editor.
- 21. Procedural Mode editor.
- 22. LDtk platformer preview.
- 23. Import/export/persistence.
- 24. Performance hardening.
- 25. Release candidate package.

## Блокеры до production-ready основного элемента

1. **Сделать editor preview строго через compiled runtime.**
   Авторинг должен проверять тот же результат, который потом увидит игра.

2. **Убрать runtime SVG из production path.**
   SVG должен импортироваться и конвертироваться в internal path/mesh до runtime.

3. **Довести Rig + Shape до настоящего authoring minimum.**
   Минимум: создать bone, изменить parent/pivot/transform, создать/редактировать path/procedural part, bind to bone, save/load без потерь.

4. **Довести Timeline + State Machine до authoring minimum.**
   Минимум: создать клип, track/keyframes, transition conditions, preview transitions, export source+compiled.

5. **Зафиксировать procedural/IK как часть source/compiled contract.**
   Сейчас это работает runtime-слоем, но должно стать стабильной частью authoring/export.

6. **Собрать визуальный smoke.**
   Нужна проверка: editor canvas показывает персонажа, preview проигрывает idle/walk/jump/fall/land, export bundle компилируется, runtime fixture рендерится.

## Рекомендуемый следующий этап

Самый полезный следующий шаг: **закрыть production vertical slice для одного персонажа**, не расширяя редактор во все стороны.

Минимальная цель:

```txt
Editor current project
  -> canonical source JSON
  -> compileRig()
  -> RigInstance in Pixi preview
  -> idle/walk/jump/fall/land playback
  -> export source + compiled JSON
```

Критерий готовности:

- редактор показывает не отдельную демо-модель, а результат compiled runtime;
- `shadow-hero` можно изменить в Rig/Shape/Timeline минимум на одном bone/part/track;
- изменение сохраняется в source JSON;
- compiled JSON после export проигрывается тем же runtime;
- runtime path не использует SVG parsing для production fixture.

## Риски и предположения

- Аудит не запускал полный workspace build/test из-за economy mode и проблем с локальным `pnpm`.
- Runtime tests запускались напрямую по текущему `dist`; это проверяет текущие собранные артефакты, но не заменяет `pnpm rc:smoke`.
- `docs/production-readiness-plan.md` частично устарел: там описаны некоторые проблемы, которые уже закрыты в текущем `RigInstance.update()`.
- Оценка готовности дана относительно персонажа/rig как основного элемента. Для оценки "готовности редактора как продукта" процент ниже.
