# cactus-tree

A modern Svelte library for visualizing hierarchical data structures using the *CactusTree* algorithm with hierarchical edge bundling.

<div align="center">
  <img src="https://github.com/spren9er/cactus-tree/blob/main/docs/images/cactus-tree.png?raw=true" alt="cactus-tree" width="50%" height="50%">
</div>

## Overview

The library **cactus-tree** is based on the research paper *[CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling](https://ieeexplore.ieee.org/document/8031596)* by Tommy Dang and Angus Forbes. This implementation provides both a ready-to-use Svelte component and a standalone layout algorithm for creating interactive tree visualizations.

## Features

- **Fractal-based Tree Layout** - Recursively stacks child nodes on parent nodes
- **Hierarchical Edge Bundling** - Groups related connections for cleaner visualization
- **Highly Customizable** - Extensive styling and behavior options
- **Interactive** - Pan, zoom, hover effects, and link filtering
- **Depth-based Styling** - Configure appearance for different tree levels

## Installation

```bash
npm install cactus-tree
```

## Quick Start

```svelte
<script>
  import { CactusTree } from 'cactus-tree';

  const nodes = [
    { id: 'root', name: 'Root', parent: null },
    { id: 'child1', name: 'Child 1', parent: 'root' },
    { id: 'child2', name: 'Child 2', parent: 'root' },
    { id: 'leaf1', name: 'Leaf 1', parent: 'child1' },
    { id: 'leaf2', name: 'Leaf 2', parent: 'child1' },
  ];

  const links = [{ source: 'leaf1', target: 'leaf2' }];
</script>

<CactusTree width={800} height={600} {nodes} {links} />
```

## API Reference

### CactusTree Component

#### Props

| Prop       | Type      | Required | Default | Description                        |
| ---------- | --------- | -------- | ------- | ---------------------------------- |
| `width`    | `number`  | yes      | -       | Canvas width in pixels             |
| `height`   | `number`  | yes      | -       | Canvas height in pixels            |
| `nodes`    | `Node[]`  | yes      | -       | Array of hierarchical nodes        |
| `links`    | `Link[]`  | no       | `[]`    | Array of connections between nodes |
| `options`  | `Options` | no       | `{}`    | Layout and behavior configuration  |
| `styles`   | `Styles`  | no       | `{}`    | Visual styling configuration       |
| `pannable` | `boolean` | no       | `true`  | Enable pan interaction             |
| `zoomable` | `boolean` | no       | `true`  | Enable zoom interaction            |

#### Node Structure

```typescript
interface Node {
  id: string;            // Unique identifier
  name: string;          // Display name
  parent: string | null; // Parent node ID (null for root)
  weight?: number;       // Optional explicit weight
}
```

#### Link Structure

```typescript
interface Link {
  source: string; // Source node ID
  target: string; // Target node ID
}
```

#### Options

```typescript
interface Options {
  overlap?: number;        // Node overlap factor (-inf to 1, default: 0.5)
  arcSpan?: number;        // Arc span in radians (default: 5π/4)
  sizeGrowthRate?: number; // Size growth rate (default: 0.75)
  orientation?: number;    // Root orientation in radians (default: π/2)
  zoom?: number;           // Zoom level (default: 1.0)
}
```

#### Styles

```typescript
interface Styles {
  // Node appearance
  fill?: string;            // Node fill color (default: '#efefef')
  fillOpacity?: number;     // Node fill opacity (default: 1)
  stroke?: string;          // Node stroke color (default: '#333333')
  strokeWidth?: number;     // Node stroke width (default: 1)
  strokeOpacity?: number;   // Node stroke opacity (default: 1)

  // Labels
  label?: string;           // Label color (default: '#333333')
  labelFontFamily?: string; // Label font (default: 'monospace')
  labelLimit?: number;      // Maximum number of labels to show (default: 50)
                            // Shows labels for the N largest nodes by radius (all types)
                            // Set to 0 to hide all labels (except when hovering)

  // Connections
  line?: string;            // Tree line color (default: '#333333')
  lineWidth?: number;       // Tree line width (default: 1)
  edge?: string;            // Link color (default: '#ff6b6b')
  edgeWidth?: number;       // Link width (default: 1)
  edgeOpacity?: number;     // Link opacity (default: 0.1, full opacity when hovering leaf nodes with links)

  // Hover effects
  highlight?: boolean;      // Enable hover effects (default: true)
  highlightFill?: string;   // Hover fill color (default: '#ffcc99')
  highlightStroke?: string; // Hover stroke color (default: '#ff6600')

  // Depth-specific styling
  depths?: DepthStyle[];    // Per-depth style overrides
}
```

#### Depth-Specific Styling

```typescript
interface DepthStyle {
  depth: number; // Tree depth (0 = root, -1 = leaves)
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  label?: string;
  labelFontFamily?: string;
  line?: string;
  lineWidth?: number;
  highlight?: boolean;
  highlightFill?: string;
  highlightStroke?: string;
}
```

### CactusLayout Class

For custom implementations or non-Svelte environments, you can use the layout algorithm directly:

```javascript
import { CactusLayout } from 'cactus-tree';

const layout = new CactusLayout(
  800,       // width
  600,       // height
  1.0,       // zoom
  0.5,       // overlap
  Math.PI,   // arcSpan
  0.75,      // sizeGrowthRate
);

const nodeData = layout.render(nodes, 400, 300, -Math.PI / 2);
```

#### Constructor

```typescript
new CactusLayout(
  width: number,           // Target width
  height: number,          // Target height
  zoom?: number,           // Zoom factor (default: 1)
  overlap?: number,        // Overlap factor (default: 0)
  arcSpan?: number,        // Arc span (default: π)
  sizeGrowthRate?: number  // Size growth rate (default: 0.75)
)
```

#### Methods

##### `render(nodes, startX, startY, startAngle)`

Computes the layout and returns positioned node data.

**Parameters:**

- `nodes`: Array of node objects or flat node array
- `startX`: Starting X coordinate (usually width/2)
- `startY`: Starting Y coordinate (usually height/2)
- `startAngle`: Starting angle in radians (default: π/2)

**Returns:**

```typescript
NodeData[] // Array of positioned nodes
```

##### `NodeData Structure`

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

## Advanced Usage

### Custom Styling Example

```svelte
<script>
  import { CactusTree } from 'cactus-tree';

  const styles = {
    fill: '#f0f8ff',
    stroke: '#4682b4',
    strokeWidth: 2,
    label: '#2c3e50',
    labelFontFamily: 'Arial, sans-serif',
    labelLimit: 100,
    edge: '#e74c3c',
    edgeWidth: 3,
    highlightFill: '#ffd700',
    highlightStroke: '#ff8c00',
    depths: [
      {
        depth: 0, // Root styling
        fill: '#2c3e50',
        stroke: '#ecf0f1',
        label: '#ecf0f1',
      },
      {
        depth: -1, // Leaf styling
        fill: '#e74c3c',
        stroke: '#c0392b',
        label: '#2c3e50',
      },
    ],
  };
</script>

<CactusTree {width} {height} {nodes} {links} {styles} />
```

### Interactive Features

The component provides several interactive features:

- **Pan**: Click and drag to pan the visualization
- **Zoom**: Use mouse wheel to zoom in/out
- **Hover**: Hover over nodes to highlight connections
- **Link Filtering**: When hovering over leaf nodes, only connected links are shown

## Examples

### Basic Tree

```svelte
<CactusTree
  width={600}
  height={400}
  nodes={[
    { id: 'a', name: 'Root', parent: null },
    { id: 'b', name: 'Branch 1', parent: 'a' },
    { id: 'c', name: 'Branch 2', parent: 'a' },
    { id: 'd', name: 'Leaf 1', parent: 'b' },
    { id: 'e', name: 'Leaf 2', parent: 'b' },
  ]}
/>
```

### With Edge Bundling

```svelte
<CactusTree
  width={800}
  height={600}
  {nodes}
  links={[
    { source: 'leaf1', target: 'leaf3' },
    { source: 'leaf2', target: 'leaf4' },
  ]}
  styles={{
    edge: '#3498db',
    edgeOpacity: 0.3,
    edgeWidth: 2,
  }}
/>
```

### Custom Layout

```svelte
<CactusTree
  width={1000}
  height={800}
  {nodes}
  options={{
    overlap: -0.5,           // Gaps between nodes
    arcSpan: Math.PI,        // Half circle layout
    orientation: Math.PI,    // Leftward growth (180°)
    zoom: 1.5,
  }}
/>
```
