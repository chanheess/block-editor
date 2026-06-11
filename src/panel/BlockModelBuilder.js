/*******************************************************************************
 * Copyright: SELab.AI (c) 2026
 *******************************************************************************/

const BLOCK_NODE_KINDS = new Set([
    'package',
    'librarypackage',
    'partdefinition',
    'partusage',
    'portdefinition',
    'portusage',
    'attributedefinition',
    'attributeusage',
    'interfacedefinition',
    'interfaceusage',
]);

const BLOCK_EDGE_KINDS = new Set([
    'containment',
    'specialization',
    'inheritance',
    'generalization',
    'association',
    'allocation',
    'dependency',
    'featuretyping',
    'typefeaturing',
    'subsetting',
    'redefinition',
    'connection',
    'binding',
]);

function normalizeText(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeKind(value) {
    return normalizeText(value).toLowerCase();
}

function normalizeEdgeKind(edge) {
    return normalizeKind(edge?.kind || edge?.type);
}

function getNodeKey(node) {
    return normalizeText(node?.id, normalizeText(node?.qualifiedName, normalizeText(node?.name)));
}

function isBlockNode(node) {
    const kind = normalizeKind(node?.kind || node?.type);
    return BLOCK_NODE_KINDS.has(kind);
}

function isBlockEdge(edge) {
    return BLOCK_EDGE_KINDS.has(normalizeEdgeKind(edge));
}

function buildLookup(nodes) {
    const nodeByKey = new Map();
    const aliasMap = new Map();

    function addAlias(alias, key) {
        const normalizedAlias = normalizeText(alias);
        if (!normalizedAlias || !key) {
            return;
        }
        const existing = aliasMap.get(normalizedAlias) || new Set();
        existing.add(key);
        aliasMap.set(normalizedAlias, existing);
    }

    for (const node of nodes) {
        const key = getNodeKey(node);
        if (!key || nodeByKey.has(key)) {
            continue;
        }
        nodeByKey.set(key, node);
        addAlias(key, key);
        addAlias(node.id, key);
        addAlias(node.qualifiedName, key);
        addAlias(node.name, key);
        addAlias(node.declaredName, key);
    }

    function resolveNodeKey(value) {
        const candidate = normalizeText(value);
        if (!candidate) {
            return '';
        }
        if (nodeByKey.has(candidate)) {
            return candidate;
        }
        const exactMatches = aliasMap.get(candidate);
        if (exactMatches?.size === 1) {
            return Array.from(exactMatches)[0];
        }

        const unquoted = candidate.replace(/^['"]|['"]$/g, '');
        if (nodeByKey.has(unquoted)) {
            return unquoted;
        }
        const unquotedMatches = aliasMap.get(unquoted);
        if (unquotedMatches?.size === 1) {
            return Array.from(unquotedMatches)[0];
        }

        return '';
    }

    return {
        nodeByKey,
        resolveNodeKey,
    };
}

function extractExplicitParent(node) {
    const rawParent = node?.parent || node?.container || node?.package || node?.owner || node?.namespace;
    if (typeof rawParent === 'object' && rawParent !== null) {
        return normalizeText(rawParent.id, normalizeText(rawParent.qualifiedName, normalizeText(rawParent.name)));
    }
    return normalizeText(rawParent);
}

function buildDirectParentMap(nodes, edges, resolveNodeKey, nodeByKey) {
    const directParentMap = new Map();
    const unresolvedFeatureTyping = [];

    const childrenByParent = new Map();
    for (const edge of edges) {
        const kind = normalizeEdgeKind(edge);
        if (kind === 'containment') {
            const sourceKey = resolveNodeKey(edge.source);
            const targetKey = resolveNodeKey(edge.target);
            if (sourceKey && targetKey && sourceKey !== targetKey) {
                if (!childrenByParent.has(sourceKey)) childrenByParent.set(sourceKey, new Set());
                childrenByParent.get(sourceKey).add(targetKey);
            }
        } else if (kind === 'featuretyping') {
            unresolvedFeatureTyping.push(edge);
        }
    }

    const parentCountByChild = new Map();
    for (const children of childrenByParent.values()) {
        for (const childKey of children) {
            parentCountByChild.set(childKey, (parentCountByChild.get(childKey) || 0) + 1);
        }
    }

    for (const [parentKey, children] of childrenByParent) {
        for (const childKey of children) {
            if (parentCountByChild.get(childKey) === 1) {
                directParentMap.set(childKey, parentKey);
            } else if (!directParentMap.has(childKey)) {
                // Rule D5 (Shared Definition 단일 렌더링): 부모가 여러 개인 공유 정의는
                // 복제하지 않고 첫 번째 containment 부모에 귀속시킨다.
                // (이전에는 최상위로 띄웠으나, 그러면 어느 컨테이너에도 속하지 못하고
                //  캔버스에 고아 노드로 남는 문제가 발생)
                directParentMap.set(childKey, parentKey);
            }
        }
    }

    for (const node of nodes) {
        const nodeKey = getNodeKey(node);
        if (!nodeKey || directParentMap.has(nodeKey)) {
            continue;
        }
        const explicitParent = resolveNodeKey(extractExplicitParent(node));
        if (explicitParent && explicitParent !== nodeKey) {
            directParentMap.set(nodeKey, explicitParent);
            continue;
        }

        let candidate = nodeKey;
        while (candidate.includes('::')) {
            candidate = candidate.substring(0, candidate.lastIndexOf('::'));
            const resolvedCandidate = resolveNodeKey(candidate);
            if (resolvedCandidate && resolvedCandidate !== nodeKey) {
                directParentMap.set(nodeKey, resolvedCandidate);
                break;
            }
        }
    }

    for (const edge of unresolvedFeatureTyping) {
        const usageKey = resolveNodeKey(edge.source);
        const defKey = resolveNodeKey(edge.target);
        if (!usageKey || !defKey || usageKey === defKey) {
            continue;
        }
        if (directParentMap.has(usageKey)) {
            continue;
        }
        const usageNode = nodeByKey.get(usageKey);
        if (normalizeKind(usageNode?.kind || usageNode?.type) !== 'partusage') {
            continue;
        }
        const defParent = directParentMap.get(defKey);
        if (defParent && defParent !== usageKey) {
            directParentMap.set(usageKey, defParent);
        }
    }

    return directParentMap;
}

function findNearestKeptAncestor(nodeKey, keptNodeKeys, directParentMap, resolveNodeKey) {
    const visited = new Set([nodeKey]);
    let cursor = directParentMap.get(nodeKey) || '';

    while (cursor && !visited.has(cursor)) {
        if (keptNodeKeys.has(cursor)) {
            return cursor;
        }
        visited.add(cursor);
        cursor = directParentMap.get(cursor) || '';
    }

    let qualifiedCursor = nodeKey;
    while (qualifiedCursor.includes('::')) {
        qualifiedCursor = qualifiedCursor.substring(0, qualifiedCursor.lastIndexOf('::'));
        const resolvedCandidate = resolveNodeKey(qualifiedCursor);
        if (resolvedCandidate && keptNodeKeys.has(resolvedCandidate) && resolvedCandidate !== nodeKey) {
            return resolvedCandidate;
        }
    }

    return '';
}

function deduplicateEdges(edges) {
    const edgeMap = new Map();

    for (const edge of edges) {
        const key = [normalizeText(edge.source), normalizeText(edge.target), normalizeEdgeKind(edge), normalizeText(edge.label)].join('|');
        if (!edgeMap.has(key)) {
            edgeMap.set(key, edge);
        }
    }

    return Array.from(edgeMap.values());
}

// portdefinition의 direction 값을 border node side로 변환
function portDirection2Side(direction) {
    const d = normalizeText(direction).toLowerCase();
    if (d === 'out') return 'S';
    if (d === 'in' || d === 'inout') return 'N';
    return 'E';
}

function buildBlockModel(model) {
    const rawNodes = Array.isArray(model?.nodes) ? model.nodes : [];
    const rawEdges = Array.isArray(model?.edges) ? model.edges : [];
    const { nodeByKey, resolveNodeKey } = buildLookup(rawNodes);
    const directParentMap = buildDirectParentMap(rawNodes, rawEdges, resolveNodeKey, nodeByKey);
    const keptNodeKeys = new Set();

    for (const node of rawNodes) {
        const nodeKey = getNodeKey(node);
        if (nodeKey && nodeByKey.has(nodeKey) && isBlockNode(node)) {
            keptNodeKeys.add(nodeKey);
        }
    }

    // containment 엣지에서 portdefinition 타겟을 수집하여 부모 수를 계산
    // 단일 부모에서 border node로 변환, 복수 부모는 상위 계층 유지
    const portsByParent = new Map();   // parentKey → portKey[]
    const portParentCount = new Map(); // portKey → 부모 수

    for (const edge of rawEdges) {
        if (normalizeEdgeKind(edge) !== 'containment') continue;
        const sourceKey = resolveNodeKey(edge.source);
        const targetKey = resolveNodeKey(edge.target);
        if (!sourceKey || !targetKey || sourceKey === targetKey) continue;
        const targetNode = nodeByKey.get(targetKey);
        if (normalizeKind(targetNode?.kind || targetNode?.type) !== 'portdefinition') continue;
        portParentCount.set(targetKey, (portParentCount.get(targetKey) || 0) + 1);
        if (!portsByParent.has(sourceKey)) portsByParent.set(sourceKey, []);
        portsByParent.get(sourceKey).push(targetKey);
    }

    const borderPortKeys = new Set();
    for (const [portKey, count] of portParentCount) {
        if (count === 1 && keptNodeKeys.has(portKey)) {
            borderPortKeys.add(portKey);
            keptNodeKeys.delete(portKey);
        }
    }

    const filteredNodes = [];
    for (const nodeKey of keptNodeKeys) {
        const rawNode = nodeByKey.get(nodeKey);
        if (!rawNode) {
            continue;
        }

        const nextNode = {
            ...rawNode,
            id: nodeKey,
        };
        const parentKey = findNearestKeptAncestor(nodeKey, keptNodeKeys, directParentMap, resolveNodeKey);
        if (parentKey) {
            nextNode.parent = parentKey;
        } else {
            delete nextNode.parent;
        }

        // 이 노드를 단일 부모로 가지는 portdefinition을 borderNodes로 첨부
        const ports = portsByParent.get(nodeKey) || [];
        const borderNodes = ports
            .filter(portKey => borderPortKeys.has(portKey))
            .map(portKey => {
                const portNode = nodeByKey.get(portKey);
                return {
                    id: portKey,
                    name: portNode?.name || portKey,
                    kind: 'portdefinition',
                    type: 'portdefinition',
                    nodeType: 'port',
                    side: portDirection2Side(portNode?.direction),
                    offset: 0.5,
                    direction: portNode?.direction || '',
                };
            });
        if (borderNodes.length > 0) {
            nextNode.borderNodes = borderNodes;
        }

        filteredNodes.push(nextNode);
    }

    const filteredEdges = [];
    for (const edge of rawEdges) {
        const edgeKind = normalizeEdgeKind(edge);
        if (!isBlockEdge(edge) || edgeKind === 'containment') {
            continue;
        }

        const sourceKey = resolveNodeKey(edge.source);
        const targetKey = resolveNodeKey(edge.target);
        if (!keptNodeKeys.has(sourceKey) || !keptNodeKeys.has(targetKey) || sourceKey === targetKey) {
            continue;
        }

        filteredEdges.push({
            ...edge,
            source: sourceKey,
            target: targetKey,
            kind: edge.kind || edge.type || edgeKind,
            type: edge.type || edge.kind || edgeKind,
        });
    }

    for (const node of filteredNodes) {
        if (!node.parent) {
            continue;
        }
        filteredEdges.push({
            id: `block-containment:${node.parent}->${node.id}`,
            source: node.parent,
            target: node.id,
            kind: 'containment',
            type: 'containment',
        });
    }

    return {
        nodes: filteredNodes,
        edges: deduplicateEdges(filteredEdges),
    };
}

module.exports = {
    buildBlockModel,
};
