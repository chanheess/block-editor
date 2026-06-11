/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * ********************************************************************************/
// Hierarchy derivation service
(function () {
  const ns = (window.SELAB = window.SELAB || {});
  ns.Editor = ns.Editor || {};

  function isHierarchicalEdgeKind(kind) {
    if (!kind) return false;
    const k = String(kind).toLowerCase();
    // [SELab.AI] composition/shared는 독립 노드로 렌더링하므로 계층 관계가 아님
    if (k === 'composition' || k.includes('composition') || k === 'shared') {
      return false;
    }
    if (k.includes('succession') || k.includes('then')) return false;
    return (
      k.includes('contain') ||
      k.includes('own') ||
      k.includes('aggregate') ||
      k.includes('nest') ||
      k.includes('member') ||
      k.includes('usage') ||
      k.includes('perform') ||
      k.includes('include') ||
      k.includes('has')
    );
  }

  function derive(model) {
    if (!model || !Array.isArray(model.elements)) return;
    const byId = new Map(model.elements.map(e => [e.id, e]));
    const byName = new Map(model.elements.map(e => [e.name, e]));

    // [SELab.AI] 0) composition target의 기존 parent를 Package 레벨로 재설정
    // composition edge로 연결된 노드는 독립 노드이므로 기존 parent를 제거하고 Package 레벨로 설정
    const edges = Array.isArray(model.allConnectionsForHierarchy) ? model.allConnectionsForHierarchy :
                  Array.isArray(model.connections) ? model.connections : [];
    const compositionTargets = new Set();
    for (const e of edges) {
      const k = String(e.kind || e.type || '').toLowerCase();
      if (k === 'composition' || k.includes('composition') || k === 'shared') {
        compositionTargets.add(e.target);
      }
    }

    // composition target의 parent를 Package 레벨로 설정 (parent 유무와 무관)
    for (const el of model.elements) {
      if (compositionTargets.has(el.id)) {
        const parts = String(el.id || el.name || '').split('::');
        if (parts.length > 0) {
          const packageName = parts[0];
          const packageNode = byId.get(packageName) || byName.get(packageName);
          if (packageNode) {
            el.parent = packageNode.id;
          } else {
            delete el.parent;
          }
        } else {
          delete el.parent;
        }
      }
    }

    const safeSetParent = (child, parent, force = false) => {
      if (!child || !parent) return;
      if (child.id === parent.id) return;
      let cursor = parent;
      while (cursor) {
        if (cursor.id === child.id) return;
        const next = cursor.parent ? (byId.get(cursor.parent) || byName.get(String(cursor.parent))) : null;
        cursor = next || null;
      }
      if (force || !child.parent) {
        child.parent = parent.id;
      }
    };

    // 1) Edges define containment
    // edges는 이미 0단계에서 선언됨
    const kindOf = (e) => String(e?.kind || e?.type || '').toLowerCase();
    const containmentEdges = edges.filter((e) => kindOf(e).includes('contain'));
    const otherHierarchical = edges.filter((e) => isHierarchicalEdgeKind(kindOf(e)) && !kindOf(e).includes('contain'));

    // 1a) Apply explicit containment edges first, overriding any prior parent
    for (const e of containmentEdges) {
      const src = byId.get(e.source) || byName.get(e.source);
      const dst = byId.get(e.target) || byName.get(e.target);
      if (!src || !dst) continue;
      safeSetParent(dst, src, true);
    }

    // 1b) Apply other hierarchical edges only if parent is still unset
    for (const e of otherHierarchical) {
      const src = byId.get(e.source) || byName.get(e.source);
      const dst = byId.get(e.target) || byName.get(e.target);
      if (!src || !dst) continue;
      safeSetParent(dst, src, false);
    }

    // 2) Qualified name fallback — 비활성화
    // 소스 파일 위치(::) 기반 자동 중첩이 BDD 레이아웃을 왜곡함
    // containment 엣지가 없는 노드는 최상위(root)로 유지

    // 3) Range nesting fallback — 비활성화
    // 소스 코드 범위(range) 기반 중첩이 BDD containment 의미론과 무관한 계층 생성
  }

  ns.Editor.hierarchy = { derive, isHierarchicalEdgeKind };
})();
