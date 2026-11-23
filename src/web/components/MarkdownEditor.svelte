<script lang="ts">
  /**
   * Notes editor: the text with a few formatting buttons. The drawing updates
   * as you type (one undo step per edit session).
   */
  let { value, oninput }: { value: string; oninput: (v: string) => void } = $props();
  let area: HTMLTextAreaElement | undefined = $state();

  /** Wrap the selection, or put a prefix at the start of each selected line. */
  function wrapSel(before: string, after = before) {
    if (!area) return;
    const { selectionStart: a, selectionEnd: b, value: v } = area;
    const mid = v.slice(a, b) || "text";
    const next = v.slice(0, a) + before + mid + after + v.slice(b);
    set(next, a + before.length, a + before.length + mid.length);
  }
  function prefixLines(prefix: (i: number) => string) {
    if (!area) return;
    const { selectionStart: a, selectionEnd: b, value: v } = area;
    const start = v.lastIndexOf("\n", a - 1) + 1;
    const endNl = v.indexOf("\n", b);
    const end = endNl < 0 ? v.length : endNl;
    const lines = v.slice(start, end).split("\n").map((l, i) => prefix(i) + l.replace(/^(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, ""));
    const block = lines.join("\n");
    set(v.slice(0, start) + block + v.slice(end), start, start + block.length);
  }
  function insert(text: string) {
    if (!area) return;
    const { selectionStart: a, selectionEnd: b, value: v } = area;
    const lead = a > 0 && v[a - 1] !== "\n" ? "\n" : "";
    const next = v.slice(0, a) + lead + text + v.slice(b);
    set(next, a + lead.length + text.length, a + lead.length + text.length);
  }
  function set(next: string, s: number, e: number) {
    oninput(next);
    queueMicrotask(() => {
      if (!area) return;
      area.value = next;
      area.focus();
      area.setSelectionRange(s, e);
    });
  }
</script>

<div class="md">
  <div class="bar">
    <button title="Title (5 mm)" onclick={() => prefixLines(() => "# ")}>H1</button>
    <button title="Heading (3.5 mm)" onclick={() => prefixLines(() => "## ")}>H2</button>
    <button title="Small heading (bold)" onclick={() => prefixLines(() => "### ")}>H3</button>
    <button title="Bold" onclick={() => wrapSel("**")}><b>B</b></button>
    <button title="Italic" onclick={() => wrapSel("*")}><i>I</i></button>
    <button title="Strikethrough" onclick={() => wrapSel("~~")}><s>S</s></button>
    <button title="Bulleted list" onclick={() => prefixLines(() => "- ")}>•</button>
    <button title="Numbered list" onclick={() => prefixLines((i) => `${i + 1}. `)}>1.</button>
    <button title="Task list" onclick={() => prefixLines(() => "- [ ] ")}>☐</button>
    <button title="Quote" onclick={() => prefixLines(() => "> ")}>❝</button>
    <button title="Code block" onclick={() => insert("```\ncode\n```\n")}>{"</>"}</button>
    <button title="Table" onclick={() => insert("| Item | Size | Notes |\n|---|---|---|\n| | | |\n")}>▦</button>
    <button title="Line across" onclick={() => insert("---\n")}>―</button>
  </div>
  <textarea
    bind:this={area}
    {value}
    rows="12"
    spellcheck="true"
    oninput={(e) => oninput(e.currentTarget.value)}
  ></textarea>
  <div class="hint">
    Markdown: <code># Title</code> · <code>## Heading</code> · <code>### Small</code> · <code>**bold**</code> · <code>*italic*</code> ·
    <code>~~struck~~</code> · <code>`code`</code> · <code>- bullet</code> · <code>1. step</code> · <code>- [ ] task</code> ·
    <code>&gt; quote</code> · <code>```</code> code block · <code>| a | b |</code> table (a <code>|---|</code> row under the first makes it a
    heading row) · <code>---</code> line. Two spaces indent a list. Body text is Note (2.5 mm).
  </div>
</div>

<style>
  .md {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .bar {
    display: flex;
    gap: 2px;
  }
  .bar button {
    min-width: 26px;
    padding: 1px 5px;
    font-size: 12px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
    resize: vertical;
  }
  .hint {
    font-size: 11px;
    color: #667;
    line-height: 1.5;
  }
  code {
    font-size: 11px;
    background: #eef0f2;
    padding: 0 2px;
    border-radius: 2px;
  }
</style>
