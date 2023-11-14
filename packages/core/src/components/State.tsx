/* eslint-disable no-case-declarations */
import type { Graph, EventArgs, Cell } from '@antv/x6';
import { FunctionExt, ObjectExt } from '@antv/x6';
import { useEffect, type FC } from 'react';

import { useGraphEvent, useGraphInstance, useGraphStore } from '../hooks';
import type { ChangeItem } from '../store';
import type { GraphOptions, NodeOptions, EdgeOptions, GraphModel } from '../types';

const INNER_CALL = '__inner__';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const preprocess = (key: keyof Cell.Properties, value: any) => {
  if (key === 'position') {
    return {
      x: value.x,
      y: value.y,
    };
  }
  if (key === 'size') {
    return {
      width: value.width,
      height: value.height,
    };
  }
  return {
    [key]: value,
  };
};

const XFlowState: FC<
  Pick<
    GraphOptions,
    | 'centerView'
    | 'centerViewOptions'
    | 'fitView'
    | 'fitViewOptions'
    | 'connectionEdgeOptions'
  >
> = (props) => {
  const { centerView, centerViewOptions, fitView, fitViewOptions } = props;
  const graph = useGraphInstance();
  const updateNode = useGraphStore((state) => state.updateNode);
  const updateEdge = useGraphStore((state) => state.updateEdge);
  const addNodes = useGraphStore((state) => state.addNodes);
  const addEdges = useGraphStore((state) => state.addEdges);
  const removeNodes = useGraphStore((state) => state.removeNodes);
  const removeEdges = useGraphStore((state) => state.removeEdges);
  const changeList = useGraphStore((state) => state.changeList);
  const clearChangeList = useGraphStore((state) => state.clearChangeList);

  const setSelectionStatus = (status: { id: string; selected: boolean }[]) => {
    if (graph) {
      const added = status.filter((item) => item.selected);
      const removed = status.filter((item) => !item.selected);
      graph.select(
        added.map((item) => item.id),
        { [INNER_CALL]: true },
      );
      graph.unselect(
        removed.map((item) => item.id),
        { [INNER_CALL]: true },
      );
    }
  };

  const setAnimatedStatus = (status: { id: string; animated: boolean }[]) => {
    if (graph) {
      status.forEach((item) => {
        const cell = graph.getCellById(item.id);
        if (cell) {
          if (item.animated) {
            cell.attr('line/strokeDasharray', 5, { [INNER_CALL]: true });
            cell.attr('line/style/animation', 'animated-line 30s infinite linear', {
              [INNER_CALL]: true,
            });
          } else {
            cell.attr('line/strokeDasharray', 0, { [INNER_CALL]: true });
            cell.attr('line/style/animation', '', { [INNER_CALL]: true });
          }
        }
      });
    }
  };

  const handleSpecialPropChange = (
    id: string,
    data: Partial<NodeOptions> | Partial<EdgeOptions>,
  ) => {
    if (graph) {
      const keys = Object.keys(data);
      if (keys.includes('selected')) {
        const selected = !!data.selected;
        setSelectionStatus([{ id, selected }]);
      } else if (keys.includes('animated')) {
        const animated = !!data.animated;
        setAnimatedStatus([{ id, animated }]);
      }
    }
  };

  const initData = (g: Graph, data: GraphModel) => {
    g.fromJSON(ObjectExt.cloneDeep(data));

    if (centerView) {
      g.centerContent(centerViewOptions);
    }

    if (fitView) {
      g.zoomToFit({ maxScale: 1, ...fitViewOptions });
    }

    const { nodes, edges }: { nodes: NodeOptions[]; edges: EdgeOptions[] } = data;

    setSelectionStatus([
      ...nodes
        .filter((item) => item.selected)
        .map((item) => ({ id: item.id, selected: true })),
      ...edges
        .filter((item) => item.selected)
        .map((item) => ({ id: item.id, selected: true })),
    ]);

    setAnimatedStatus(
      edges
        .filter((item) => item.animated)
        .map((item) => ({
          id: item.id,
          animated: true,
        })),
    );
  };

  const handleGraphChange = (g: Graph, changes: ChangeItem[]) => {
    changes.forEach((changeItem) => {
      const { command, data } = changeItem;
      switch (command) {
        case 'init':
          initData(g, data);
          break;
        case 'addNodes':
          g.addNodes(ObjectExt.cloneDeep(data), { [INNER_CALL]: true });
          break;
        case 'removeNodes':
          g.removeCells(data, { [INNER_CALL]: true });
          break;
        case 'updateNode':
          const { id: nodeId, data: changedNodeData } = data;
          const node = g.getCellById(nodeId);
          if (node) {
            g.startBatch('updateNode');
            node.prop(changedNodeData, { [INNER_CALL]: true });
            handleSpecialPropChange(nodeId, changedNodeData);
            g.stopBatch('updateNode');
          }
          break;
        case 'addEdges':
          g.addEdges(ObjectExt.cloneDeep(data), { [INNER_CALL]: true });
          break;
        case 'removeEdges':
          g.removeCells(data, { [INNER_CALL]: true });
          break;
        case 'updateEdge':
          const { id: edgeId, data: changedEdgeData } = data;
          const edge = g.getCellById(edgeId);
          if (edge) {
            g.startBatch('updateEdge');
            edge.prop(changedEdgeData, { [INNER_CALL]: true });
            handleSpecialPropChange(edgeId, changedEdgeData);
            g.stopBatch('updateEdge');
          }
          break;
        default:
          break;
      }
    });
    clearChangeList();
  };

  useEffect(() => {
    if (graph && changeList.length) {
      handleGraphChange(graph, changeList);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeList, graph]);

  // Add cells for internal operations
  useGraphEvent('cell:added', ({ cell, options }) => {
    if (!options[INNER_CALL]) {
      if (cell.isNode()) {
        addNodes([cell.toJSON()], { silent: true });
      } else if (cell.isEdge()) {
        addEdges([cell.toJSON()], { silent: true });
      }
    }
  });

  // Remove cells for internal operations
  useGraphEvent('cell:removed', ({ cell, options }) => {
    if (!options[INNER_CALL]) {
      if (cell.isNode()) {
        removeNodes([cell.id], { silent: true });
      } else if (cell.isEdge()) {
        removeEdges([cell.id], { silent: true });
      }
    }
  });

  // Update cells for internal operations
  useGraphEvent(
    'cell:change:*',
    FunctionExt.debounce(
      ({ cell, key, current, options }: EventArgs['cell:change:*']) => {
        if (!options[INNER_CALL]) {
          if (cell.isNode()) {
            updateNode(cell.id, preprocess(key, current), { silent: true });
          } else if (cell.isEdge()) {
            updateEdge(cell.id, { [key]: current }, { silent: true });
          }
        }
      },
      100,
    ),
  );

  useGraphEvent('selection:changed', ({ added, removed, options }) => {
    if (!options[INNER_CALL]) {
      added.forEach((item) => {
        if (item.isNode()) {
          updateNode(item.id, { selected: true }, { silent: true });
        } else if (item.isEdge()) {
          updateEdge(item.id, { selected: true }, { silent: true });
        }
      });

      removed.forEach((item) => {
        if (item.isNode()) {
          updateNode(item.id, { selected: false }, { silent: true });
        } else if (item.isEdge()) {
          updateEdge(item.id, { selected: false }, { silent: true });
        }
      });
    }
  });

  return null;
};

export { XFlowState };
