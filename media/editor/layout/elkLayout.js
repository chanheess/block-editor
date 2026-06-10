/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 ********************************************************************************/
// ELK layout adapter for SysML Editor webview
// Exposes SELAB.applyElkLayout(diagramData, options?) and falls back gracefully.
(function() {
  const NS = (window.SELAB = window.SELAB || {});

  /**
   * Apply ELK (Eclipse Layout Kernel) layout to the given in-memory diagram data.
   * diagramData: { elements: [{id, name, width, height, x, y}], connections: [{id, source, target}] }
   * options: optional ELK layout options
   */
  NS.applyElkLayout = async function(diagramData, options = {}) {
    try {
      if (!diagramData || !Array.isArray(diagramData.elements)) return;
      const ELKCtor = window.ELK;
      if (typeof ELKCtor !== 'function') {
        console.log('[applyElkLayout] ELK not available, using fallback grid');
        fallbackGrid(diagramData);
        return;
      }

      // displaySettings에서 ELK 설정 참조
      const DS = window.SELAB?.Editor?.config?.displaySettings;
      const ELK_CFG = DS?.elk;
  

      const elk = new ELKCtor();
      const nodeById = new Map();
      const idByName = new Map();
      for (const n of diagramData.elements) {
        nodeById.set(n.id, n);
        idByName.set(n.name, n.id);
      }

      function isHierarchicalEdgeKind(kind) {
        if (!kind) return false;
        const k = String(kind).toLowerCase();
        // [SELab.AI] composition/shared는 독립 노드로 렌더링하므로 계층 관계가 아님
        if (k === 'composition' || k.includes('composition') || k === 'shared') {
          return false;
        }
        if (k.includes('inheritance') || k.includes('specialization') || k.includes('generalization')) {
            return false;
        }
        return (
          k.includes('contain') ||
          k.includes('own') ||
          k.includes('aggregate') ||
          k.includes('nest') ||
          k.includes('member') ||
          k.includes('usage') ||
          k.includes('perform') ||
          k.includes('include') ||
          k.includes('has') ||
          k.includes('annotation')  // metadata about 구문의 annotation edge 제외
        );
      }

      const finalLayoutOptions = Object.assign({
          'elk.algorithm': ELK_CFG?.algorithm ?? 'layered',
          'elk.direction': ELK_CFG?.direction ?? 'DOWN',
          'elk.spacing.nodeNode': String(ELK_CFG?.nodeNodeSpacing ?? 80),
          'elk.layered.spacing.nodeNodeBetweenLayers': String(ELK_CFG?.nodeNodeBetweenLayers ?? 80),
          'elk.spacing.componentComponent': String(ELK_CFG?.componentComponentSpacing ?? 80),
          'elk.layered.spacing.edgeNodeBetweenLayers': String(ELK_CFG?.edgeNodeBetweenLayers ?? 40),
          'elk.spacing.edgeNode': String(ELK_CFG?.edgeNodeSpacing ?? 40),
          'elk.layered.considerModelOrder.strategy': ELK_CFG?.modelOrderStrategy ?? 'NODES_AND_EDGES',
          'elk.layered.nodePlacement.strategy': ELK_CFG?.nodePlacement ?? 'BRANDES_KOEPF',
          'elk.layered.nodePlacement.bk.fixedAlignment': ELK_CFG?.nodePlacementBkAlign ?? 'BALANCED',
          'elk.layered.nodePlacement.favorStraightEdges': 'true',
          'elk.layered.unnecessaryBendpoints': 'true',
          'elk.edgeRouting': ELK_CFG?.edgeRouting ?? 'ORTHOGONAL',
          'elk.spacing.edgeEdge': String(ELK_CFG?.edgeEdgeSpacing ?? 15),
          'elk.spacing.edgeEdgeBetweenLayers': String(ELK_CFG?.edgeEdgeBetweenLayers ?? 15),
          'elk.layered.mergeEdges': String(ELK_CFG?.mergeEdges ?? false),
          'elk.layered.mergeHierarchyEdges': String(ELK_CFG?.mergeHierarchyEdges ?? false),
          'elk.layered.crossingMinimization.strategy': ELK_CFG?.crossingMinimization ?? 'LAYER_SWEEP',
          'elk.layered.compaction.postCompaction.strategy': ELK_CFG?.compactionStrategy ?? 'EDGE_LENGTH',
          'elk.layered.compaction.connectedComponents': String(ELK_CFG?.compactConnectedComponents ?? true),
          'elk.layered.thoroughness': String(ELK_CFG?.thoroughness ?? 7),
          'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER'
        }, options || {});

      // Fork 병렬 분기 감지: fork 후속 노드 간 flow 엣지는 ELK 레이어 제약에서 제외
      const forkSuccessors = new Map();
      {
        const allConns = Array.isArray(diagramData.connections) ? diagramData.connections : [];
        for (const e of allConns) {
          const kind = String(e.kind || e.type || '').toLowerCase();
          if (!kind.includes('succession') && !kind.includes('then') && !kind.includes('transition')) continue;
          const s = resolveIdDirect(e.source);
          if (!s) continue;
          const sNode = nodeById.get(s);
          const sKind = String(sNode?.kind || sNode?.type || '').toLowerCase();
          if (!sKind.includes('fork')) continue;
          const t = resolveIdDirect(e.target);
          if (!t) continue;
          if (!forkSuccessors.has(s)) forkSuccessors.set(s, new Set());
          forkSuccessors.get(s).add(t);
        }
      }

      function areForkSiblings(id1, id2) {
        for (const [, successors] of forkSuccessors) {
          if (successors.has(id1) && successors.has(id2)) return true;
        }
        return false;
      }

      // composition 엣지의 타겟 노드 수집 (featuretyping 필터링에서 사용)
      const compositionTargets = new Set();
      {
        const allConns = Array.isArray(diagramData.connections) ? diagramData.connections : [];
        for (const e of allConns) {
          const kind = String(e.kind || e.type || '').toLowerCase();
          if (kind === 'composition' || kind.includes('composition') || kind === 'shared') {
            const t = e.target;
            if (t && nodeById.has(t)) {
              compositionTargets.add(t);
            } else if (t && idByName.has(t)) {
              compositionTargets.add(idByName.get(t));
            }
          }
        }
      }

      // 엣지 수집
      const allElkEdges = (() => {
        const all = Array.isArray(diagramData.connections) ? diagramData.connections : [];
        const kept = [];
        const seenPairs = new Set();

        // 1차: 기존 엣지 처리 (직접 해석만, 부모 폴백 없음)
        for (const e of all) {
          const kind = e.kind || e.type;
          if (isHierarchicalEdgeKind(kind) && !e.kindClass) {
            continue;
          }
          let s = resolveIdDirect(e.source);
          let t = resolveIdDirect(e.target);
          // border node(port) → 부모 노드 해석 (featuretyping 에지 라우팅 지원)
          const kindLower = String(kind || '').toLowerCase();
          if (kindLower === 'featuretyping') {
            if (!s) s = resolveId(e.source);
            if (!t) t = resolveId(e.target);
          }
          if (!s || !t || s === t) {
            continue;
          }
          // specialization 엣지: ELK 레이아웃에서 제외
          // (computeCustomBDDLayout이 spec 노드를 별도 배치하므로 ELK 경로는 무의미)
          if (kindLower === 'specialization' || kindLower === 'inheritance' || kindLower === 'generalization') {
            continue;
          }
          // cross-container association/connector: ELK에서 제외 (레이아웃 왜곡 방지)
          if (kindLower === 'association' || kindLower === 'connector') {
            const sNode = nodeById.get(s);
            const tNode = nodeById.get(t);
            const sParent = sNode?.parent || '';
            const tParent = tNode?.parent || '';
            if (sParent !== tParent) continue;
          }
          // cross-container featuretyping 엣지는 ELK에서 제외
          // (내부→외부 연결이 컨테이너 레이아웃을 왜곡하므로 mxGraph auto-routing에 위임)
          // 단, composition 타겟 노드의 featuretyping은 같은 레벨로 승격되므로 포함
          if (kindLower === 'featuretyping') {
            const sNode = nodeById.get(s);
            const tNode = nodeById.get(t);
            const sIsCompositionTarget = compositionTargets && compositionTargets.has(s);
            if (!sIsCompositionTarget) {
              const sParent = sNode?.parent || '';
              const tParent = tNode?.parent || '';
              if (sParent !== tParent) continue;
            }
          }
          const pairKey = `${s}__${t}`;
          seenPairs.add(pairKey);
          kept.push({ id: e.id || pairKey, sources: [s], targets: [t] });
        }

        // 2차: flow 엣지의 border node → 부모 노드 해석 (같은 컨테이너 내부만)
        for (const e of all) {
          const kind = String(e.kind || e.type || '').toLowerCase();
          if (!kind.includes('flow')) continue;
          const s = resolveId(e.source);
          const t = resolveId(e.target);
          if (!s || !t || s === t) continue;
          // fork 병렬 분기 간 flow 엣지는 레이어 제약에서 제외
          if (areForkSiblings(s, t)) continue;
          const pairKey = `${s}__${t}`;
          if (seenPairs.has(pairKey)) continue;
          const sNode = nodeById.get(s);
          const tNode = nodeById.get(t);
          if (!sNode || !tNode) continue;
          if (!sNode.parent || !tNode.parent || sNode.parent !== tNode.parent) continue;
          seenPairs.add(pairKey);
          kept.push({ id: e.id || `flow_${pairKey}`, sources: [s], targets: [t] });
        }

        // 3차: body 타겟 → succession 타겟 가상 엣지 추가 (레이어 분리용)
        const bodyTgts = new Map();
        const succTgts = new Map();
        for (const e of all) {
          const kind = String(e.kind || e.type || '').toLowerCase();
          const s = resolveIdDirect(e.source);
          const t = resolveIdDirect(e.target);
          if (!s || !t || s === t) continue;
          if (kind === 'body') {
            if (!bodyTgts.has(s)) bodyTgts.set(s, []);
            bodyTgts.get(s).push(t);
          }
          if (kind.includes('succession') || kind.includes('then') || kind.includes('transition')) {
            if (!succTgts.has(s)) succTgts.set(s, []);
            succTgts.get(s).push(t);
          }
        }
        for (const [src, bts] of bodyTgts) {
          const sts = succTgts.get(src) || [];
          for (const bt of bts) {
            for (const st of sts) {
              if (bt === st) continue;
              const pairKey = `${bt}__${st}`;
              if (seenPairs.has(pairKey)) continue;
              seenPairs.add(pairKey);
              kept.push({ id: `_implicit_${pairKey}`, sources: [bt], targets: [st] });
            }
          }
        }

        return kept;
      })();

      // 부모 관계 맵 구축 (LCA 기반 엣지 배분용)
      const parentOf = new Map();
      for (const n of diagramData.elements) {
        if (n.parent) {
          const pid = nodeById.has(n.parent) ? n.parent : (idByName.get(n.parent) || null);
          if (pid && nodeById.has(pid)) parentOf.set(n.id, pid);
        }
      }

      // LCA 기반 엣지 배분: 같은 컨테이너 내 엣지는 해당 컨테이너 레벨에 배치
      function getAncestorChain(nid) {
        const chain = [];
        let cur = nid;
        while (cur) {
          chain.push(cur);
          cur = parentOf.get(cur) || null;
        }
        chain.push('root');
        return chain;
      }

      function findEdgeLCA(id1, id2) {
        const chain1 = getAncestorChain(id1);
        const set2 = new Set(getAncestorChain(id2));
        for (const a of chain1) {
          if (set2.has(a)) return a;
        }
        return 'root';
      }

      const edgesByContainer = new Map();
      edgesByContainer.set('root', []);
      for (const edge of allElkEdges) {
        const lca = findEdgeLCA(edge.sources[0], edge.targets[0]);
        if (!edgesByContainer.has(lca)) edgesByContainer.set(lca, []);
        edgesByContainer.get(lca).push(edge);
      }

      // 컨테이너 노드에 엣지 부착
      function attachEdgesToHierarchy(node) {
        const containerEdges = edgesByContainer.get(node.id);
        if (containerEdges && containerEdges.length > 0) {
          node.edges = containerEdges;
        }
        if (node.children) {
          for (const child of node.children) attachEdgesToHierarchy(child);
        }
      }

      const elkChildren = buildHierarchy(diagramData.elements);
      const elkGraph = {
        id: 'root',
        layoutOptions: finalLayoutOptions,
        children: elkChildren,
        edges: edgesByContainer.get('root') || [],
      };
      for (const child of elkGraph.children) attachEdgesToHierarchy(child);

      // 직접 해석만 (부모 폴백 없음) - 메인 엣지 루프용
      function resolveIdDirect(ref) {
        if (!ref) return null;
        if (nodeById.has(ref)) return ref;
        return idByName.get(ref) || null;
      }

      // 부모 폴백 포함 - flow 엣지 및 computeRanks용
      function resolveId(ref) {
        if (!ref) return null;
        if (nodeById.has(ref)) return ref;
        const byNameResult = idByName.get(ref);
        if (byNameResult) return byNameResult;
        // Border node/port → 부모 노드로 해석 (data flow 엣지 레이어링 지원)
        let current = String(ref);
        while (true) {
          const sepIdx = current.lastIndexOf('::');
          if (sepIdx <= 0) break;
          current = current.substring(0, sepIdx);
          if (nodeById.has(current)) return current;
          const parentByName = idByName.get(current);
          if (parentByName) return parentByName;
        }
        return null;
      }

      // Build compound hierarchy for ELK using explicit parent or qualified name ("::") inference.
      function buildHierarchy(nodes) {
        const byId = new Map(nodes.map(n => [n.id, n]));
        const byName = new Map(nodes.map(n => [n.name, n]));
        const parentIdOf = new Map(); // childId -> parentId

        function findQualifiedParentId(el) {
          if (!el || !el.name) return null;
          const parts = String(el.name).split('::');
          if (parts.length <= 1) return null;
          // try longest prefix first
          for (let i = parts.length - 1; i > 0; i--) {
            const prefix = parts.slice(0, i).join('::');
            const p = byName.get(prefix);
            if (p) return p.id;
          }
          return null;
        }

        // Assign parents: prefer explicit element.parent (id or name), else infer from qualified name
        for (const n of nodes) {
          const nodeType = String(n.type || '').toLowerCase();
          let pid = null;
          if (n.parent) {
            pid = byId.has(n.parent) ? n.parent : (byName.get(String(n.parent))?.id || null);
          }
          // composition target은 hierarchy.js에서 Package 레벨로 설정됨 → qualified name fallback 건너뜀
          if (!pid && !compositionTargets.has(n.id)) {
            pid = findQualifiedParentId(n);
          }
          // composition 타겟 노드는 hierarchy.js에서 이미 Package 레벨로 승격됨
          // buildHierarchy에서 추가 승격 불필요
          if (pid && pid !== n.id && byId.has(pid)) {
            parentIdOf.set(n.id, pid);
          }
        }

        // Build children lists
        const childrenOf = new Map(); // parentId -> childIds[]
        for (const n of nodes) {
          const pid = parentIdOf.get(n.id) || 'root';
          if (!childrenOf.has(pid)) childrenOf.set(pid, []);
          childrenOf.get(pid).push(n.id);
        }

        function roleWeight(n) {
          const r = String(n.role || '').toLowerCase();
          const t = String(n.type || '').toLowerCase();
          if (r === 'initial' || t === 'startaction') return -1;
          if (r === 'fork') return 0;
          // ElseIfAction/ElseAction은 then ActionUsage보다 뒤에 배치
          if (t === 'elseifaction') return 1.5;
          if (t === 'elseaction') return 1.8;
          if (t.includes('action') && !t.includes('definition')) return 1;
          if (r === 'join') return 2;
          if (r === 'final') return 3;
          return 2;
        }

        // Compute topological ranks within a container using in-container controlflow edges
        function computeRanks(parentId) {
          const childIds = new Set(childrenOf.get(parentId) || []);
          const indeg = new Map();
          const adj = new Map();
          // init
          for (const cid of childIds) { indeg.set(cid, 0); adj.set(cid, []); }
          // collect edges inside this container
          const allConns = Array.isArray(diagramData.connections) ? diagramData.connections : [];
          // body 엣지의 소스→타겟 매핑 (암시적 순서 생성용)
          const bodyTargetsBySource = new Map();
          const successionTargetsBySource = new Map();
          for (const e of allConns) {
            const kind = String(e.kind || e.type || '').toLowerCase();
            const s = resolveId(e.source);
            const t = resolveId(e.target);
            if (!s || !t || s === t || !childIds.has(s) || !childIds.has(t)) continue;
            if (kind === 'body') {
              if (!bodyTargetsBySource.has(s)) bodyTargetsBySource.set(s, []);
              bodyTargetsBySource.get(s).push(t);
            }
            if (kind.includes('succession') || kind.includes('then') || kind.includes('transition')) {
              if (!successionTargetsBySource.has(s)) successionTargetsBySource.set(s, []);
              successionTargetsBySource.get(s).push(t);
            }
            if (!(kind.includes('control') || kind.includes('flow') || kind.includes('succession') || kind.includes('then') || kind.includes('transition') || kind === 'body' || kind === 'composition' || kind === 'shared' || kind === 'featuretyping')) continue;
            // fork 병렬 분기 간 flow 엣지는 순서 제약에서 제외
            if (kind.includes('flow') && areForkSiblings(s, t)) continue;
            adj.get(s).push(t);
            indeg.set(t, (indeg.get(t) || 0) + 1);
          }
          // body 타겟 → succession 타겟 암시적 순서 추가
          // (loop body는 loop 종료 후 실행되는 노드보다 먼저 배치)
          for (const [src, bodyTargets] of bodyTargetsBySource) {
            const succTargets = successionTargetsBySource.get(src) || [];
            for (const bt of bodyTargets) {
              for (const st of succTargets) {
                if (bt !== st && childIds.has(bt) && childIds.has(st)) {
                  adj.get(bt).push(st);
                  indeg.set(st, (indeg.get(st) || 0) + 1);
                }
              }
            }
          }
          // Kahn's algorithm to assign ranks (longest distance from sources)
          const rank = new Map();
          const q = [];
          for (const cid of childIds) {
            if ((indeg.get(cid) || 0) === 0) { q.push(cid); rank.set(cid, 0); }
          }
          while (q.length > 0) {
            const u = q.shift();
            const ru = rank.get(u) || 0;
            for (const v of (adj.get(u) || [])) {
              const newRank = Math.max(ru + 1, rank.get(v) || 0);
              rank.set(v, newRank);
              indeg.set(v, (indeg.get(v) || 0) - 1);
              if ((indeg.get(v) || 0) === 0) q.push(v);
            }
          }

          // 사이클 처리: ranked 노드에서 BFS로 unranked 후속 노드에 rank 전파
          const propagateQ = [];
          for (const cid of childIds) {
            if (rank.has(cid)) propagateQ.push(cid);
          }
          while (propagateQ.length > 0) {
            const u = propagateQ.shift();
            const ru = rank.get(u) || 0;
            for (const v of (adj.get(u) || [])) {
              if (!rank.has(v)) {
                rank.set(v, ru + 1);
                propagateQ.push(v);
              }
            }
          }

          return rank;
        }

        function toElkChildren(parentId) {
          const childIds = (childrenOf.get(parentId) || []).slice();
          const ranks = computeRanks(parentId);
          childIds.sort((a, b) => {
            const na = byId.get(a) || {}; const nb = byId.get(b) || {};
            // import된 패키지는 뒤로 (현재 패키지가 위, import 패키지가 아래)
            const ia = na.isImported ? 1 : 0;
            const ib = nb.isImported ? 1 : 0;
            if (ia !== ib) return ia - ib;
            const ra = ranks.has(a) ? ranks.get(a) : 0;
            const rb = ranks.has(b) ? ranks.get(b) : 0;
            if (ra !== rb) return ra - rb;
            const wa = roleWeight(na); const wb = roleWeight(nb);
            if (wa !== wb) return wa - wb;
            const an = String(na.name || ''); const bn = String(nb.name || '');
            return an.localeCompare(bn);
          });

          // 부모가 IfAction인지 확인 (partitioning 적용 대상)
          const parentNode = byId.get(parentId);
          const parentTypeLower = String(parentNode?.type || '').toLowerCase();
          const parentIsIfAction = parentTypeLower.includes('ifaction');

          const elkChildren = childIds.map((cid) => {
            const n = byId.get(cid);
            // collapsed 상태이면 자식 무시하고 leaf 노드로 처리
            const hasKids = childrenOf.has(n.id) && !n._collapsed;
            if (hasKids) {
              const typeLower = String(n.type || '').toLowerCase();
              const isIfAction = typeLower.includes('ifaction') || typeLower === 'elseifaction' || typeLower === 'elseaction';
              const isWhileLoop = typeLower.includes('whileloop');
              
              // IfActionUsage needs more top padding for condition label and branch labels (then/else)
              const CP = ELK_CFG?.containerPadding;
              const basePaddingTop = isIfAction ? (CP?.ifActionTop ?? 90) : (CP?.top ?? 10);
              // precomputeNodeSizes에서 계산한 compartment 높이를 basePaddingTop에 가산
              const paddingTop = basePaddingTop + (n._precomputedPaddingTop || 0);
              
              // WhileLoopActionUsage needs more bottom padding for 'until condition' label
              const paddingBottom = isWhileLoop ? (CP?.whileLoopBottom ?? 70) : (CP?.bottom ?? 10);

              // 컨테이너 내부: containerChildSpacing으로 actor 등 엣지 없는 자식 노드 간 세로 간격 제어
              // (별도 connected component로 처리되므로 componentComponentSpacing 사용)
              const childSpacing = String(ELK_CFG?.containerChildSpacing ?? 40);
              // actionFlow compartment가 있는 컨테이너는 spacing 축소
              const hasActionFlow = Array.isArray(n.compartments) &&
                n.compartments.some(c => c.key === 'actionFlow');
              const AF = ELK_CFG?.actionFlow;
              const betweenLayers = hasActionFlow
                ? String(AF?.nodeNodeBetweenLayers ?? 50)
                : String(ELK_CFG?.nodeNodeBetweenLayers ?? 80);
              const edgeNodeBL = hasActionFlow
                ? String(AF?.edgeNodeBetweenLayers ?? 20)
                : String(ELK_CFG?.edgeNodeBetweenLayers ?? 40);
              const edgeNodeSp = hasActionFlow
                ? String(AF?.edgeNodeSpacing ?? 20)
                : String(ELK_CFG?.edgeNodeSpacing ?? 40);

              const containerLayoutOpts = {
                  'elk.padding': `top=${paddingTop},left=${CP?.left ?? 10},right=${CP?.right ?? 10},bottom=${paddingBottom}`,
                  'elk.spacing.nodeNode': String(ELK_CFG?.nodeNodeSpacing ?? 80),
                  'elk.layered.spacing.nodeNodeBetweenLayers': betweenLayers,
                  'elk.spacing.componentComponent': childSpacing,
                  'elk.layered.spacing.edgeNodeBetweenLayers': edgeNodeBL,
                  'elk.spacing.edgeNode': edgeNodeSp,
                  'elk.algorithm': ELK_CFG?.algorithm ?? 'layered',
                  'elk.direction': ELK_CFG?.direction ?? 'DOWN',
                  'elk.edgeRouting': ELK_CFG?.edgeRouting ?? 'ORTHOGONAL',
                  'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
                  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED'
              };

              const elkNodeChildren = toElkChildren(n.id);
              const elkNode = {
                id: n.id,
                labels: n.name ? [{ text: String(n.name) }] : undefined,
                layoutOptions: containerLayoutOpts,
                children: elkNodeChildren,
              };

              // IfAction 컨테이너: 자식 간 보이지 않는 순서 엣지로 세로 순서 강제
              if (isIfAction && elkNodeChildren.length > 1) {
                const orderEdges = [];
                for (let oi = 0; oi < elkNodeChildren.length - 1; oi++) {
                  orderEdges.push({
                    id: `__order_${elkNodeChildren[oi].id}_${elkNodeChildren[oi + 1].id}`,
                    sources: [elkNodeChildren[oi].id],
                    targets: [elkNodeChildren[oi + 1].id],
                  });
                }
                elkNode.edges = (elkNode.edges || []).concat(orderEdges);
              }

              return elkNode;
            } else {
              // [FIX] Start/Finalize nodes are rendered as small circles.
              // Force small size to prevent large gaps in edges.
              // ActionUsage 계열 타입만 이름으로 Start/Finalize 판별
              // item def Start 등은 제외 (ActionUsage, AcceptActionUsage, StartAction 등만 해당)
              const nameLower = String(n.name || '').toLowerCase();
              const kindLower = String(n.kind || '').toLowerCase();
              const isActionType = kindLower.includes('action') || kindLower === 'startaction' || kindLower === 'doneaction';
              
              if (isActionType && (nameLower === 'start' || nameLower === 'finalize')) {
                const SA = DS?.specialNode?.startAction;
                return {
                  id: n.id,
                  width: Number(n.width) || SA?.width || 28,
                  height: Number(n.height) || SA?.height || 28,
                  labels: n.name ? [{ text: String(n.name) }] : undefined,
                };
              }
              // DoneAction / FinalNode: 이중 원으로 렌더링되는 노드
              if (kindLower === 'doneaction' || kindLower === 'finalnode' ||
                  (isActionType && nameLower === 'done')) {
                const DA = DS?.specialNode?.doneAction;
                return {
                  id: n.id,
                  width: DA?.width ?? 34,
                  height: DA?.height ?? 34,
                  labels: n.name ? [{ text: String(n.name) }] : undefined,
                };
              }

              // collapsed 노드는 최소 크기로 강제 (precomputeNodeSizes 덮어쓰기 방지)
              if (n._collapsed) {
                return {
                  id: n.id,
                  width: 120,
                  height: 40,
                  labels: n.name ? [{ text: String(n.name) }] : undefined,
                };
              }

              // Compartment가 있는 노드는 precomputeNodeSizes에서 이미 계산됨
              // ELK는 그 값을 그대로 사용
              let w = Number(n.width || (DS?.nodePrecompute?.minWidth ?? 120));
              let h = Number(n.height || 60);
              
              // ELK의 자체 계산은 사용하지 않음 (precomputeNodeSizes가 더 정확함)
              if (false && n.compartments && Array.isArray(n.compartments)) {
                // 실제 mxGraph 렌더링에 맞춘 상수
                const LABEL_LINE_HEIGHT = 16;
                const LABEL_PADDING_VERTICAL = 20;
                const COMPARTMENT_HEADER_HEIGHT = 18;
                const COMPARTMENT_ITEM_HEIGHT = 16;
                const COMPARTMENT_MARGIN = 6;
                const PADDING_X = 16; // 좌우 패딩 (8px * 2)
                const DOC_INDENT = 8; // doc compartment 들여쓰기
                
                // Canvas를 사용한 실제 텍스트 너비 측정
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                ctx.font = '11px Arial'; // mxGraph 기본 폰트
                
                function measureTextWidth(text) {
                  return ctx.measureText(text).width;
                }
                
                // 텍스트 줄바꿈 계산 함수 (실제 텍스트 너비 기반)
                function calculateWrappedLines(text, maxTextWidth) {
                  if (!text) return 1;
                  const lines = String(text).split('\n');
                  let totalLines = 0;
                  
                  for (const line of lines) {
                    if (!line) {
                      totalLines += 1;
                      continue;
                    }
                    
                    // 실제 텍스트 너비 측정
                    const lineWidth = measureTextWidth(line);
                    
                    if (lineWidth <= maxTextWidth) {
                      totalLines += 1;
                    } else {
                      // 단어 단위로 줄바꿈 (공백과 콜론 기준)
                      const words = line.split(/[\s:]+/).filter(w => w);
                      let currentLine = '';
                      let wrappedLineCount = 1;
                      
                      for (let i = 0; i < words.length; i++) {
                        const word = words[i];
                        const testLine = currentLine ? currentLine + ' ' + word : word;
                        const testWidth = measureTextWidth(testLine);
                        
                        if (testWidth > maxTextWidth && currentLine) {
                          // 현재 줄이 너무 길면 다음 줄로
                          wrappedLineCount++;
                          currentLine = word;
                        } else {
                          currentLine = testLine;
                        }
                      }
                      
                      totalLines += wrappedLineCount;
                    }
                  }
                  
                  return totalLines;
                }
                
                // 1단계: 필요한 너비 결정
                let maxWidth = 200; // 기본 최소 너비
                
                for (const comp of n.compartments) {
                  const items = Array.isArray(comp.items) ? comp.items : [];
                  const isDoc = comp.key === 'doc';
                  
                  for (const item of items) {
                    let itemText = '';
                    if (typeof item === 'object') {
                      itemText = isDoc ? (item.body || '') : (item.name || item.id || '');
                    } else {
                      itemText = String(item);
                    }
                    
                    // 가장 긴 단어의 실제 너비 측정
                    const words = itemText.split(/\s+/);
                    let maxWordWidth = 0;
                    for (const word of words) {
                      const wordWidth = measureTextWidth(word);
                      maxWordWidth = Math.max(maxWordWidth, wordWidth);
                    }
                    
                    const minWidth = maxWordWidth + PADDING_X + (isDoc ? DOC_INDENT : 0);
                    maxWidth = Math.max(maxWidth, minWidth);
                  }
                }
                
                // 최대 너비 제한
                maxWidth = Math.min(maxWidth, 300);
                
                // 2단계: 확정된 너비로 높이 계산
                const labelText = String(n.name || '');
                
                // 라벨도 너비 기반 줄바꿈 계산
                const labelAvailableWidth = maxWidth - PADDING_X;
                const labelWrappedLines = calculateWrappedLines(labelText, labelAvailableWidth);
                let totalHeight = labelWrappedLines * LABEL_LINE_HEIGHT + LABEL_PADDING_VERTICAL;
                
                for (const comp of n.compartments) {
                  const items = Array.isArray(comp.items) ? comp.items : [];
                  if (items.length === 0) continue;
                  
                  totalHeight += COMPARTMENT_HEADER_HEIGHT;
                  
                  const isDoc = comp.key === 'doc';
                  const availableWidth = maxWidth - PADDING_X - (isDoc ? DOC_INDENT : 0);
                  
                  for (const item of items) {
                    let itemText = '';
                    if (typeof item === 'object') {
                      itemText = isDoc ? (item.body || '') : (item.name || item.id || '');
                    } else {
                      itemText = String(item);
                    }
                    
                    const wrappedLines = calculateWrappedLines(itemText, availableWidth);
                    const itemHeight = wrappedLines * COMPARTMENT_ITEM_HEIGHT;
                    totalHeight += itemHeight;
                  }
                  
                  totalHeight += COMPARTMENT_MARGIN;
                }
                
                totalHeight += COMPARTMENT_MARGIN;
                
                w = maxWidth;
                h = totalHeight;
              }

              const elkNode = {
                id: n.id,
                width: w,
                height: h,
                labels: n.name ? [{ text: String(n.name) }] : undefined,
              };

              return elkNode;
            }
          });

          return elkChildren;
        }

        return toElkChildren('root');
      }

      const result = await elk.layout(elkGraph);
      
      // Apply computed positions (and sizes) recursively to our diagramData
      // ELK 원본 상대 좌표(relativeX, relativeY)와 절대 좌표(x, y) 모두 저장
      // - mxGraph: relativeX, relativeY 사용 (부모 기준 상대 좌표)
      // - SVG: x, y 사용 (절대 좌표)
      function applyPositions(elkNode, offsetX, offsetY) {
        if (!elkNode || !Array.isArray(elkNode.children)) return;
        for (const child of elkNode.children) {
          const n = nodeById.get(child.id);
          const relX = Number(child.x || 0);
          const relY = Number(child.y || 0);
          const absX = Number(offsetX + relX);
          const absY = Number(offsetY + relY);
          if (n) {
            n.relativeX = relX;
            n.relativeY = relY;
            n.x = absX;
            n.y = absY;
            if (typeof child.width === 'number') n.width = Math.max(20, child.width);
            if (typeof child.height === 'number') n.height = Math.max(20, child.height);
          }
          if (Array.isArray(child.children)) {
            applyPositions(child, absX, absY);
          }
        }
      }
      applyPositions(result, 0, 0);

      // BDD specialization 커스텀 레이아웃 적용
      clampChildrenToParent(diagramData.elements, nodeById);
      computeCustomBDDLayout(diagramData, nodeById);

      /**
       * ELK 엣지 라우팅 결과를 diagramData.connections에 적용
       * @param {Object} elkNode - ELK 레이아웃 결과 노드
       * @param {number} offsetX - X 오프셋
       * @param {number} offsetY - Y 오프셋
       */
      function applyEdgeRouting(elkNode, offsetX, offsetY) {
        if (!elkNode) return;

        // 현재 레벨의 엣지 처리
        if (Array.isArray(elkNode.edges)) {
          for (const elkEdge of elkNode.edges) {
            const connection = diagramData.connections.find(c => c.id === elkEdge.id);
            if (!connection) continue;

            // ELK edge sections에서 경로 정보 추출
            if (elkEdge.sections && elkEdge.sections.length > 0) {
              const section = elkEdge.sections[0];
              const waypoints = [];

              // 시작점
              if (section.startPoint) {
                waypoints.push({
                  x: offsetX + section.startPoint.x,
                  y: offsetY + section.startPoint.y
                });
              }

              // 중간점 (bendPoints)
              if (Array.isArray(section.bendPoints)) {
                section.bendPoints.forEach(bp => {
                  waypoints.push({
                    x: offsetX + bp.x,
                    y: offsetY + bp.y
                  });
                });
              }

              // 끝점
              if (section.endPoint) {
                waypoints.push({
                  x: offsetX + section.endPoint.x,
                  y: offsetY + section.endPoint.y
                });
              }

              if (waypoints.length >= 2) {
                connection.waypoints = waypoints;
              }
            }
          }
        }

        // 자식 노드의 엣지 재귀 처리
        if (Array.isArray(elkNode.children)) {
          for (const child of elkNode.children) {
            const absX = offsetX + (child.x || 0);
            const absY = offsetY + (child.y || 0);
            applyEdgeRouting(child, absX, absY);
          }
        }
      }

      // Apply edge routing from ELK
      applyEdgeRouting(result, 0, 0);

      // Post-process: align nodes in the same container & rank horizontally
      // RE-ENABLED: ELK spacing을 고려하도록 개선된 alignRanks 사용
      if (typeof NS.alignRanks === 'function') {
        try { 
          NS.alignRanks(diagramData, { 
            debug: true,  // 디버그 모드 활성화하여 로그 확인
            preserveElkSpacing: false  // 강제 정렬 모드로 테스트
          }); 
        } catch (e) { 
          console.log('[applyElkLayout] alignRanks failed', e); 
        }
      }
    } catch (err) {
      console.log('[applyElkLayout] error - falling back to grid', err);
      fallbackGrid(diagramData);
    }
  };

  // compound 자식 노드를 부모 경계 안으로 클램핑
  function clampChildrenToParent(elements, nodeById) {
    const PADDING = 30;
    for (const n of elements) {
      if (!n.parent) continue;
      const parent = nodeById.get(n.parent);
      if (!parent) continue;
      const minX = (parent.x || 0) + PADDING;
      const minY = (parent.y || 0) + PADDING;
      const maxX = (parent.x || 0) + (parent.width || 0) - PADDING - (n.width || 0);
      const maxY = (parent.y || 0) + (parent.height || 0) - PADDING - (n.height || 0);
      n.x = Math.min(Math.max(n.x || 0, minX), Math.max(minX, maxX));
      n.y = Math.min(Math.max(n.y || 0, minY), Math.max(minY, maxY));
    }
  }

  // SysML BDD specialization 계층 커스텀 레이아웃
  // ELK 결과 위에서 spec 관계 기반 노드를 재배치
  function computeCustomBDDLayout(diagramData, nodeById) {
    const elements = diagramData.elements || [];
    const connections = diagramData.connections || [];

    // spec 그래프 구축 (data: source=subtype, target=supertype)
    const specParentsOf = new Map();  // nodeId → [parentIds]
    const specChildrenOf = new Map(); // nodeId → [childIds]

    for (const e of connections) {
      const kind = String(e.kind || e.type || '').toLowerCase();
      if (kind !== 'specialization' && kind !== 'inheritance' && kind !== 'generalization') continue;
      const child = e.source;
      const parent = e.target;
      if (!nodeById.has(child) || !nodeById.has(parent)) continue;
      if (!specParentsOf.has(child)) specParentsOf.set(child, []);
      specParentsOf.get(child).push(parent);
      if (!specChildrenOf.has(parent)) specChildrenOf.set(parent, []);
      specChildrenOf.get(parent).push(child);
    }

    if (specParentsOf.size === 0) return;

    // spec 레벨 계산 (longest-path, 메모이제이션)
    const specLevel = new Map();
    function getSpecLevel(nid) {
      if (specLevel.has(nid)) return specLevel.get(nid);
      const parents = specParentsOf.get(nid) || [];
      if (parents.length === 0) {
        specLevel.set(nid, 0);
        return 0;
      }
      // 순환 방지
      specLevel.set(nid, -1);
      const lv = Math.max(...parents.map(p => {
        const pl = getSpecLevel(p);
        return pl < 0 ? 0 : pl;
      })) + 1;
      specLevel.set(nid, lv);
      return lv;
    }

    const allSpecNodes = new Set();
    for (const [child, parents] of specParentsOf) {
      allSpecNodes.add(child);
      for (const p of parents) allSpecNodes.add(p);
    }
    for (const nid of allSpecNodes) getSpecLevel(nid);

    // usage 노드(partusage 등)는 spec 레이아웃에서 제외
    const isUsageNode = (nid) => {
      const n = nodeById.get(nid);
      if (!n) return false;
      return String(n.kind || n.type || '').toLowerCase().includes('usage');
    };

    // 레벨별 노드 그룹
    const byLevel = new Map();
    for (const [nid, lv] of specLevel) {
      if (isUsageNode(nid)) continue;
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv).push(nid);
    }

    if (byLevel.size === 0) return;

    const maxLevel = Math.max(...byLevel.keys());

    // Rule H2-1: containment(부모-자식 서브트리)는 specialization 배치 이후에도
    // ELK가 계산한 상대 구조(H2-2~H2-8)를 그대로 보존해야 한다.
    // → spec 노드를 이동시킬 때 containment 자식 전체를 같은 델타(dx, dy)만큼
    //    함께 이동시켜(rigid translation) ELK가 만든 서브트리 구조를 깨지 않는다.
    const childrenOf = new Map(); // parentId → childId[]
    for (const n of elements) {
      if (n.parent) {
        if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, []);
        childrenOf.get(n.parent).push(n.id);
      }
    }

    function collectSubtreeIds(nodeId, set) {
      set.add(nodeId);
      for (const cid of (childrenOf.get(nodeId) || [])) collectSubtreeIds(cid, set);
      return set;
    }

    // Rule H2-6: parent.width/height = containment 자식들의 union bbox(+padding)를 덮도록 보정.
    // ELK가 일부 컴파운드 노드(예: Vehicle)의 박스 크기를 자식 전체(예: PowerTrain)를
    // 포함하지 못하게 산출한 경우, 자식이 부모 박스 밖으로 넘치는 문제를 해결한다.
    // post-order(자식 먼저)로 처리해 중첩 컨테이너도 누적 보정되도록 한다.
    (function enforceContainerBounds() {
      const PADDING = 30;
      const visited = new Set();
      function process(nodeId) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        const kids = childrenOf.get(nodeId) || [];
        for (const cid of kids) process(cid);
        if (kids.length === 0) return;
        const n = nodeById.get(nodeId);
        if (!n) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const cid of kids) {
          const c = nodeById.get(cid);
          if (!c) continue;
          minX = Math.min(minX, c.x || 0);
          minY = Math.min(minY, c.y || 0);
          maxX = Math.max(maxX, (c.x || 0) + (c.width || 0));
          maxY = Math.max(maxY, (c.y || 0) + (c.height || 0));
        }
        if (minX === Infinity) return;
        const curMinX = n.x || 0;
        const curMinY = n.y || 0;
        const curMaxX = curMinX + (n.width || 0);
        const curMaxY = curMinY + (n.height || 0);
        const newMinX = Math.min(curMinX, minX - PADDING);
        const newMinY = Math.min(curMinY, minY - PADDING);
        const newMaxX = Math.max(curMaxX, maxX + PADDING);
        const newMaxY = Math.max(curMaxY, maxY + PADDING);
        n.x = newMinX;
        n.y = newMinY;
        n.width = newMaxX - newMinX;
        n.height = newMaxY - newMinY;
        if (n.parent) {
          const par = nodeById.get(n.parent);
          if (par) {
            n.relativeX = n.x - (par.x || 0);
            n.relativeY = n.y - (par.y || 0);
          }
        } else {
          n.relativeX = n.x;
          n.relativeY = n.y;
        }
      }
      for (const n of elements) process(n.id);
    })();

    // Rule H2-6: subtree bounding box (parent.width = Σ child subtree width의 시각적 근거)
    function getSubtreeBBox(nodeId, ids) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of ids) {
        const n = nodeById.get(id);
        if (!n) continue;
        minX = Math.min(minX, n.x || 0);
        minY = Math.min(minY, n.y || 0);
        maxX = Math.max(maxX, (n.x || 0) + (n.width || 0));
        maxY = Math.max(maxY, (n.y || 0) + (n.height || 0));
      }
      if (minX === Infinity) {
        const n = nodeById.get(nodeId);
        return { minX: n?.x || 0, minY: n?.y || 0, maxX: (n?.x || 0) + (n?.width || 0), maxY: (n?.y || 0) + (n?.height || 0), width: n?.width || 120, height: n?.height || 120 };
      }
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    // 서브트리 전체를 (dx, dy)만큼 이동. 같은 서브트리 내부 엣지의 waypoints도 함께 이동.
    // 서브트리 경계를 가로지르는 엣지의 waypoints는 더 이상 유효하지 않으므로 제거(mxGraph 자동 라우팅에 위임).
    function moveSubtree(nodeId, dx, dy, ids) {
      if (dx === 0 && dy === 0) return;
      for (const id of ids) {
        const n = nodeById.get(id);
        if (!n) continue;
        n.x = (n.x || 0) + dx;
        n.y = (n.y || 0) + dy;
      }
      const root = nodeById.get(nodeId);
      if (root) {
        if (!root.parent) {
          root.relativeX = root.x;
          root.relativeY = root.y;
        } else {
          const par = nodeById.get(root.parent);
          if (par) {
            root.relativeX = root.x - (par.x || 0);
            root.relativeY = root.y - (par.y || 0);
          }
        }
      }
      for (const e of connections) {
        if (!Array.isArray(e.waypoints)) continue;
        const sIn = ids.has(e.source);
        const tIn = ids.has(e.target);
        if (sIn && tIn) {
          e.waypoints = e.waypoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
        } else if (sIn || tIn) {
          delete e.waypoints;
        }
      }
    }

    const NODE_GAP_X = 200;
    const LEVEL_GAP_Y = 80;  // 레벨 간 수직 여백
    const START_X = 80;
    const START_Y = 80;

    // Rule L1/L2/L4: Structure Zone(순수 containment root, 즉 specialization
    // 그래프에 속하지 않는 최상위 노드들의 서브트리)의 bbox를 먼저 확정한다.
    // 예) test-2의 Canvas(→Layer→Rectangle/Circle/Triangle, RenderEngine 등)
    // test-1처럼 최상위 노드 자체가 spec 노드(Vehicle)인 경우는 별도 Structure
    // Zone이 없는 것으로 간주(null)하고 기존 방식(level0CX 평균)을 사용한다.
    let structureZoneBBox = null;
    for (const n of elements) {
      if (n.parent) continue;
      if (allSpecNodes.has(n.id)) continue;
      const ids = collectSubtreeIds(n.id, new Set());
      const bb = getSubtreeBBox(n.id, ids);
      if (!structureZoneBBox) {
        structureZoneBBox = { minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY };
      } else {
        structureZoneBBox.minX = Math.min(structureZoneBBox.minX, bb.minX);
        structureZoneBBox.minY = Math.min(structureZoneBBox.minY, bb.minY);
        structureZoneBBox.maxX = Math.max(structureZoneBBox.maxX, bb.maxX);
        structureZoneBBox.maxY = Math.max(structureZoneBBox.maxY, bb.maxY);
      }
    }

    let diagCX;
    if (structureZoneBBox) {
      // Rule L1/L4: Type Hierarchy Zone(specialization)을 Structure Zone과
      // X축으로 겹치지 않는 영역(우측)에 배치한다. 행 폭(가장 넓은 레벨)을
      // 미리 계산해 Zone 폭을 확보한다.
      const ZONE_GAP_X = 120;
      let maxRowWidth = 0;
      for (let lv = 0; lv <= maxLevel; lv++) {
        const nodes = byLevel.get(lv) || [];
        const movable = nodes.filter(nid => !(nodeById.get(nid)?.parent));
        if (movable.length === 0) continue;
        let w = 0;
        for (const nid of movable) {
          const ids = collectSubtreeIds(nid, new Set());
          w += getSubtreeBBox(nid, ids).width;
        }
        w += NODE_GAP_X * (movable.length - 1);
        maxRowWidth = Math.max(maxRowWidth, w);
      }
      diagCX = structureZoneBBox.maxX + ZONE_GAP_X + maxRowWidth / 2;
    } else {
      // 레벨 0(최상위 부모) 노드들의 현재 중심 X를 기준으로 diagCX 계산
      const level0 = byLevel.get(0) || [];
      const level0CX = level0.map(nid => {
        const n = nodeById.get(nid);
        return n ? (n.x || 0) + (n.width || 120) / 2 : START_X;
      });
      diagCX = level0CX.length > 0
        ? level0CX.reduce((a, b) => a + b, 0) / level0CX.length
        : START_X;
    }

    const nodeCX = new Map(); // nid → 이동 후 서브트리 중심 X
    let currentY = START_Y;

    for (let lv = 0; lv <= maxLevel; lv++) {
      const nodes = byLevel.get(lv) || [];
      if (nodes.length === 0) continue;

      // Rule H2-13: containment child(이미 containment parent 내부에 소속된 노드)는
      // specialization 레이아웃 단계에서 재배치할 수 없다.
      // → containment 부모를 가진 spec 노드는 이동 대상에서 제외하고, 현재 위치를
      //   그대로 nodeCX에 반영해 specialization edge routing의 기준점으로만 사용한다.
      const fixedNodes = nodes.filter(nid => !!(nodeById.get(nid)?.parent));
      const movableNodes = nodes.filter(nid => !(nodeById.get(nid)?.parent));

      for (const nid of fixedNodes) {
        const n = nodeById.get(nid);
        if (!n) continue;
        nodeCX.set(nid, (n.x || 0) + (n.width || 0) / 2);
      }

      // 평균 부모 CX 기준 정렬 (Rule M3)
      const avgParentCX = (nid) => {
        const pars = specParentsOf.get(nid) || [];
        if (pars.length === 0) return nodeCX.get(nid) ?? diagCX;
        const sum = pars.reduce((acc, p) => acc + (nodeCX.get(p) ?? diagCX), 0);
        return sum / pars.length;
      };
      movableNodes.sort((a, b) => avgParentCX(a) - avgParentCX(b));

      // 각 노드의 서브트리(자기 자신 + containment 자식 전체) 수집 및 현재 bbox 계산
      const subtreeIds = new Map();
      const bboxes = new Map();
      for (const nid of movableNodes) {
        const ids = collectSubtreeIds(nid, new Set());
        subtreeIds.set(nid, ids);
        bboxes.set(nid, getSubtreeBBox(nid, ids));
      }

      // Rule H2-6: 전체 행 폭 = Σ subtree width + gap (이동 대상 노드만)
      let totalWidth = 0;
      for (const nid of movableNodes) totalWidth += bboxes.get(nid).width;
      totalWidth += NODE_GAP_X * Math.max(0, movableNodes.length - 1);

      let cursorX = diagCX - totalWidth / 2;
      let maxLevelHeight = 0;

      for (const nid of movableNodes) {
        const n = nodeById.get(nid);
        if (!n) continue;
        const ids = subtreeIds.get(nid);
        const bbox = bboxes.get(nid);

        // 서브트리 좌상단(bbox.minX, bbox.minY)을 (cursorX, currentY)로 이동
        const dx = cursorX - bbox.minX;
        const dy = currentY - bbox.minY;
        moveSubtree(nid, dx, dy, ids);

        nodeCX.set(nid, cursorX + bbox.width / 2);
        maxLevelHeight = Math.max(maxLevelHeight, bbox.height);
        cursorX += bbox.width + NODE_GAP_X;
      }

      // fixed 노드들의 높이도 레벨 높이 계산에 반영 (currentY 진행에 영향 없도록 비교만)
      for (const nid of fixedNodes) {
        const n = nodeById.get(nid);
        if (!n) continue;
        maxLevelHeight = Math.max(maxLevelHeight, n.height || 0);
      }

      if (movableNodes.length > 0) {
        currentY += maxLevelHeight + LEVEL_GAP_Y;
      }
    }

    // 이동된 spec 노드가 자신의 containment 부모(있는 경우) 경계를 벗어났다면 보정
    // (자식들은 relativeX/Y 불변이므로 이 보정만으로 서브트리 전체가 안전하게 들어감)
    clampChildrenToParent(elements, nodeById);

    // specialization 엣지에 entryX 힌트 저장 (MxEdgeBuilder에서 사용)
    for (const e of connections) {
      const kind = String(e.kind || e.type || '').toLowerCase();
      if (kind !== 'specialization' && kind !== 'inheritance' && kind !== 'generalization') continue;
      const childNode = nodeById.get(e.source);
      const parentNode = nodeById.get(e.target);
      if (!childNode || !parentNode) continue;
      const childCX = (childNode.x || 0) + (childNode.width || 120) / 2;
      const parentX = parentNode.x || 0;
      const parentW = parentNode.width || 120;
      e._specEntryX = Math.max(0, Math.min(1, (childCX - parentX) / parentW));
    }

    // guiData 복원 방지 플래그
    diagramData._customLayoutApplied = true;
  }

  function fallbackGrid(diagramData) {
    const DS = window.SELAB?.Editor?.config?.displaySettings;
    const FG = DS?.grid?.fallback;
    const paddingX = FG?.paddingX ?? 150;
    const paddingY = FG?.paddingY ?? 58;
    const elementWidth = FG?.elementWidth ?? 120;
    const elementHeight = FG?.elementHeight ?? 80;
    
    // 부모-자식 관계 파악
    const elements = diagramData.elements || [];
    const parentMap = new Map(); // childId -> parentId
    const childrenMap = new Map(); // parentId -> [childIds]
    
    for (const el of elements) {
      if (el.parent) {
        parentMap.set(el.id, el.parent);
        if (!childrenMap.has(el.parent)) {
          childrenMap.set(el.parent, []);
        }
        childrenMap.get(el.parent).push(el.id);
      }
    }
    
    // 루트 레벨 요소만 그리드 배치
    const rootElements = elements.filter(el => !el.parent);
    const cols = Math.max(1, Math.ceil(Math.sqrt(rootElements.length || 1)));
    
    rootElements.forEach((element, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      element.x = paddingX + col * (elementWidth + paddingX);
      element.y = paddingY + row * (elementHeight + paddingY);
      element.width = element.width || elementWidth;
      element.height = element.height || elementHeight;
    });
    
    // 자식 요소는 부모 내부에 배치
    for (const el of elements) {
      if (el.parent) {
        const parent = elements.find(p => p.id === el.parent || p.name === el.parent);
        if (parent) {
          const siblings = childrenMap.get(el.parent) || [];
          const siblingIndex = siblings.indexOf(el.id);
          const siblingCols = Math.max(1, Math.ceil(Math.sqrt(siblings.length)));
          const siblingRow = Math.floor(siblingIndex / siblingCols);
          const siblingCol = siblingIndex % siblingCols;
          
          const innerPadding = FG?.innerPadding ?? 60;
          el.x = parent.x + innerPadding + siblingCol * (elementWidth + paddingX);
          el.y = parent.y + innerPadding + siblingRow * (elementHeight + paddingY);
          el.width = el.width || elementWidth;
          el.height = el.height || elementHeight;
        }
      }
    }
  }

})();
