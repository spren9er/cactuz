<script>
  import { onMount } from 'svelte';
  import Cactus from '$lib/components/Cactus.svelte';

  /** @type {Array<{id: string, name: string, parent: string|null}>} */
  let nodes = [];

  /** @type {Array<{source: string, target: string}>} */
  let links = [];

  let width = 780;
  let height = 780;

  let config = {
    overlap: 0.2,
    arcSpan: 225,
    sizeGrowthRate: 0.8,
    orientation: -90,
    zoom: 1.0,
  };

  let showEdgeBundling = true;

  async function loadFlareData() {
    const response = await fetch('/flareNodes.json');
    nodes = await response.json();

    // Load real links from imports data
    const linksResponse = await fetch('/flareLinks.json');
    links = await linksResponse.json();
  }

  onMount(() => {
    loadFlareData();
  });
</script>

<svelte:head>
  <title>Cactus Tree Visualization</title>
</svelte:head>

<main class="container">
  <h1>Cactus Tree Visualization</h1>

  <p>
    <b>CactusTree</b> is a visualization technique for representing the
    structure and connectivity in deeply nested trees. The current
    implementation is based on the original paper
    <a href="https://ieeexplore.ieee.org/document/8031596">
      <i>CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling</i>
    </a>
    by Tommy Dang and Angus Forbes. See also
    <a
      href="https://cactustrees.github.io/"
      target="_blank"
      rel="noopener noreferrer"
    >
      cactustrees.github.io
    </a>
    for official site about <b>CactusTree</b>.
  </p>

  <div class="controls">
    <div class="control-grid">
      <div class="control-group">
        <label for="overlap">
          Overlap: {config.overlap}
          <input
            id="overlap"
            type="range"
            min="-2"
            max="1"
            step="0.05"
            bind:value={config.overlap}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="arcSpan">
          Arc Span: {config.arcSpan}°
          <input
            id="arcSpan"
            type="range"
            min="90"
            max="360"
            step="5"
            bind:value={config.arcSpan}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="sizeGrowthRate">
          Growth Rate: {config.sizeGrowthRate}
          <input
            id="sizeGrowthRate"
            type="range"
            min="0.3"
            max="1.0"
            step="0.05"
            bind:value={config.sizeGrowthRate}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="zoom">
          Zoom: {config.zoom}
          <input
            id="zoom"
            type="range"
            min="0.25"
            max="2.0"
            step="0.05"
            bind:value={config.zoom}
          />
        </label>
      </div>

      <div class="control-group">
        <label for="orientation">
          Orientation: {config.orientation}°
          <input
            id="orientation"
            type="range"
            min={-180}
            max={180}
            step="10"
            bind:value={config.orientation}
          />
        </label>
      </div>
    </div>
  </div>

  <div
    class="visualization"
    style:width={`${width}px`}
    style:height={`${height}px`}
  >
    <Cactus
      {width}
      {height}
      {nodes}
      links={showEdgeBundling ? links : []}
      options={{
        overlap: config.overlap,
        arcSpan: (config.arcSpan * Math.PI) / 180,
        sizeGrowthRate: config.sizeGrowthRate,
        orientation: (config.orientation * Math.PI) / 180,
        zoom: config.zoom,
      }}
      styles={{
        labelFontFamily: 'monospace',
        edge: '#e2575a',
        highlightStroke: '#e2575a',
        highlightFill: '#ffbbb7',
        fill: '#dedede',
        stroke: '#aaaaaa',
        strokeWidth: 1,
        edgeWidth: 1,
        depths: [
          {
            depth: -1,
            label: 'transparent',
            fill: '#333333',
            stroke: 'none',
            strokeWidth: 0,
            highlightFill: '#e2575a',
          },
          {
            depth: 0,
            fill: '#333333',
            stroke: 'white',
            label: '#efefef',
            highlightFill: '#333333',
          },
        ],
      }}
    />
  </div>

  <div class="edge-bundling-control">
    <label>
      <input type="checkbox" bind:checked={showEdgeBundling} />
      Hierarchical Edge Bundling
    </label>
  </div>

  <footer class="footer">
    <a href="https://spren9er.de" target="_blank" rel="noopener noreferrer">
      @spren9er
    </a>
  </footer>
</main>

<style>
  :global(html, body) {
    font-family: monospace;
    background: #f9f9f9;
  }

  .container {
    padding: 20px;
  }

  h1 {
    color: #333;
    text-align: center;
    margin-bottom: 10px;
  }

  p {
    padding: 20px 150px;
    text-align: left;
    color: #666;
    margin-bottom: 30px;
    line-height: 1.5;
  }

  p a,
  p a:hover {
    color: #333333;
  }

  .controls {
    margin: 20px 80px;
    margin-bottom: 40px;
    border-radius: 8px;
  }

  .control-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 25px;
  }

  .control-group label {
    display: block;
    font-weight: 500;
    color: #555;
    margin-bottom: 5px;
  }

  .control-group input[type='range'] {
    width: 100%;
    margin-top: 5px;
  }

  .visualization {
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

  .edge-bundling-control {
    text-align: center;
    margin: 20px auto;
    font-family: monospace;
  }

  .edge-bundling-control label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #555;
    cursor: pointer;
    font-size: 14px;
  }

  .edge-bundling-control input[type='checkbox'] {
    margin: 0;
  }

  .footer {
    text-align: center;
    position: fixed;
    bottom: 16px;
    width: 200px;
    margin-left: -100px;
    left: 50%;
  }

  .footer a {
    color: #333333;
    text-decoration: none;
    font-size: 12px;
  }

  .footer a:hover {
    color: #333333;
  }
</style>
