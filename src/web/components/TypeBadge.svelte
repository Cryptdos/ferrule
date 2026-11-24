<script lang="ts">
  /** What the controller needs for a point (design-v0.4 §2): DI, DO, AI or AO, each its own colour. */
  let { type }: { type: "DI" | "DO" | "AI" | "AO" } = $props();
</script>

<span class="badge {type.toLowerCase()}">{type}</span>

<style>
  .badge {
    display: inline-block;
    min-width: 2.4em;
    text-align: center;
    font-size: 11px;
    padding: 0 5px;
    border-radius: 3px;
    border: 1px solid;
  }
  .di {
    color: #1d4f9a;
    background: #e8f0fb;
    border-color: #b8cdee;
  }
  .do {
    color: #8a4b00;
    background: #fdf0e0;
    border-color: #f0c98f;
  }
  .ai {
    color: #1d6b2c;
    background: #e4f3e6;
    border-color: #a9d8b2;
  }
  .ao {
    color: #6a2b8f;
    background: #f3e8fa;
    border-color: #d5b6ea;
  }
</style>
