# Smoke: editor-сценарий Bones

Дата обновления: 2026-06-22
URL: `http://localhost:3000/`

Цель: быстро проверить полный happy path редактора без установки новых зависимостей и без изменения production bundle.

## Предусловия

- Dev server editor запущен на `http://localhost:3000/`.
- В браузере открыта свежая вкладка editor.
- Console не содержит ошибок приложения. Ошибки расширений браузера не учитывать.

## Шаги

1. App loads
   - Открыть `http://localhost:3000/`.
   - Проверить, что видны mode tabs, viewport Pixi preview, Hierarchy, Inspector, Timeline.
   - Нет framework error overlay.

2. New Project
   - `Project -> New Project`.
   - Проверить статус `new empty project` или пустой проект без crash.
   - `Project -> Load Sample`, чтобы продолжить smoke на sample.

3. Rig: Add Bone
   - Mode `Rig`.
   - В `New bone id` ввести `smokeBone`.
   - Нажать `Add bone`.
   - Проверить, что `smokeBone` появился в Hierarchy и может быть выбран.

4. Rig: Transform
   - Для выбранной кости изменить `X` или `Rotation` в inspector.
   - Проверить, что `Last command` обновился и project стал `Dirty`.

5. Shape: Add SVG Part
   - Mode `Shape`.
   - В `New SVG part id` ввести `smokeSvg`.
   - Выбрать bone `smokeBone` или `head`.
   - Нажать `Add SVG Part`.
   - Проверить, что part появился в Parts panel.

6. Shape: Vectorize
   - Выбрать SVG part.
   - Нажать `Vectorize`.
   - Проверить, что summary показывает path conversion и part стал path-editable.

7. Timeline: Clip / Track / Key
   - В `New clip id` ввести `smokeWalk`.
   - Duration `1`, Loop on.
   - Нажать `Create Clip`.
   - Target bone `body`, property `scaleY`.
   - Нажать `Add Track`.
   - Добавить keyframes:
     - `0 -> 1`
     - `0.5 -> 1.1`
     - `1 -> 1`
   - `Project -> Copy Source JSON`.
   - Проверить в JSON: `animations[].id === "smokeWalk"` и track `body / transform.scaleY` содержит 3 keyframes.
   - Shift-click выбрать два keyframes на разных tracks.
   - Drag одного выбранного keyframe по timeline.
   - Проверить, что оба selected keyframes сдвинулись вместе, а Undo возвращает оба времени.

8. Curve
   - Mode `Curve`.
   - Выбрать keyframe из `body.scaleY`.
   - Set curve fields: `0.2, 0.8, 0.2, 1`.
   - `Project -> Copy Source JSON`.
   - Проверить, что keyframe содержит `interpolation: "bezier"` и `curve: [0.2,0.8,0.2,1]`.

9. State Machine
   - Mode `State Machine`.
   - Проверить, что в viewport виден `State Machine Graph`.
   - Кликнуть state node и проверить, что выбранный state синхронизируется с inspector controls.
   - Кликнуть transition label и проверить preview `from -> to / weight`.
   - Нажать weight `0.0`, `0.5`, `1.0` и проверить live preview weight.
   - From `idle`, to `jump`.
   - Duration `0.12`, easing `anticipation`, syncMode `none`.
   - Condition `jumpPressed == true`.
   - Нажать `Create Transition`.
   - Нажать `Export Bundle`.
   - Проверить clipboard bundle:
     - `hero.source.rig.json` содержит transition `idle-jump`;
     - `hero.compiled.json` парсится и содержит numeric transition.

10. Procedural
    - Mode `Procedural`.
    - Set `Breathing amplitude` to `1.5`.
    - Set `Foot IK feet` to `footFront, footBack`.
    - Нажать `Apply Feet`.
    - `Project -> Copy Source JSON`.
    - Проверить `proceduralPresets`: breathing amplitude `1.5`, foot IK enabled with both feet.

11. Preview
   - Mode `Preview`.
   - Нажать `idle`, `walk`, `jump`, `fall`, `land`.
   - Проверить debug overlay:
      - active state меняется на выбранный сценарий;
      - clip меняется на `Idle`, `Walk`, `Jump`, `Fall`, `Land`;
      - collision debug overlay виден;
      - params обновляются.

12. Import Clipboard
    - Скопировать содержимое `examples/shadow-hero/source.json`.
    - `Project -> Import Clipboard`.
    - Проверить `Import Preview` summary.
    - Нажать `Confirm Import`.
    - Нажать `Export Bundle`.
   - Проверить, что bundle содержит 7 файлов и `hero.compiled.json` парсится.

## Pass Criteria

- Все шаги выполнены без app console errors.
- `Export Bundle` возвращает 7 файлов.
- `hero.compiled.json` парсится как JSON.
- `hero.source.rig.json`, `hero.rig.json` и `hero.compiled.json` не содержат parts с `type: "svg"` после production export.
- Runtime preview остается видимым после import/export.
- State Machine graph отображается в viewport и управляет transition preview.
- Timeline поддерживает drag одного keyframe и drag выбранной группы keyframes.
