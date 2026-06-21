export default function EditorPage() {
  return (
    <main className="editorShell" aria-label="Bones editor shell">
      <header className="topBar">
        <strong>Bones</strong>
        <span>Editor shell</span>
      </header>
      <section className="workspace" aria-label="Empty editor workspace">
        <aside className="panel">Hierarchy</aside>
        <div className="canvas" aria-label="Editor canvas" />
        <aside className="panel">Inspector</aside>
      </section>
      <footer className="timeline">Timeline</footer>
    </main>
  );
}
