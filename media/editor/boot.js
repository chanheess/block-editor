/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * boot.js - Diagram Panel webview 부트스트랩
 * Model Layer 모듈 사용 (model/normalizer.js)
 * mxGraph 렌더링 지원 (Phase 2)
 * ********************************************************************************/
(function () {
  const ns = (window.SELAB = window.SELAB || {});
  let sharedViewToolbar = null;

  // mxGraph 사용 여부 (Feature flag)
  // true: mxGraph 렌더링, false: 기존 SVG 렌더링
  const USE_MXGRAPH = true;

  function log(prefix, ...args) {
    try {
      console.log(`[EditorBoot] ${prefix}`, ...args);
      try {
        if (typeof ns.Editor.post === "function")
          ns.Editor.post({
            type: "log",
            tag: "[EditorBoot]",
            message: String(prefix),
          });
        else if (
          window.vscode &&
          typeof window.vscode.postMessage === "function"
        )
          window.vscode.postMessage({
            type: "log",
            tag: "[EditorBoot]",
            message: String(prefix),
          });
      } catch {}
    } catch {}
  }

  function refreshDiagramModel() {
    try {
      if (typeof ns.Editor.post === "function")
        ns.Editor.post({ type: "refresh" });
      else if (window.vscode && typeof window.vscode.postMessage === "function")
        window.vscode.postMessage({ type: "refresh" });
    } catch {}
  }

  async function applyElkAndRerender() {
    const normalized = ns.Editor._lastNormalizedModel;
    const graph = ns.Editor._mxGraph;
    if (!normalized || !graph) {
      log("Refresh: 모델 또는 그래프 없음 - ELK 재실행 스킵");
      return;
    }
    if (typeof ns.applyElkLayout !== "function") {
      log("Refresh: applyElkLayout 없음 - 스킵");
      return;
    }
    try {
      await ns.applyElkLayout(normalized);
      ns.MxGraph.factory?.renderModel?.(graph, normalized);
      // ELK 결과 좌표를 모두 selab-store에 저장
      saveAllNodeGeometry(graph);
      log("Refresh: ELK 레이아웃 재적용 완료");
    } catch (err) {
      log("Refresh: ELK 레이아웃 실패:", err);
    }
  }

  function getDiagramMinimapElement() {
    return document.getElementById("mxGraphMinimap");
  }

  function isDiagramMinimapVisible() {
    const minimapEl = getDiagramMinimapElement();
    if (!minimapEl) return false;
    const style = window.getComputedStyle(minimapEl);
    return style.visibility !== "hidden" && style.opacity !== "0";
  }

  function setDiagramMinimapVisible(visible) {
    const minimapEl = getDiagramMinimapElement();
    const normalizedVisible = visible === true;
    try {
      if (typeof ns.MxGraph?.minimap?.setVisible === "function") {
        ns.MxGraph.minimap.setVisible(normalizedVisible);
      }
    } catch {}
    if (minimapEl) {
      minimapEl.style.display = "block";
      minimapEl.style.visibility = normalizedVisible ? "visible" : "hidden";
      minimapEl.style.opacity = normalizedVisible ? "1" : "0";
      minimapEl.style.pointerEvents = normalizedVisible ? "auto" : "none";
    }
    if (sharedViewToolbar) {
      sharedViewToolbar.setActive("btn-toggle-minimap", normalizedVisible);
    }
    return normalizedVisible;
  }

  function toggleDiagramMinimap() {
    return setDiagramMinimapVisible(!isDiagramMinimapVisible());
  }

  function postEditorMessage(payload) {
    try {
      if (typeof ns.Editor.post === "function") ns.Editor.post(payload);
      else if (window.vscode && typeof window.vscode.postMessage === "function")
        window.vscode.postMessage(payload);
    } catch {}
  }

  function mapToolbarTypeToBaseName(type) {
    const s = String(type || "").toLowerCase();
    const cleaned = s.replace(/\s+def\b/, "");
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const camel = parts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
    return camel || "Element";
  }

  // 현재 모델에서 기존 이름 목록을 수집하여 순차 번호 생성 (EFFBD editor 패턴)
  function nextAutoName(prefix) {
    const app = ns.Editor._app;
    const existing = new Set(
      (app?.model?.elements || [])
        .map((e) => String(e.name || "").trim())
        .filter(Boolean),
    );
    for (let i = 1; i < 10000; i++) {
      const candidate = `${prefix}_${i}`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${prefix}_${Date.now()}`; // fallback
  }

  function getSharedInsertionType() {
    const sharedValue = sharedViewToolbar?.getValue?.("insert-element-type");
    if (sharedValue) return String(sharedValue);
    const legacySelect = document.getElementById("elementTypeSelect");
    return String((legacySelect && legacySelect.value) || "part");
  }

  function resolveSelectedParentName() {
    // MxGraph 선택에서 parent 추출
    const graph = ns.Editor._mxGraph;
    if (graph) {
      try {
        const cells = graph.getSelectionCells();
        if (cells && cells.length === 1 && cells[0]._nodeData) {
          const nd = cells[0]._nodeData;
          return nd.qualifiedName || nd.name || undefined;
        }
      } catch {}
    }
    // SVG 기반 선택에서 parent 추출
    try {
      if (
        ns.Editor.interactions &&
        typeof ns.Editor.interactions.getSelectedElementId === "function"
      ) {
        const selectedId = ns.Editor.interactions.getSelectedElementId();
        if (selectedId) {
          const app = ns.Editor._app;
          const node = app?.model?.elements?.find((e) => e.id === selectedId);
          return node?.qualifiedName || node?.name || undefined;
        }
      }
    } catch {}
    return undefined;
  }

  function addElementFromSharedToolbar() {
    const type = getSharedInsertionType();
    const base = mapToolbarTypeToBaseName(type);
    const name = nextAutoName(base);
    const parent = resolveSelectedParentName();
    log(`shared-add: type=${type} name=${name} parent=${parent || "(root)"}`);

    const element = parent ? { type, name, parent } : { type, name };
    postEditorMessage({ type: "add", element });
  }

  // 안정적인 store 키 생성: qualifiedName 우선, 없으면 id에서 경로 접두사 제거
  function stableNodeKey(nodeData) {
    const qn = nodeData.qualifiedName;
    if (qn) return qn;
    let id = nodeData.id || "";
    // "view:usage/ss.sysml#ss" → "ss"
    if (id.startsWith("view:")) id = id.slice(5);
    if (id.includes("#")) id = id.split("#").pop();
    return id;
  }

  function saveAllNodeGeometry(graph) {
    if (!graph) return;
    try {
      const gModel = graph.getModel();
      const nodesToSave = [];
      function collectVertex(cell) {
        if (!cell) return;
        if (gModel.isVertex(cell) && cell._nodeData) {
          const nodeData = cell._nodeData;
          const nodeId = stableNodeKey(nodeData);
          if (nodeId) {
            const geo = gModel.getGeometry(cell);
            if (geo) {
              nodesToSave.push({
                id: nodeId,
                x: geo.x,
                y: geo.y,
                width: geo.width,
                height: geo.height,
              });
            }
          }
        }
        const childCount = gModel.getChildCount(cell);
        for (let i = 0; i < childCount; i++) {
          collectVertex(gModel.getChildAt(cell, i));
        }
      }
      collectVertex(gModel.getRoot());
      if (nodesToSave.length > 0) {
        postEditorMessage({ type: "node-geometry", nodes: nodesToSave });
        log(`saveAllNodeGeometry: ${nodesToSave.length}개 노드 저장`);
      }
    } catch (err) {
      log("saveAllNodeGeometry 오류:", err);
    }
  }

  function deleteSelectedFromSharedToolbar() {
    if (USE_MXGRAPH && ns.Editor._mxGraph) {
      deleteSelectedCells(ns.Editor._mxGraph);
      return;
    }
    try {
      if (
        ns.Editor.interactions &&
        typeof ns.Editor.interactions.getSelectedElementId === "function"
      ) {
        const selectedId = ns.Editor.interactions.getSelectedElementId();
        if (selectedId) {
          log(
            `shared-delete-selected: deleting element with id='${selectedId}'`,
          );
          postEditorMessage({ type: "delete-element", name: selectedId });
        } else {
          log("shared-delete-selected: no element selected");
          alert("Please select an element to delete");
        }
      }
    } catch (err) {
      log("shared-delete-selected error:", err);
    }
  }

  function setLegacyInteractionMode(tool) {
    const toolbar = document.getElementById("diagramToolbar");
    if (!toolbar) return;
    const btns = Array.from(
      toolbar.querySelectorAll(".toolbar-button[data-tool]"),
    );
    btns.forEach((b) => {
      const active = String(b.getAttribute("data-tool")) === String(tool);
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }

  function setSharedInteractionMode(tool) {
    const normalizedTool = tool === "pan" ? "pan" : "select";
    const editorEl = document.getElementById("diagramEditor");
    if (sharedViewToolbar) {
      sharedViewToolbar.setSegmentActive("interaction-mode", normalizedTool);
    }
    setLegacyInteractionMode(normalizedTool);
    if (editorEl)
      editorEl.classList.toggle("pan-mode", normalizedTool === "pan");
    const app = ns.Editor._app;
    if (app) app._panToolActive = normalizedTool === "pan";
    const graph = ns.Editor._mxGraph;
    if (graph) {
      ns.MxGraph.zoomPan?.setPanningEnabled?.(graph, normalizedTool === "pan");
      ns.MxGraph.drag?.setDragEnabled?.(graph, normalizedTool !== "pan");
    }
  }

  function updateSharedToolbarState() {
    if (!sharedViewToolbar) return;
    const panel = document.querySelector(".attributes-panel");
    const hidden = panel ? panel.classList.contains("hidden") : false;
    sharedViewToolbar.setActive("btn-toggle-properties", !hidden);
    sharedViewToolbar.setActive(
      "btn-toggle-minimap",
      isDiagramMinimapVisible(),
    );
    sharedViewToolbar.setSegmentActive(
      "interaction-mode",
      ns.Editor?._app?._panToolActive ? "pan" : "select",
    );
  }

  // localStorage 기반 toolbar 상태 persist
  const LS_PREFIX = "selab.block.toolbar.";
  function loadToolbarState(key, fallback) {
    try {
      return window.localStorage.getItem(LS_PREFIX + key) || fallback;
    } catch {
      return fallback;
    }
  }
  function saveToolbarState(key, value) {
    try {
      window.localStorage.setItem(LS_PREFIX + key, value);
    } catch {}
  }

  function initSharedViewToolbar() {
    if (
      sharedViewToolbar ||
      !window.SelabToolbar ||
      typeof window.SelabToolbar.createToolbar !== "function"
    )
      return;
    const toolbarMount =
      document.getElementById("toolbar-mount") ||
      document.getElementById("diagramEditor");

    // localStorage에서 이전 상태 복원
    const savedInteractionMode = loadToolbarState("interactionMode", "select");
    const savedInsertType = loadToolbarState("insertType", "part");
    const savedPropsVisible =
      loadToolbarState("propsVisible", "true") === "true";
    const savedMinimapVisible =
      loadToolbarState("minimapVisible", "true") === "true";
    sharedViewToolbar = window.SelabToolbar.createToolbar({
      mount: toolbarMount,
      position: "bottom-center",
      sections: [
        {
          id: "view-common-section",
          items: [
            {
              type: "segment-group",
              id: "interaction-mode",
              active: savedInteractionMode,
              options: [
                { value: "select", label: "Select", title: "Selection Mode" },
                { value: "pan", label: "Pan", title: "Pan Mode" },
              ],
            },
            {
              type: "button",
              id: "btn-toggle-minimap",
              label: "Map",
              title: "Toggle Minimap",
            },
            {
              type: "button",
              id: "btn-fit-screen",
              label: "Fit",
              title: "Fit To Screen",
            },
          ],
        },
      ],
    });

    sharedViewToolbar.on("interaction-mode", (tool) => {
      setSharedInteractionMode(tool);
      saveToolbarState("interactionMode", tool);
    });
    sharedViewToolbar.on("btn-toggle-minimap", () => {
      const visible = toggleDiagramMinimap();
      saveToolbarState("minimapVisible", String(visible));
    });
    sharedViewToolbar.on("btn-fit-screen", () => {
      const graph = ns.Editor._mxGraph;
      if (graph) {
        ns.MxGraph.zoomPan?.zoomToFit?.(graph, 50);
      }
    });
    // 저장된 상태 복원
    setSharedInteractionMode(savedInteractionMode);
    if (!savedPropsVisible) {
      togglePropertiesPanel();
    }
    // 미니맵은 mxGraph 초기화 후 적용해야 하므로 지연 실행
    setTimeout(() => {
      setDiagramMinimapVisible(savedMinimapVisible);
    }, 500);
    updateSharedToolbarState();
  }

  function mountApp() {
    const svg = document.getElementById("diagramSvg");
    const attrPanel = document.getElementById("attributePanel");
    const app = new ns.Editor.App();
    app.mount({ svg, attrPanel });
    try {
      initSharedViewToolbar();
    } catch {}
    ns.Editor._app = app;

    // mxGraph 초기화 (사용 가능한 경우)
    if (USE_MXGRAPH && ns.MxGraph?.isAvailable?.()) {
      initMxGraph();
    }

    log(
      "mountApp 완료. mxGraph 사용:",
      USE_MXGRAPH && ns.MxGraph?.isAvailable?.(),
    );

    // VSCode 테마 변경 감지: body 클래스 변경 시 다이어그램 배경 + 모델 재렌더링
    setupThemeObserver();

    try {
      if (typeof ns.Editor.post === "function")
        ns.Editor.post({ type: "ready" });
      else if (window.vscode && typeof window.vscode.postMessage === "function")
        window.vscode.postMessage({ type: "ready" });
    } catch {}
    return app;
  }

  /**
   * VSCode 테마 변경 감지 (body 클래스 변경 감시)
   */
  function setupThemeObserver() {
    let lastThemeDark = ns.MxGraph.styleColors?.isDarkTheme?.() || false;

    function applyThemeToGraph() {
      const graph = ns.Editor._mxGraph;
      if (!graph) return;
      const container = graph.container;
      if (!container) return;

      const isDark = ns.MxGraph.styleColors?.isDarkTheme?.() || false;
      const bg =
        ns.MxGraph.styleColors?.getDiagramBackground?.() ||
        (isDark ? "#1e1e1e" : "#ffffff");
      container.style.background = bg;

      // mxGraph 스타일 재등록 + 모델 재렌더링
      ns.MxGraph.styles?.registerStyles?.(graph);
      const normalized = ns.Editor._lastNormalizedModel;
      if (normalized) {
        ns.MxGraph.factory?.renderModel?.(graph, normalized);
      }
      log("테마 변경 감지 - 다이어그램 재렌더링:", isDark ? "dark" : "light");
    }

    // body 클래스 변경 감지
    const observer = new MutationObserver(() => {
      const isDark = ns.MxGraph.styleColors?.isDarkTheme?.() || false;
      if (isDark !== lastThemeDark) {
        lastThemeDark = isDark;
        applyThemeToGraph();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // 초기 배경색 적용
    const graph = ns.Editor._mxGraph;
    if (graph?.container) {
      const isDark = ns.MxGraph.styleColors?.isDarkTheme?.() || false;
      const bg =
        ns.MxGraph.styleColors?.getDiagramBackground?.() ||
        (isDark ? "#1e1e1e" : "#ffffff");
      graph.container.style.background = bg;
    }
  }

  /**
   * mxGraph 초기화
   */
  function initMxGraph() {
    const editorEl = document.getElementById("diagramEditor");
    if (!editorEl) {
      log("mxGraph 초기화 실패: diagramEditor 요소 없음");
      return;
    }

    // mxGraph 컨테이너 생성
    let mxContainer = document.getElementById("mxGraphContainer");
    if (!mxContainer) {
      mxContainer = document.createElement("div");
      mxContainer.id = "mxGraphContainer";
      mxContainer.style.cssText =
        "position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;background:#fff;";
      editorEl.appendChild(mxContainer);
    }

    // 기존 SVG 숨기기
    const svg = document.getElementById("diagramSvg");
    if (svg) {
      svg.style.display = "none";
    }

    // mxGraph 인스턴스 생성
    const graph = ns.MxGraph.init(mxContainer);
    if (graph) {
      // 스타일 등록
      ns.MxGraph.styles?.registerStyles?.(graph);

      // 히스토리 관리자 초기화
      ns.MxGraph.history?.init?.(graph);

      // 상호작용 핸들러 초기화 (Phase 3)
      ns.MxGraph.events?.setupDefaultHandlers?.(graph);
      ns.MxGraph.selection?.init?.(graph);
      ns.MxGraph.drag?.init?.(graph);
      ns.MxGraph.zoomPan?.init?.(graph, mxContainer);

      // 고급 기능 초기화 (Phase 4)
      ns.MxGraph.connection?.init?.(graph);
      ns.MxGraph.connection?.setupConnectionPoints?.(graph);

      // 미니맵 생성 (에디터 영역에 추가)
      ns.MxGraph.minimap?.createWithContainer?.(graph, mxContainer, {
        position: "bottom-left",
        width: 180,
        height: 120,
        margin: 10,
      });

      // fold 클릭 핸들러 등록 (diagramData는 렌더링 시점에 참조)
      ns.MxGraph.fold?.registerClickHandler?.(
        graph,
        (ns.Editor._foldDataRef = { current: null }),
      );

      // 컨텍스트 메뉴 초기화 (Phase 6 - ninja-keys)
      ns.MxGraph.contextMenu?.init?.(graph, mxContainer);

      // Alt+드래그로 영역 선택 (Rubberband) 초기화
      if (typeof mxRubberband !== "undefined") {
        const rubberband = new mxRubberband(graph);
        // Alt 키가 눌려있을 때만 Rubberband 활성화
        rubberband.isForceRubberbandEvent = function (me) {
          return mxEvent.isAltDown(me.getEvent());
        };
        // 선택 영역 스타일 직접 설정
        rubberband.defaultOpacity = 30;
        const originalCreateShape = rubberband.createShape;
        rubberband.createShape = function () {
          const div = originalCreateShape.apply(this, arguments);
          if (div) {
            div.style.border = "2px solid #0078d4";
            div.style.background = "rgba(0, 120, 212, 0.3)";
          }
          return div;
        };
        ns.Editor._rubberband = rubberband;
        log("Alt+드래그 영역 선택(Rubberband) 초기화 완료");
      }

      // 노드 드래그/리사이즈 완료 시 위치+크기를 selab-store에 저장
      function saveNodeGeometry(cells) {
        try {
          const gModel = graph.getModel();
          const nodesToSave = (cells || [])
            .filter((c) => gModel.isVertex(c) && c._nodeData)
            .map((c) => {
              const nodeId = stableNodeKey(c._nodeData);
              if (!nodeId) return null;
              const geo = c.geometry;
              return {
                id: nodeId,
                x: geo.x,
                y: geo.y,
                width: geo.width,
                height: geo.height,
              };
            })
            .filter(Boolean);
          if (nodesToSave.length > 0) {
            postEditorMessage({ type: "node-geometry", nodes: nodesToSave });
          }
        } catch (err) {
          log("노드 위치/크기 저장 오류:", err);
        }
      }

      graph.addListener(mxEvent.CELLS_RESIZED, function (sender, evt) {
        saveNodeGeometry(evt.getProperty("cells") || []);
      });

      ns.Editor._mxGraph = graph;
      ns.Editor._mxContainer = mxContainer;

      setDiagramMinimapVisible(true);

      log("✅ mxGraph 초기화 완료 (Phase 4 고급 기능 포함)");
    }
  }

  /**
   * mxGraph 선택된 셀 삭제 (에지/버텍스 분기)
   * @param {mxGraph} graph
   */
  function buildMxGraphDeleteRequest(graph, cell) {
    if (!graph || !cell) return null;
    const model = graph.getModel?.();
    const isEdge = !!model?.isEdge?.(cell);
    log(
      `buildMxGraphDeleteRequest: cell.id=${cell.id} isEdge=${isEdge} type=${cell._edgeData?.type}`,
    );
    if (isEdge) {
      const edgeData = cell._edgeData;
      if (!edgeData) {
        log(
          `buildMxGraphDeleteRequest: 에지이지만 _edgeData 없음 - cell.id=${cell.id}`,
        );
        return null;
      }
      const srcQN = String(edgeData.source || "");
      const tgtQN = String(edgeData.target || "");
      const edgeType = edgeData.type || edgeData.kind || "association";
      let connection;
      if (edgeType === "composition" || edgeType === "shared") {
        const tgtSegs = tgtQN.split("::");
        const memberName = tgtSegs.pop();
        const parentName =
          tgtSegs.length > 0
            ? tgtSegs[tgtSegs.length - 1].replace(/^['"]|['"]$/g, "")
            : srcQN.split("::").pop();
        const targetName = srcQN.split("::").pop();
        connection = {
          source: memberName,
          target: targetName,
          type: edgeType,
          parent: parentName,
        };
      } else {
        const srcSegs = srcQN.split("::");
        const sourceName = srcSegs.pop();
        const tgtSegs = tgtQN.split("::");
        const targetName = tgtSegs.pop();
        const srcParent =
          srcSegs.length > 0
            ? srcSegs[srcSegs.length - 1].replace(/^['"]|['"]$/g, "")
            : undefined;
        const edgeTypeLower = edgeType.toLowerCase();
        // succession-flow: 포트 이름을 액션.포트 형식으로 재구성
        if (
          edgeTypeLower.includes("succession") &&
          edgeTypeLower.includes("flow")
        ) {
          const srcAction =
            srcSegs.length > 0
              ? srcSegs[srcSegs.length - 1].replace(/^['"]|['"]$/g, "")
              : "";
          const tgtAction =
            tgtSegs.length > 0
              ? tgtSegs[tgtSegs.length - 1].replace(/^['"]|['"]$/g, "")
              : "";
          const dottedSource = srcAction
            ? `${srcAction}.${sourceName}`
            : sourceName;
          const dottedTarget = tgtAction
            ? `${tgtAction}.${targetName}`
            : targetName;
          connection = {
            source: dottedSource,
            target: dottedTarget,
            type: edgeType,
          };
          // succession-flow 부모는 소스 액션의 부모 (컨테이너)
          const flowParent =
            srcSegs.length > 1
              ? srcSegs[srcSegs.length - 2].replace(/^['"]|['"]$/g, "")
              : undefined;
          if (flowParent) connection.parent = flowParent;
        } else {
          connection = {
            source: sourceName,
            target: targetName,
            type: edgeType,
          };
          if (srcParent) connection.parent = srcParent;
        }
        if (
          edgeType === "succession" &&
          (edgeData.label || edgeData.successionName)
        ) {
          connection.label = edgeData.label || edgeData.successionName;
        }
      }
      return { type: "delete-connection", connection };
    }
    if (cell._isCompartmentItem && cell._nodeData?.compartmentKey === "doc") {
      const parentName = cell._nodeData?.parentName;
      if (!parentName) {
        log(
          `buildMxGraphDeleteRequest: doc compartment item - parentName 없음 cell.id=${cell.id}`,
        );
        return null;
      }
      return { type: "delete-doc", parentName };
    }
    if (cell._isCompartmentItem) {
      const compartmentData = cell._nodeData;
      if (!compartmentData || (!compartmentData.id && !compartmentData.name)) {
        log(
          `buildMxGraphDeleteRequest: compartment item - id/name 없음 cell.id=${cell.id}`,
        );
        return null;
      }
      return {
        type: "delete-element",
        id: compartmentData.id,
        name: compartmentData.name || compartmentData.id,
      };
    }
    const data = cell._nodeData;
    if (!data) {
      log(`buildMxGraphDeleteRequest: _nodeData 없음 cell.id=${cell.id}`);
      return null;
    }
    return {
      type: "delete-element",
      id: data.id || data.qualifiedName,
      name: data.name || data.declaredName || data.id,
    };
  }

  function deleteMxGraphCell(graph, cell) {
    const request = buildMxGraphDeleteRequest(graph, cell);
    if (!request) {
      return false;
    }
    try {
      ns.Editor.post?.(request);
      return true;
    } catch (_) {}
    return false;
  }

  function deleteSelectedCells(graph) {
    const selectedCells = graph.getSelectionCells();
    log(
      `delete-selected (mxGraph): 선택된 셀 수=${selectedCells?.length ?? 0}`,
    );
    if (selectedCells && selectedCells.length > 0) {
      // 모든 삭제 요청을 먼저 수집
      const deleteRequests = [];
      selectedCells.forEach((cell) => {
        const request = buildMxGraphDeleteRequest(graph, cell);
        if (request) {
          deleteRequests.push(request);
        }
      });
      log(`delete-selected (mxGraph): 삭제 요청 수=${deleteRequests.length}`);
      if (deleteRequests.length === 0) return;
      // 배치 삭제 요청 전송 (서버에서 한 번에 처리)
      try {
        ns.Editor.post?.({ type: "delete-elements", requests: deleteRequests });
      } catch (_) {}
    } else {
      log("delete-selected (mxGraph): no element selected");
      alert("삭제할 요소를 선택해주세요");
    }
  }

  // 외부에서 호출 가능하도록 노출
  ns.MxGraph.toolbar = ns.MxGraph.toolbar || {};
  ns.MxGraph.toolbar.buildDeleteRequest = function (graph, cell) {
    return buildMxGraphDeleteRequest(graph, cell);
  };
  ns.MxGraph.toolbar.deleteCell = function (graph, cell) {
    return deleteMxGraphCell(graph, cell);
  };
  ns.MxGraph.toolbar.deleteSelected = function () {
    const graph = ns.Editor._mxGraph;
    if (graph) deleteSelectedCells(graph);
  };

  /**
   * 다이어그램을 SVG 파일로 저장
   * @param {mxGraph} graph
   */
  function exportDiagramAsSvg(graph) {
    // mxGraph SVG 캔버스 요소 추출
    const svgEl = graph?.container?.querySelector("svg");
    if (!svgEl) {
      log("[exportDiagramAsSvg] SVG 요소를 찾을 수 없음");
      return;
    }

    // 다이어그램 bounds 계산 (내용이 없는 영역 제거)
    const bounds = graph.getGraphBounds();
    const padding = 20;
    const x = Math.floor(bounds.x - padding);
    const y = Math.floor(bounds.y - padding);
    const w = Math.ceil(bounds.width + padding * 2);
    const h = Math.ceil(bounds.height + padding * 2);

    // SVG 클론 후 viewBox 및 크기 설정
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    clone.setAttribute("width", w);
    clone.setAttribute("height", h);

    // foreignObject 내부 HTML 루트 요소에 xmlns 추가
    // (독립 SVG 파일에서 html=1 라벨이 렌더링되려면 필수)
    clone.querySelectorAll("foreignObject").forEach((fo) => {
      const firstChild = fo.firstElementChild;
      if (firstChild && !firstChild.getAttribute("xmlns")) {
        firstChild.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      }
    });

    // SVG 직렬화
    const serializer = new XMLSerializer();
    const svgStr =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      serializer.serializeToString(clone);

    // Extension으로 SVG 콘텐츠 전송 (저장 다이얼로그는 Extension 측에서 처리)
    ns.Editor.post({ type: "export-svg", svgContent: svgStr });
    log(`[exportDiagramAsSvg] SVG 내보내기 요청 전송 (${w}x${h})`);
  }

  /**
   * 속성창(Attributes Panel) 토글
   * @param {HTMLElement} btn - 토글 버튼
   */
  function togglePropertiesPanel(btn) {
    const panel = document.querySelector(".attributes-panel");
    const handle = document.getElementById("panelResizeHandle");
    if (!panel) return;

    const isHidden = panel.classList.toggle("hidden");
    if (handle) handle.classList.toggle("hidden", isHidden);
    if (btn) btn.classList.toggle("is-active", !isHidden);

    // 토글 ON으로 전환 시: 빈 상태 메시지 표시
    if (!isHidden && ns.Editor?.attributes?.render) {
      ns.Editor.attributes.render(null, null);
    }

    updateSharedToolbarState();

    log(`속성창 ${isHidden ? "숨김" : "표시"}`);
  }

  async function handleModelWithTiming(payload) {
    // Webview 렌더 타이밍 분해 측정 후 render-complete 전송
    const { model, visibilityConfig, guiData, cycleId, counts, recvAt } =
      payload || {};
    try {
      if (visibilityConfig && window?.localStorage) {
        window.localStorage.setItem(
          "diagram-visibility-config-cache",
          JSON.stringify(visibilityConfig),
        );
      }
    } catch {}
    const app = ns.Editor._app || mountApp();

    const tRecv = Number(recvAt) || performance.now();
    const tParseStart = performance.now();
    // Model Layer 모듈 사용 (캐시 포함)
    const normalized = ns.Editor.model.normalize(model, visibilityConfig);
    const receiveToParseMs = Math.max(0, performance.now() - tRecv);

    // 캐시를 app에 전달
    if (normalized.cache) {
      app._modelCache = normalized.cache;
      log("모델 캐시를 app에 저장:", normalized.cache.getStats());
    }

    app.setModel(normalized);
    app.deriveHierarchy();

    const hasGuiData = guiData?.nodes && Object.keys(guiData.nodes).length > 0;

    const tLayoutStart = performance.now();
    // SVG 렌더러용 레이아웃
    if (!(USE_MXGRAPH && ns.Editor._mxGraph)) {
      await app.layout();
    }
    const layoutMs = Math.max(0, performance.now() - tLayoutStart);

    const tDrawStart = performance.now();

    // mxGraph 렌더링
    if (USE_MXGRAPH && ns.Editor._mxGraph) {
      if (ns.Editor.layout?.precomputeNodeSizes) {
        ns.Editor.layout.precomputeNodeSizes(normalized);
      }

      // 항상 ELK 실행 — 새 노드에 위치 할당
      if (typeof ns.applyElkLayout === "function") {
        await ns.applyElkLayout(normalized);
        log("ELK layout 실행 완료");
      }

      ns.Editor._lastNormalizedModel = normalized;
      ns.Editor._lastGuiData = guiData;

      // mxGraph 렌더링 (ELK 결과 반영)
      ns.MxGraph.factory?.renderModel?.(ns.Editor._mxGraph, normalized);

      if (ns.Editor._foldDataRef) {
        ns.Editor._foldDataRef.current = normalized;
      }

      // guiData에 저장된 노드만 사용자 위치로 복원 (새 노드는 ELK 위치 유지)
      if (hasGuiData && !normalized._customLayoutApplied) {
        applyGuiDataPositions(ns.Editor._mxGraph, guiData.nodes);
        log(
          "guiData 노드 위치 복원:",
          Object.keys(guiData.nodes).length,
          "개 (나머지는 ELK 위치 유지)",
        );
      }
      // 전체 위치 저장 (guiData 노드 + ELK 위치 노드 모두)
      saveAllNodeGeometry(ns.Editor._mxGraph);

      // pendingPosition: 우클릭으로 생성된 신규 노드에 우클릭 좌표 적용
      log("pendingPosition 체크:", guiData?.pendingPosition);
      if (guiData?.pendingPosition) {
        applyPendingPosition(ns.Editor._mxGraph, guiData.pendingPosition);
      }
    } else {
      app.render();
    }

    const drawMs = Math.max(0, performance.now() - tDrawStart);

    // DOM 커밋/페인트까지 대기 (대략적 측정)
    requestAnimationFrame(() => {
      // 최초 로드 시 다이어그램을 화면에 fit
      if (_firstRender && ns.Editor._mxGraph) {
        _firstRender = false;
        ns.MxGraph.zoomPan?.zoomToFit?.(ns.Editor._mxGraph, 50);
      }

      const domCommitMs = Math.max(
        0,
        performance.now() - (tDrawStart + drawMs),
      );
      try {
        const post =
          ns.Editor && typeof ns.Editor.post === "function"
            ? ns.Editor.post
            : window.vscode && typeof window.vscode.postMessage === "function"
              ? window.vscode.postMessage.bind(window.vscode)
              : null;
        if (post) {
          post({
            type: "render-complete",
            cycleId,
            timing: {
              receiveToParseMs,
              layoutMs,
              drawMs,
              domCommitMs,
            },
            counts,
          });
        }
      } catch {}
    });
  }

  // normalizeModel 및 관련 함수들은 model/ 디렉터리로 분리됨
  // - model/visibilityFilter.js: 가시성 필터 로직
  // - model/nodeTransformer.js: 노드 변환 로직
  // - model/edgeTransformer.js: 엣지 변환 로직
  // - model/normalizer.js: normalizeModel() 메인 함수

  let latestPayload = null; // { model, visibilityConfig, guiData, cycleId, counts, recvAt }
  let modelTimer = null;
  const MODEL_COALESCE_MS = 0;
  let _firstRender = true; // 최초 로드 시 fit-to-screen 적용 플래그

  /**
   * guiData의 노드 위치를 mxGraph 셀에 적용
   * ELK가 크기의 유일한 결정 소스이므로 x, y만 override한다.
   */
  function applyGuiDataPositions(graph, nodePositions) {
    if (!graph || !nodePositions) return;
    const model = graph.getModel();
    // 부모별 신규 노드 수 추적 (위치 겹침 방지용)
    const newNodeCountByParent = new Map();

    // top-level 신규 노드 배치를 위해 store에 있는 top-level 노드들의 우측 끝 사전 계산
    let savedTopRightMax = 10;
    let savedTopY = 10;
    const defaultParent = graph.getDefaultParent();
    if (defaultParent) {
      const childCount = model.getChildCount(defaultParent);
      for (let i = 0; i < childCount; i++) {
        const child = model.getChildAt(defaultParent, i);
        if (child && model.isVertex(child) && child._nodeData) {
          const nodeData = child._nodeData;
          const nodeId = stableNodeKey(nodeData);
          if (nodeId && nodePositions[nodeId]) {
            const saved = nodePositions[nodeId];
            const right = (saved.x || 0) + (saved.width || 200);
            if (right > savedTopRightMax) {
              savedTopRightMax = right;
              savedTopY = saved.y || 10;
            }
          }
        }
      }
    }

    model.beginUpdate();
    try {
      // 중첩 컨테이너 포함 모든 vertex 재귀 순회
      function applyToCell(cell) {
        if (!cell) return;
        if (model.isVertex(cell) && cell._nodeData) {
          const nodeData = cell._nodeData;
          const nodeId = stableNodeKey(nodeData);
          if (nodeId) {
            const saved = nodePositions[nodeId];
            if (saved) {
              const geo = model.getGeometry(cell);
              if (geo) {
                const newGeo = geo.clone();
                newGeo.x = Number(saved.x ?? geo.x);
                newGeo.y = Number(saved.y ?? geo.y);
                newGeo.width = Number(saved.width ?? geo.width);
                newGeo.height = Number(saved.height ?? geo.height);
                model.setGeometry(cell, newGeo);
              }
            } else {
              log(`[applyGuiData] ${nodeId}: NO MATCH in guiData`);
            }
            // guiData 없는 노드는 ELK 계산 위치 그대로 유지 (자동 배치 제거)
          }
        }
        const childCount = model.getChildCount(cell);
        for (let i = 0; i < childCount; i++) {
          applyToCell(model.getChildAt(cell, i));
        }
      }
      applyToCell(model.getRoot());
    } finally {
      model.endUpdate();
    }
  }

  // 디버그 도구에서 직접 호출 가능하도록 노출
  ns.Editor.applyGuiDataPositions = applyGuiDataPositions;
  ns.Editor._nextAutoName = nextAutoName;

  /**
   * pendingPosition: 우클릭으로 생성된 신규 노드의 위치를 우클릭 좌표로 override
   * 컨테이너 내부 노드는 부모 뷰 좌표를 빼 상대 좌표로 변환한다.
   * 적용 후 clear-pending-position 메시지를 전송하여 store에서 삭제한다.
   */
  function applyPendingPosition(graph, pendingPosition) {
    if (!graph || !pendingPosition) return;
    const { name, x, y } = pendingPosition;
    if (!name || typeof x !== "number" || typeof y !== "number") return;

    const model = graph.getModel();
    const view = graph.getView();
    let applied = false;

    function findAndApply(cell) {
      if (!cell) return;
      if (model.isVertex(cell) && cell._nodeData) {
        const nodeData = cell._nodeData;
        // declaredName(단축명) 우선 비교 — name이 qualified name(Pkg::Node)이면 불일치 방지
        const shortName =
          nodeData.declaredName ||
          (nodeData.name ? nodeData.name.split("::").pop() : null);
        if (shortName === name) {
          const geo = model.getGeometry(cell);
          if (geo) {
            const newGeo = geo.clone();
            const parentCell = model.getParent(cell);
            // 부모가 루트가 아닌 실제 컨테이너이면 부모 뷰 좌표를 기준으로 상대 좌표 계산
            if (
              parentCell &&
              parentCell !== model.getRoot() &&
              parentCell !== graph.getDefaultParent()
            ) {
              const parentState = view.getState(parentCell);
              if (parentState) {
                const scale = view.scale || 1;
                const parentAbsX =
                  parentState.x / scale - (view.translate?.x || 0);
                const parentAbsY =
                  parentState.y / scale - (view.translate?.y || 0);
                // geo.y는 컨테이너 top-left 기준 — headerH 보정 불필요
                newGeo.x = x - parentAbsX;
                newGeo.y = y - parentAbsY;
              } else {
                newGeo.x = x;
                newGeo.y = y;
              }
            } else {
              newGeo.x = x;
              newGeo.y = y;
            }
            model.beginUpdate();
            try {
              model.setGeometry(cell, newGeo);
            } finally {
              model.endUpdate();
            }
            applied = true;
            log("pendingPosition 적용:", name, "->", newGeo.x, newGeo.y);
          }
          return;
        }
      }
      if (applied) return;
      const childCount = model.getChildCount(cell);
      for (let i = 0; i < childCount; i++) {
        findAndApply(model.getChildAt(cell, i));
        if (applied) return;
      }
    }

    findAndApply(model.getRoot());

    // store에서 pendingPosition 삭제
    try {
      postEditorMessage({ type: "clear-pending-position" });
    } catch (_) {}
  }

  function showBlockSpinner(message) {
    if (typeof window.SelabSpinner?.show === "function") {
      window.SelabSpinner.show(message || "Processing...");
    }
  }

  function hideBlockSpinner() {
    if (typeof window.SelabSpinner?.hide === "function") {
      window.SelabSpinner.hide();
    }
  }

  // Message wiring (from extension)
  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "showSpinner") {
      showBlockSpinner(message.message);
      return;
    }
    if (message.type === "hideSpinner") {
      hideBlockSpinner();
      return;
    }
    if (message.type === "error") {
      hideBlockSpinner();
      hidePlaceholder();
      return;
    }
    if (message.type === "model") {
      // 모델 수신 시 placeholder + spinner 숨기기
      hideBlockSpinner();
      // 한국어 주석: 수신 시각과 사이클 정보 보존
      latestPayload = {
        model: message.model,
        visibilityConfig: message.visibilityConfig,
        guiData: message.guiData || {},
        cycleId: message.cycleId,
        counts: message.counts,
        recvAt: performance.now(),
      };
      if (modelTimer) clearTimeout(modelTimer);
      modelTimer = setTimeout(() => {
        const p = latestPayload;
        latestPayload = null;
        modelTimer = null;
        handleModelWithTiming(p);
        // Textual View 탭이 활성이고 편집 중이 아니면 소스 자동 갱신
        try {
          const activeTab = document.querySelector(
            '.property-tab-content.active[data-tab="advanced"]',
          );
          if (activeTab) {
            const PropertyPanel = ns.Editor?.ui?.PropertyPanel;
            const tvMod = ns.Editor?.ui?._textualView;
            if (PropertyPanel && tvMod && !PropertyPanel._textualIsEditing) {
              tvMod.requestSysmlSource(PropertyPanel);
            }
          }
        } catch {}
      }, MODEL_COALESCE_MS);
    } else if (message.type === "update") {
      // Not used for diagram-only mode
    } else if (message.type === "init-translations") {
      const PropertyPanel = ns.Editor?.ui?.PropertyPanel;
      if (
        PropertyPanel &&
        typeof PropertyPanel.setTranslations === "function"
      ) {
        PropertyPanel.setTranslations(message.translations);
      } else {
        ns.Editor._pendingPropertyPanelTranslations = message.translations;
      }
    } else if (message.type === "sysml-source") {
      // Textual View 탭에 SysML 소스 코드 업데이트
      const PropertyPanel = ns.Editor?.ui?.PropertyPanel;
      if (
        PropertyPanel &&
        typeof PropertyPanel.updateTextualView === "function"
      ) {
        PropertyPanel.updateTextualView(
          message.source,
          message.range,
          message.baseIndentLength,
        );
      }
    } else if (message.type === "sysml-source-result") {
      // Textual View 편집 결과 처리 (성공/실패 배너)
      const PropertyPanel = ns.Editor?.ui?.PropertyPanel;
      const tvMod = ns.Editor?.ui?._textualView;
      if (PropertyPanel && tvMod && typeof tvMod.onEditResult === "function") {
        tvMod.onEditResult(
          PropertyPanel,
          message.success,
          message.errorMessage,
        );
      }
    } else if (message.type === "sysml-diagnostics") {
      // Textual View에 에러 하이라이팅 및 에러 목록 표시
      const PropertyPanel = ns.Editor?.ui?.PropertyPanel;
      const tvMod = ns.Editor?.ui?._textualView;
      if (
        PropertyPanel &&
        tvMod &&
        typeof tvMod.applyDiagnostics === "function"
      ) {
        tvMod.applyDiagnostics(PropertyPanel, message.diagnostics || []);
      }
    } else if (message.type === "response-completion") {
      // Textual View 자동완성 응답 처리
      const tvMod = ns.Editor?.ui?._textualView;
      if (tvMod && typeof tvMod.handleCompletionResponse === "function") {
        tvMod.handleCompletionResponse(message.id, message.items);
      }
    } else if (message.type === "select") {
      const app = ns.Editor._app || mountApp();
      const normalizedName = ns.Editor.utils.normalizeSelectionName(
        message.name,
      );
      app.select({ id: message.id, name: normalizedName }).render();
    }
  });

  // 웹뷰 포커스 시 activated 메시지 전송
  window.addEventListener("focus", () => {
    try {
      if (typeof ns.Editor.post === "function")
        ns.Editor.post({ type: "activated" });
      else if (window.vscode && typeof window.vscode.postMessage === "function")
        window.vscode.postMessage({ type: "activated" });
    } catch {}
  });

  // Initial mount
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountApp());
  } else {
    mountApp();
  }

  // ========== 패널 리사이즈 기능 ==========
  (function initPanelResize() {
    const handle = document.getElementById("panelResizeHandle");
    const attributesPanel = document.querySelector(".attributes-panel");
    if (!handle || !attributesPanel) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    const MIN_WIDTH = 200;
    const MAX_WIDTH = 600;

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = attributesPanel.offsetWidth;
      handle.classList.add("dragging");
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const deltaX = startX - e.clientX;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + deltaX),
      );
      attributesPanel.style.flex = `0 0 ${newWidth}px`;
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });

    // 키보드 접근성 (좌우 화살표 키로 조절)
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 50 : 10;
      let width = attributesPanel.offsetWidth;
      if (e.key === "ArrowLeft") {
        width = Math.min(MAX_WIDTH, width + step);
        attributesPanel.style.flex = `0 0 ${width}px`;
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        width = Math.max(MIN_WIDTH, width - step);
        attributesPanel.style.flex = `0 0 ${width}px`;
        e.preventDefault();
      }
    });
  })();
})();
