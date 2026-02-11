# cactuz

A JavaScript library for visualizing hierarchical data structures using the *CactusTree* algorithm with hierarchical edge bundling.

<div align="center">
  <img src="https://github.com/spren9er/cactuz/blob/main/docs/images/cactus_tree_simple.png?raw=true" alt="cactus-tree-simple" width="75%" height="75%">
</div>

## Overview

The library **cactuz** is based on the research paper *[CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling](https://ieeexplore.ieee.org/document/8031596)* by Tommy Dang and Angus Forbes. It provides a framework-agnostic `CactusTree` class for rendering interactive tree visualizations on an HTML canvas, as well as a low-level `CactusLayout` class for computing the layout independently.

## Features

- **Framework-Agnostic** - Works with any JavaScript framework or plain HTML
- **Fractal-based Tree Layout** - Recursively stacks child nodes on parent nodes
- **Hierarchical Edge Bundling** - Groups related connections for cleaner visualization
- **Highly Customizable** - Extensive styling and behavior options
- **Interactive** - Pan, zoom, hover effects, and edge filtering
- **Depth-based Styling** - Configure appearance for different tree levels

## Installation

```bash
npm install cactuz
```

## Quick Start

```javascript
import { CactusTree } from 'cactuz';

const canvas = document.getElementById('my-canvas');

const nodes = [
  { id: 'root', name: 'Root', parent: null },
  { id: 'child1', name: 'Child 1', parent: 'root' },
  { id: 'child2', name: 'Child 2', parent: 'root' },
  { id: 'leaf1', name: 'Leaf 1', parent: 'child1' },
  { id: 'leaf2', name: 'Leaf 2', parent: 'child1' },
];

const edges = [{ source: 'leaf1', target: 'leaf2' }];

const tree = new CactusTree(canvas, {
  width: 800,
  height: 600,
  nodes,
  edges,
});
```

See [cactuz.spren9er.de](https://cactuz.spren9er.de) for a live demo and interactive playground.

## API Reference

### CactusTree

The `CactusTree` class manages canvas setup, layout computation, rendering, and mouse/touch interactions.

#### Constructor

```javascript
new CactusTree(canvas, config)
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `canvas` | `HTMLCanvasElement` | The canvas element to render into |
| `config` | `object` | Configuration (see below) |

#### Config

| Property   | Type      | Required | Default | Description                        |
| ---------- | --------- |:--------:|:-------:| ---------------------------------- |
| `width`    | `number`  | yes      | -       | Canvas width in pixels             |
| `height`   | `number`  | yes      | -       | Canvas height in pixels            |
| `nodes`    | `Node[]`  | yes      | -       | Array of hierarchical nodes        |
| `edges`    | `Edge[]`  | no       | `[]`    | Array of connections between nodes |
| `options`  | `Options` | no       | `{}`    | Layout and behavior configuration  |
| `styles`   | `Styles`  | no       | `{}`    | Visual styling configuration       |
| `pannable` | `boolean` | no       | `true`  | Enable pan interaction             |
| `zoomable` | `boolean` | no       | `true`  | Enable zoom interaction            |

#### Methods

##### `update(config)`

Update any subset of the config properties. Triggers a full re-render.

```javascript
tree.update({ nodes: newNodes, edges: newEdges });
tree.update({ options: { zoom: 1.5 } });
tree.update({ styles: myStyles });
```

##### `render()`

Force a full render (layout recalculation + draw).

##### `draw()`

Force a lightweight redraw without layout recalculation.

##### `destroy()`

Remove event listeners and cancel pending animation frames. Call this when removing the canvas from the DOM.

```javascript
tree.destroy();
```

#### Node Structure

```typescript
interface Node {
  id: string;                 // Unique identifier
  name: string;               // Display name
  parent: string | null;      // Parent node ID
  weight?: number;            // Optional explicit weight
}
```

#### Edge Structure

```typescript
interface Edge {
  source: string;             // Source node ID
  target: string;             // Target node ID
}
```

#### Options

```typescript
interface Options {
  overlap?: number;           // Node overlap factor (-inf to 1, default: 0.5)
  arcSpan?: number;           // Arc span in radians (default: 5π/4)
  sizeGrowthRate?: number;    // Size growth rate (default: 0.75)
  orientation?: number;       // Root orientation in radians (default: π/2)
  zoom?: number;              // Layout zoom factor (default: 1.0)
  numLabels?: number;         // Number of labels (default: 20)
  edges?: EdgeOptions;        // Edge-specific options
}

interface EdgeOptions {
  bundlingStrength?: number;  // Edge bundling strength (0..1, default: 0.97)
  filterMode?: 'hide' | 'mute'; // Hover behavior when over a leaf: 'hide' hides unrelated edges, 'mute' shows them at reduced opacity (default: 'mute')
  muteOpacity?: number;         // When filterMode is 'mute', multiplier applied to unrelated edges (0..1, default: 0.1)
}
```

**Note:** Negative values for `overlap` create gaps and connect nodes with edges.

#### Styles

The `styles` config is a nested object with optional groups and an optional `depths` array containing per-depth overrides. Per-depth overrides take precedence over global group values.

```typescript
interface Styles {
  node?: {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
  };
  edge?: {
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
  };
  label?: {
    inner: {
      textColor?: string;
      textOpacity?: number;
      fontFamily?: string;
      fontWeight?: string;
      minFontSize?: number;
      maxFontSize?: number;
    },
    outer: {
      textColor?: string;
      textOpacity?: number;
      fontFamily?: string;
      fontWeight?: string;
      fontSize?: number;
      padding?: number;
      link?: {
        strokeColor?: string;
        strokeOpacity?: number;
        strokeWidth?: number;
        padding?: number;
        length?: number;
      };
    };
  };
  link?: {
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
  };
  highlight?: {
    node?: {
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWidth?: number;
    };
    edge?: {
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWidth?: number;
    };
    label?: {
      inner: {
        textColor?: string;
        textOpacity?: number;
        fontWeight?: string;
      };
      outer: {
        textColor?: string;
        textOpacity?: number;
        fontWeight?: string;
      };
    };
  };
  depths?: DepthStyle[]; // Per-depth overrides
}
```

#### Depth-Specific Styling

Each item in `styles.depths` must include a `depth` integer. The node with `depth` 0 is the root of the tree.

Positive integers (1, 2, 3, ...) refer to deeper levels away from the root:
  - 1 = direct children of the root,
  - 2 = grandchildren of the root,
  - and so on.

Use positive-depth overrides to style internal levels progressively (for example, a different node color for level 2).

Negative integers (-1, -2, -3, ...) are supported as a convenience for leaf-oriented overrides:
  - -1 = set of all leaves (nodes with no children),
  - -2 = set of parents of leaves (one level up from leaves),
  - and so on.

These negative-depth entries are not absolute numeric depths in the tree; instead the implementation maps them to groups of nodes computed from the layout. This is useful when you want to style leaves or near-leaf levels without knowing their positive depth value.

```typescript
interface DepthStyle {
  depth: number;
  node?: {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
  };
  label?: {
    inner: {
      textColor?: string;
      textOpacity?: number;
      fontFamily?: string;
      fontWeight?: string;
      minFontSize?: number;
      maxFontSize?: number;
    },
    outer: {
      textColor?: string;
      textOpacity?: number;
      fontFamily?: string;
      fontWeight?: string;
      fontSize?: number;
      padding?: number;
      link?: {
        strokeColor?: string;
        strokeOpacity?: number;
        strokeWidth?: number;
        padding?: number;
        length?: number;
      };
    };
  };
  link?: {
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
  };
  highlight?: {
    node?: {
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWidth?: number;
    };
    label?: {
      inner: {
        textColor?: string;
        textOpacity?: number;
        fontWeight?: string;
      };
      outer: {
        textColor?: string;
        textOpacity?: number;
        fontWeight?: string;
      };
    };
  }  
}
```

### CactusLayout

For use cases where you only need the layout computation (e.g. rendering with a different graphics library), the `CactusLayout` class provides the positioning algorithm without any canvas or interaction management.

#### Constructor

```javascript
import { CactusLayout } from 'cactuz';

new CactusLayout(
  width,           // Target width
  height,          // Target height
  zoom,            // Zoom factor (default: 1)
  overlap,         // Overlap factor (default: 0)
  arcSpan,         // Arc span in radians (default: π)
  sizeGrowthRate   // Size growth rate (default: 0.75)
)
```

#### Methods

##### `render(nodes, startX, startY, startAngle)`

Computes the layout and returns positioned node data.

**Parameters:**

- `nodes`: Array of node objects (flat array with `id`, `name`, `parent`)
- `startX`: Starting X coordinate (usually `width / 2`)
- `startY`: Starting Y coordinate (usually `height / 2`)
- `startAngle`: Starting angle in radians (default: `Math.PI / 2`)

**Returns:**

```typescript
interface NodeData {
  x: number;       // X coordinate
  y: number;       // Y coordinate
  radius: number;  // Node radius
  node: Node;      // Original node reference
  isLeaf: boolean; // Whether this is a leaf node
  depth: number;   // Depth in hierarchy (0 = root)
  angle: number;   // Angle from parent (radians)
}
```

**Example:**

```javascript
import { CactusLayout } from 'cactuz';

const layout = new CactusLayout(800, 600, 1.0, 0.5, Math.PI, 0.75);
const nodeData = layout.render(nodes, 400, 300, Math.PI / 2);

// Use nodeData to render with your own graphics library
for (const nd of nodeData) {
  console.log(nd.x, nd.y, nd.radius, nd.node.name);
}
```

## Advanced Usage

### Styling Example

```javascript
const tree = new CactusTree(canvas, {
  width: 800,
  height: 600,
  nodes,
  edges,
  styles: {
    node: {
      fillColor: '#f0f8ff',
      strokeColor: '#4682b4',
      strokeWidth: 2,
    },
    edge: {
      strokeColor: '#e74c3c',
      strokeOpacity: 0.25,
      strokeWidth: 2,
    },
    label: {
      inner: {
        textColor: '#2c3e50',
        fontFamily: 'Arial, sans-serif',
        minFontSize: 8,
        maxFontSize: 16,
      },
      outer: {
        textColor: '#00ff00',
        fontFamily: 'Arial, sans-serif',
        padding: 2,
        link: {
          strokeColor: '#aaaaaa',
          strokeWidth: 0.6,
          padding: 1,
        },
      },
    },
    depths: [
      {
        depth: 0,
        node: { fillColor: '#2c3e50', strokeColor: '#ecf0f1' },
        label: { inner: { textColor: '#ecf0f1' } },
      },
      {
        depth: -1,
        node: { fillColor: '#e74c3c', strokeColor: '#c0392b' },
        label: {
          inner: { textColor: '#ffffff' },
          outer: { fontWeight: 'bold' },
        },
      },
    ],
  },
});
```

### Negative Overlap

```javascript
const tree = new CactusTree(canvas, {
  width: 800,
  height: 600,
  nodes,
  options: {
    overlap: -1.1,                  // Gaps between nodes
    arcSpan: 2 * Math.PI,           // Full circle layout (radians)
    orientation: (7 / 9) * Math.PI, // Root orientation (radians)
    zoom: 0.7,
  },
});
```

<div align="center">
  <img src="https://github.com/spren9er/cactuz/blob/main/docs/images/cactus_tree_advanced.png?raw=true" alt="cactus-tree-advanced" width="75%" height="75%">
</div>

For a negative overlap parameter, nodes are connected by edges. When hovering over leaf nodes, only the edges connected to that node are shown, while all other edges are hidden. This allows for better readability in dense visualizations.

## Svelte Component

For Svelte applications, **cactuz** also exports a ready-to-use `Cactus` Svelte component that wraps the core class with reactive prop handling.

```svelte
<script>
  import { Cactus } from 'cactuz';

  const nodes = [
    { id: 'root', name: 'Root', parent: null },
    { id: 'child1', name: 'Child 1', parent: 'root' },
    { id: 'child2', name: 'Child 2', parent: 'root' },
    { id: 'leaf1', name: 'Leaf 1', parent: 'child1' },
    { id: 'leaf2', name: 'Leaf 2', parent: 'child1' },
  ];

  const edges = [{ source: 'leaf1', target: 'leaf2' }];
</script>

<Cactus width={800} height={600} {nodes} {edges} />
```

The component accepts the same props as the `CactusTree` config: `width`, `height`, `nodes`, `edges`, `options`, `styles`, `pannable`, and `zoomable`. It automatically re-renders when any prop changes.
