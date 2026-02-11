<script>
  import { onMount } from 'svelte';

  import { CactusTree } from '$lib/cactusTree.js';

  let {
    width,
    height,
    nodes,
    edges = [],
    options = {},
    styles = {},
    pannable = true,
    zoomable = true,
  } = $props();

  /** @type {HTMLCanvasElement} */
  let canvas;

  /** @type {CactusTree|null} */
  let tree = null;

  onMount(() => {
    tree = new CactusTree(canvas, {
      width,
      height,
      nodes,
      edges,
      options,
      styles,
      pannable,
      zoomable,
    });

    return () => {
      tree?.destroy();
      tree = null;
    };
  });

  $effect(() => {
    tree?.update({
      width,
      height,
      nodes,
      edges,
      options,
      styles,
      pannable,
      zoomable,
    });
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  style="display: block; cursor: default;"
></canvas>
