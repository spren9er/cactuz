<script>
  import { onMount } from 'svelte';
  import Cactus from '$lib/components/Cactus.svelte';

  /** @type {Array<{id: string, name: string, parent: string|null}>} */
  let nodes = [];

  /** @type {Array<{source: string, target: string}>} */
  let links = [];

  let width = 750;
  let height = 750;

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
  <h1>cactus</h1>

  <p>
    <i>CactusTree</i> is an advanced visualization technique designed to
    represent complex hierarchical structures and their interconnections in
    deeply nested trees. The Svelte library <b>cactus</b> is based on the
    research paper
    <a href="https://ieeexplore.ieee.org/document/8031596">
      CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling
    </a>
    by Tommy Dang and Angus Forbes. Additional information and resources are available
    at the official
    <a href="https://cactustrees.github.io/"> CactusTree website </a>.
  </p>

  <p>
    This implementation includes several customizable parameters to control the
    visual appearance and behavior of the tree layout. The demonstration dataset
    represents the Flare ActionScript visualization library's software
    architecture and dependency structure, originally featured in this
    <a href="https://observablehq.com/@d3/hierarchical-edge-bundling"
      >Observable notebook</a
    >.
  </p>

  <p>
    The Svelte library <b>cactus</b> can be found on
    <a href="https://github.com/spren9er/cactus">GitHub</a>.
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
    font-size: 12px;
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
    padding: 4px 140px;
    text-align: left;
    color: #666;
    line-height: 1.5;
  }

  p a,
  p a:hover {
    color: #333333;
  }

  .controls {
    margin: 20px 140px;
    margin-bottom: 40px;
    border-radius: 8px;
  }

  .control-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
    font-size: 11px;
  }

  .footer a:hover {
    color: #333333;
  }

  @media (max-width: 768px) {
    p {
      padding: 4px 10px;
    }

    .controls {
      margin: 20px 10px;
    }
  }
</style>
