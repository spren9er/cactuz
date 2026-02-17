<script>
  import { onMount } from 'svelte';

  import Cactus from '$lib/components/CactusTree.svelte';

  /** @type {Array<{id: string, name: string, parent: string|null}>} */
  let nodes = [];

  /** @type {Array<{source: string, target: string}>} */
  let edges = [];

  let width = 750;
  let height = 750;

  $: displayedEdges = showEdgeBundling ? edges : [];

  /** @type {import('$lib/types.js').Options} */
  let options = {
    overlap: 0.2,
    arcSpan: 225,
    sizeGrowthRate: 0.8,
    orientation: 90,
    zoom: 1.0,
    numLabels: 20,
  };

  /** @type {import('$lib/types.js').EdgeOptions} */
  let edgeOptions = {
    bundlingStrength: 0.97,
    filterMode: 'mute',
    muteOpacity: 0.1,
    edgePoint: 'perimeter',
  };

  let showEdgeBundling = true;
  let selectedDataset = 'flare';

  const datasets = [
    { value: 'flare', label: 'Flare' },
    { value: 'mammals', label: 'Mammals' },
    { value: 'NGFPathway', label: 'NGF Pathway' },
    { value: 'rill', label: 'Rill' },
  ];

  /** @param {string} dataset */
  async function loadDataset(dataset) {
    const response = await fetch(`datasets/${dataset}Nodes.json`);
    nodes = await response.json();

    if (dataset === 'rill') {
      edges = [];
    } else {
      const edgesResponse = await fetch(`datasets/${dataset}Edges.json`);
      edges = await edgesResponse.json();
    }
  }

  const availableStyles = [
    { value: 'magma.json', label: 'Magma' },
    { value: 'classic.json', label: 'Classic' },
    { value: 'minimal.json', label: 'Minimal' },
    { value: 'default.json', label: 'Default' },
  ];

  let selectedStyle = 'magma.json';
  let currentStyles = {};

  /** @param {string} styleName */
  async function loadStyle(styleName) {
    try {
      const res = await fetch(`/styles/${styleName}`);
      if (!res.ok) {
        currentStyles = {};
        return;
      }
      currentStyles = await res.json();
    } catch {
      currentStyles = {};
    }
  }

  function handleDatasetChange() {
    loadDataset(selectedDataset);
  }

  /** @type {HTMLDivElement} */
  let visualization;

  function downloadImage() {
    const canvas = visualization?.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `cactuz-${selectedDataset}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  onMount(() => {
    loadDataset(selectedDataset);
    loadStyle(selectedStyle);
  });
</script>

<svelte:head>
  <title>cactuz</title>
</svelte:head>

<main class="container">
  <h1>cactuz</h1>

  <p>
    <i>CactusTree</i> is an advanced visualization technique designed to
    represent complex hierarchical structures and their interconnections in
    deeply nested trees. It is described in the research paper
    <a href="https://ieeexplore.ieee.org/document/8031596">
      CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling
    </a>
    by Tommy Dang and Angus Forbes. Additional information and resources are available
    at the official
    <a href="https://cactustrees.github.io/"> CactusTree website </a>.
  </p>

  <p>
    This modern, interactive visualization of <i>CactusTree</i> provides several
    configurable options that allow you to control the visual appearance and
    layout behavior of the tree. The source code and documentation of the
    JavaScript library <b>cactuz</b> is available on
    <a href="https://github.com/spren9er/cactus">GitHub</a>.
  </p>

  <div class="controls">
    <div class="dataset-selector">
      <label for="dataset">
        Dataset:
        <select
          id="dataset"
          bind:value={selectedDataset}
          on:change={handleDatasetChange}
        >
          {#each datasets as dataset (dataset.value)}
            <option value={dataset.value}>{dataset.label}</option>
          {/each}
        </select>
      </label>

      <div class="dataset-summary">
        {nodes.length} nodes, {edges.length} edges
      </div>

      <label for="style">
        Style:
        <select
          id="style"
          bind:value={selectedStyle}
          on:change={() => loadStyle(selectedStyle)}
        >
          {#each availableStyles as s (s.value)}
            <option value={s.value}>{s.label}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="control-grid">
      <div class="control-group">
        <label for="overlap">
          Overlap: {options.overlap}
          <input
            id="overlap"
            type="range"
            min="-2"
            max="1"
            step="0.02"
            bind:value={options.overlap}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="arcSpan">
          Arc Span: {options.arcSpan}°
          <input
            id="arcSpan"
            type="range"
            min="0"
            max="360"
            step="1"
            bind:value={options.arcSpan}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="sizeGrowthRate">
          Growth Rate: {options.sizeGrowthRate}
          <input
            id="sizeGrowthRate"
            type="range"
            min="0.5"
            max="1.0"
            step="0.01"
            bind:value={options.sizeGrowthRate}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="zoom">
          Zoom: {options.zoom}
          <input
            id="zoom"
            type="range"
            min="0.25"
            max="2.0"
            step="0.05"
            bind:value={options.zoom}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="orientation">
          Orientation: {options.orientation}°
          <input
            id="orientation"
            type="range"
            min={0}
            max={360}
            step="1"
            bind:value={options.orientation}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="numLabels">
          Number of Labels: {options.numLabels}
          <input
            id="numLabels"
            type="range"
            min="0"
            max="60"
            step="1"
            bind:value={options.numLabels}
          />
        </label>
      </div>
    </div>
  </div>

  <div
    class="visualization"
    bind:this={visualization}
    style:width={`${width}px`}
    style:height={`${height}px`}
  >
    <button
      class="download-btn"
      on:click={downloadImage}
      title="Download as PNG file"
      aria-label="Download as PNG file"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>

    <Cactus
      {width}
      {height}
      {nodes}
      edges={displayedEdges}
      options={{
        overlap: options.overlap,
        arcSpan: ((options.arcSpan ?? 0) * Math.PI) / 180,
        sizeGrowthRate: options.sizeGrowthRate,
        orientation: ((options.orientation ?? 0) * Math.PI) / 180,
        zoom: options.zoom,
        numLabels: options.numLabels,
        collapseDuration: 300,
        edges: edgeOptions,
      }}
      styles={currentStyles}
    />
  </div>

  <div class="edge-bundling-control">
    <div class="bundle-row row1">
      <label class="edge-bundling-label">
        <input type="checkbox" bind:checked={showEdgeBundling} />
        <span class="edge-bundling-text">Hierarchical Edge Bundling</span>
      </label>
    </div>

    <div class="bundle-row row2">
      <div class="control-group">
        <label for="bundlingStrength">
          Bundling Strength: {edgeOptions.bundlingStrength?.toFixed(2)}
          <input
            id="bundlingStrength"
            type="range"
            min="0"
            max="1"
            step="0.01"
            bind:value={edgeOptions.bundlingStrength}
            disabled={!showEdgeBundling}
            aria-disabled={!showEdgeBundling}
          />
        </label>
      </div>

      <label class="filter-mode-label">
        Point:
        <select
          bind:value={edgeOptions.edgePoint}
          disabled={!showEdgeBundling}
          aria-disabled={!showEdgeBundling}
        >
          <option value="center">center</option>
          <option value="perimeter">perimeter</option>
        </select>
      </label>

      <label class="filter-mode-label">
        Filter Mode:
        <select
          bind:value={edgeOptions.filterMode}
          disabled={!showEdgeBundling}
          aria-disabled={!showEdgeBundling}
        >
          <option value="hide">hide</option>
          <option value="mute">mute</option>
        </select>
      </label>

      <div class="control-group">
        <label for="muteOpacity">
          Mute Opacity: {edgeOptions.muteOpacity?.toFixed(2)}
          <input
            id="muteOpacity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            bind:value={edgeOptions.muteOpacity}
            disabled={!showEdgeBundling || edgeOptions.filterMode === 'hide'}
            aria-disabled={!showEdgeBundling ||
              edgeOptions.filterMode === 'hide'}
          />
        </label>
      </div>
    </div>
  </div>

  <footer class="footer">
    <a href="https://spren9er.de" target="_blank" rel="noopener noreferrer">
      @spren9er
    </a>
  </footer>
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    font-family: monospace;
    font-size: 12px;
    background: #f9f9f9;
  }

  :global(canvas) {
    display: block;
    touch-action: none;
  }

  .container {
    padding: 20px;
  }

  h1 {
    color: #333333;
    text-align: center;
    margin-bottom: 10px;
  }

  p {
    max-width: 750px;
    margin: 0 auto 15px auto;
    padding: 4px 4px;
    text-align: left;
    color: #666;
    line-height: 1.5;
  }

  p a,
  p a:hover {
    color: #333333;
  }

  .controls {
    max-width: 750px;
    margin: 20px auto 25px auto;
    border-radius: 8px;
  }

  .control-grid {
    font-size: 11px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 25px;
  }

  .control-group label {
    text-align: left;
    display: block;
    font-weight: 500;
    color: #333333;
    margin-bottom: 5px;
  }

  .control-group input[type='range'] {
    width: 100%;
    margin-top: 5px;
  }

  .dataset-selector {
    text-align: center;
    margin-bottom: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
  }

  .dataset-selector label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 500;
    color: #333333;
  }

  .dataset-selector select {
    padding: 5px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    background-color: white;
    color: #333333;
  }

  .dataset-summary {
    font-size: 11px;
    color: #888;
    font-style: italic;
  }

  .visualization {
    position: relative;
    background-color: #ffffff;
    border: 1px solid #dedede;
    border-radius: 12px;
    box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 20px auto;
    width: fit-content;
  }

  .download-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid #cccccc;
    border-radius: 6px;
    padding: 5px 6px;
    cursor: pointer;
    color: #cccccc;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.2s,
      color 0.2s;
  }

  .download-btn:hover {
    background: rgba(255, 255, 255, 1);
    border: 1px solid #333333;
    color: #333;
  }

  .edge-bundling-control {
    text-align: center;
    max-width: 750px;
    margin: 20px auto 30px auto;
    font-family: monospace;
  }

  .bundle-row {
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    margin: 24px 0;
    flex-wrap: wrap;
  }

  .bundle-row.row2 {
    display: grid;
    grid-template-columns: repeat(4, minmax(140px, 1fr));
    gap: 25px;
    width: 100%;
    align-items: start;
  }

  .edge-bundling-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #333333;
    cursor: pointer;
  }

  .edge-bundling-label input[type='checkbox'] {
    margin: 0;
  }

  .edge-bundling-text {
    margin-left: 4px;
    font-weight: 500;
    color: #333333;
  }

  .filter-mode-label {
    flex-direction: row;
    align-items: center;
    justify-self: center;
    gap: 6px;
    font-size: 11px;
    color: #333333;
  }

  .filter-mode-label select {
    padding: 4px 6px;
    font-family: monospace;
    font-size: 11px;
    border-radius: 4px;
    border: 1px solid #ccc;
    background-color: white;
    color: #333333;
  }

  .footer {
    background-color: #333333;
    text-align: center;
    position: fixed;
    bottom: 0px;
    padding: 12px;
    width: 100%;
    margin-left: -38px;
  }

  .footer a {
    color: #efefef;
    text-decoration: none;
    font-size: 10px;
  }

  .footer a:hover {
    color: #efefef;
    text-decoration: underline;
  }

  @media (max-width: 600px) {
    .dataset-selector {
      flex-direction: column;
      gap: 8px;
    }

    .visualization {
      width: 100% !important;
      height: auto !important;
      aspect-ratio: 1;
      overflow: hidden;
    }

    .bundle-row.row2 {
      grid-template-columns: 1fr;
    }

    .footer {
      margin-left: -20px;
    }
  }
</style>
