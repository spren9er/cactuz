# cactuz

A modern Svelte library for visualizing hierarchical data structures using the *CactusTree* algorithm with hierarchical edge bundling.

<div align="center">
  <img src="https://github.com/spren9er/cactuz/blob/main/docs/images/cactus_tree_simple.png?raw=true" alt="cactus-tree-simple" width="75%" height="75%">
</div>

## Overview

The library **cactuz** is based on the research paper *[CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling](https://ieeexplore.ieee.org/document/8031596)* by Tommy Dang and Angus Forbes. This implementation provides both a ready-to-use Svelte component and a standalone layout algorithm for creating interactive tree visualizations.

## Features

- **Fractal-based Tree Layout** - Recursively stacks child nodes on parent nodes
- **Hierarchical Edge Bundling** - Groups related connections for cleaner visualization
- **Highly Customizable** - Extensive styling and behavior options
- **Interactive** - Pan, zoom, hover effects, and link filtering
- **Depth-based Styling** - Configure appearance for different tree levels

## Installation

```bash
npm install cactuz
```

## Quick Start

```svelte
<script>
  import { CactusTree } from 'cactuz';

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

See [cactuz.spren9er.de](https://cactuz.spren9er.de) for a live demo and interactive playground.

## API Reference

### CactusTree Component

#### Props

| Prop       | Type      | Required | Default | Description                        |
| ---------- | --------- |:--------:|:-------:| ---------------------------------- |
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
  id: string;                 // Unique identifier
  name: string;               // Display name
  parent: string | null;      // Parent node ID
  weight?: number;            // Optional explicit weight
}
```

#### Link Structure

```typescript
interface Link {
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
  numLabels?: number;         // Number of labels (default: 30)
  edgeOptions?: EdgeOptions;  // Edge-specific interactive settings (bundling, hover behavior)
}

interface EdgeOptions {
  bundlingStrength?: number;  // Edge bundling strength (0..1, default: 0.97)
  strategy?: 'hide' | 'mute'; // Hover behavior when over a leaf: 'hide' hides unrelated edges, 'mute' shows them at reduced opacity (default: 'hide')
  muteOpacity?: number;       // When strategy is 'mute', multiplier applied to unrelated edges (0..1, default: 0.25)
}
```

**Note:** Negative values for `overlap` create gaps and connect nodes with links.

#### Styles

The `styles` prop is a nested object with optional groups and an optional `depths` array containing per-depth overrides. Per-depth overrides take precedence over global group values.

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
  line?: {
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
  line?: {
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

### CactusLayout Class

For non-Svelte usage you can use the layout algorithm directly.

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

```javascript
import { CactusLayout } from 'cactuz';

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

## Advanced Usage

### Global and Depth-based Styling Example

This example demonstrates styles and per-depth overrides. It shows a global style for general appearance, then customizes roots and leaves via `depths`.

```svelte
<script>
  import { CactusTree } from 'cactuz';

  const styles = {
    node: {
      fillColor: '#f0f8ff',
      strokeColor: '#4682b4',
      strokeWidth: 2,
    },
    edge: {
      strokeColor: '#e74c3c',
      strokeOpacity: 0.2,
      strokeWidth: 2,
    },
    label: {
      inner: {
        textColor: '#2c3e50',
        textOpacity: 1,
        fontFamily: 'Arial, sans-serif',
        minFontSize: 8,
        maxFontSize: 16,
      },
      outer: {
        textColor: '#00ff00',
        textOpacity: 1,
        fontFamily: 'Arial, sans-serif',
        minFontSize: 8,
        maxFontSize: 16,
        padding: 2,
        link: {
          strokeColor: '#aaaaaa',
          strokeOpacity: 1,
          strokeWidth: 0.6,
          padding: 1,
        }        
      }
    },
    line: {
      strokeColor: '#cccccc',
      strokeOpacity: 1,
      strokeWidth: 1,
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
          inner: {
            textColor: '#ffffff'
          },
          outer: {
            fontWeight: 'bold'
          }
        },
      },
    ],
  };
</script>

<CactusTree width={800} height={600} {nodes} {links} styles={styles} />
```

### Negative Overlap and Link Filtering

```svelte
<CactusTree
  width={800}
  height={600}
  {nodes}
  options={{
    overlap: -1.1,                  // Gaps between nodes
    arcSpan: 2 * Math.PI,           // Full circle layout (radians)
    orientation: (7 / 9) * Math.PI, // Root orientation (radians)
    zoom: 0.7
  }}
/>
```

<div align="center">
  <img src="https://github.com/spren9er/cactuz/blob/main/docs/images/cactus_tree_advanced.png?raw=true" alt="cactus-tree-advanced" width="75%" height="75%">
</div>

For a negative overlap parameter, nodes are connected by links. Also, when hovering over leaf nodes, only the links connected to that node are shown, while all other links are hidden. This allows for better readability in dense visualizations.
