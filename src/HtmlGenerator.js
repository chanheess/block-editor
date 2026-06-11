/*******************************************************************************
 * Copyright: SELab.AI (c) 2025
 * 블록 에디터 HTML 생성기 - 독자적 웹뷰 HTML 생성
 *******************************************************************************/

const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

// selab-ui 미디어 루트 해석
function resolveUiMediaRoot(context) {
    const packagedUiRoot = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'selab-ui', 'media');
    if (fs.existsSync(packagedUiRoot.fsPath)) {
        return packagedUiRoot;
    }
    const workspaceUiRoot = vscode.Uri.file(path.resolve(context.extensionUri.fsPath, '..', 'selab-ui', 'media'));
    if (fs.existsSync(workspaceUiRoot.fsPath)) {
        return workspaceUiRoot;
    }
    return packagedUiRoot;
}

// selab-ui 아이콘 읽기 헬퍼
function readSelabIcon(context, name, size = 24) {
    try {
        const selabUiIconsDir = path.resolve(context.extensionUri.fsPath, '..', 'selab-ui', 'resources', 'icons');
        return fs
            .readFileSync(path.join(selabUiIconsDir, name), 'utf8')
            .replace(/width="[^"]*"/, `width="${size}"`)
            .replace(/height="[^"]*"/, `height="${size}"`)
            .replace(/fill="black"/g, 'fill="currentColor"');
    } catch {
        return '';
    }
}

// SysML v2 아이콘 경로 해석
function resolveIconBaseUri(context, webview) {
    try {
        const selabUiIconsDir = path.resolve(context.extensionUri.fsPath, '..', 'selab-ui', 'resources', 'icons_SysmlV2Elements');
        return webview.asWebviewUri(vscode.Uri.file(selabUiIconsDir)).toString();
    } catch {
        return '';
    }
}

function buildErrorHtml(webview, message, detail) {
    const escapedMessage = String(message || 'Unknown block editor webview error')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const escapedDetail = String(detail || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SELab Block Diagram</title>
    <style>
        body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #1e1e1e; color: #f3f4f6; }
        .error-shell { max-width: 960px; margin: 0 auto; }
        .error-title { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
        .error-message { margin: 0 0 16px; color: #fca5a5; }
        .error-detail { white-space: pre-wrap; background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 16px; }
    </style>
</head>
<body>
    <div class="error-shell">
        <h1 class="error-title">SELab Block Diagram failed to load</h1>
        <p class="error-message">${escapedMessage}</p>
        <div class="error-detail">${escapedDetail}</div>
    </div>
</body>
</html>`;
}

// 에디터 스크립트 URI 헬퍼
function editorScript(webview, extensionUri, relativePath, version) {
    const uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'editor', ...relativePath.split('/')));
    return `${uri.toString()}?${version}`;
}

class HtmlGenerator {
    static getHtml(context, webview) {
        try {
            const extensionUri = context.extensionUri;
            const uiRoot = resolveUiMediaRoot(context);
            const version = `v=${Date.now()}`;
            const nonce = Math.random().toString(36).slice(2);

            // CSS
            const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sysml-editor.css'));
            const toolbarCss = webview.asWebviewUri(vscode.Uri.joinPath(uiRoot, 'toolbar.css'));
            const spinnerCss = webview.asWebviewUri(vscode.Uri.joinPath(uiRoot, 'spinner.css'));

            // selab-ui JS
            const toolbarJs = webview.asWebviewUri(vscode.Uri.joinPath(uiRoot, 'toolbar.js'));
            const spinnerJs = webview.asWebviewUri(vscode.Uri.joinPath(uiRoot, 'spinner.js'));

            // mxGraph 라이브러리
            const mxGraphClient = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'mxgraph', 'javascript', 'mxClient.min.js'));

            // ELK
            const elk = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'elkjs', 'lib', 'elk.bundled.js'));

            // CodeMirror 번들
            const codeMirrorBundle = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'vendor', 'codemirror.bundle.js'));

            // 아이콘 URI
            const iconBaseUri = resolveIconBaseUri(context, webview);

            // AI 워크플로우 스크립트 (있을 경우)
            let modAiWorkflow = null;
            try {
                const aiWorkflowPath = path.resolve(extensionUri.fsPath, '..', 'selab-ai-workflow', 'src', 'webview', 'aiWorkflow.js');
                if (fs.existsSync(aiWorkflowPath)) {
                    modAiWorkflow = webview.asWebviewUri(vscode.Uri.file(aiWorkflowPath));
                }
            } catch {}

            // 에디터 스크립트 URI 생성 헬퍼
            const es = (relativePath) => editorScript(webview, extensionUri, relativePath, version);

            return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${css.toString()}?${version}" />
    <link rel="stylesheet" href="${toolbarCss.toString()}?${version}" />
    <link rel="stylesheet" href="${spinnerCss.toString()}?${version}" />
    <style>
      html, body { height: 100%; min-height: 100vh; margin: 0; padding: 0; }
      .editor-container { display: flex; height: 100%; min-height: 100vh; width: 100%; }
      .editor-panel { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; }
      .panel-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; min-height: 40px; }
      .diagram-editor { flex: 1 1 auto; position: relative; min-height: 240px; }
    </style>
    <title>SELab Block Diagram</title>
  </head>
  <body>
    <div class="editor-container">
      <div class="editor-panel diagram-panel" style="flex: 1 1 auto;">
        <div class="diagram-editor" id="diagramEditor">
          <div id="toolbar-mount"></div>
          <svg id="diagramSvg" width="100%" height="100%"></svg>
        </div>
      </div>
      <div class="panel-resize-handle" id="panelResizeHandle" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <div class="editor-panel attributes-panel" style="flex: 0 0 320px;">
        <div class="panel-header">
          <h3>Attributes</h3>
        </div>
        <div class="attributes-content" id="attributePanel"></div>
      </div>
    </div>
    <script nonce="${nonce}">
      try {
        window.mxBasePath = '';
        window.mxLoadResources = false;
        window.mxLoadStylesheets = false;
        const ns = (window.SELAB = window.SELAB || {});
        ns.Editor = ns.Editor || {};
        ns.Editor._queue = ns.Editor._queue || [];
        if (typeof ns.Editor.post !== 'function') {
          ns.Editor.post = (payload) => { try { ns.Editor._queue.push(payload); } catch {} };
        }
        const v = window.vscode || (typeof acquireVsCodeApi==='function' ? acquireVsCodeApi() : null);
        if (v) {
          window.vscode = v;
          ns.Editor.vscode = v;
          try { (ns.Editor._queue || []).splice(0).forEach(m => v.postMessage(m)); } catch {}
          ns.Editor.post = (payload) => { try { v.postMessage(payload); } catch {} };
          v.postMessage?.({ type: 'log', tag: '[webview-inline]', message: 'inline reached' });
        }
        ns.Editor.iconBaseUri = '${iconBaseUri}';
      } catch {}
    </script>
    <script nonce="${nonce}" src="${toolbarJs.toString()}?${version}"></script>
    <script nonce="${nonce}" src="${spinnerJs.toString()}?${version}"></script>
    <!-- mxGraph -->
    <script nonce="${nonce}" src="${mxGraphClient.toString()}?${version}"></script>
    <!-- mxGraph 래퍼 모듈 -->
    <script nonce="${nonce}" src="${es('mxgraph/MxGraphWrapper.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxStyleColors.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxStyleShapes.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxStyleManager.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxTypeUtils.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxLabelUtils.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxCompartmentHtml.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxCompartmentRenderer.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxLoopBodyRenderer.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxVertexBuilder.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxEdgeBuilder.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxCellFactory.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxHistoryManager.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxEventHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxSelectionManager.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxDragHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxZoomPanHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxLayoutManager.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxMinimap.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/EdgeTypeMapping.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/EdgeTypeMenu.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxConnectionHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxFoldManager.js')}"></script>
    <script type="module" nonce="${nonce}" src="${es('vendor/ninja-keys.bundled.js')}"></script>
    <script type="module" nonce="${nonce}">
      window.dispatchEvent(new CustomEvent('ninja-keys-ready'));
    </script>
    <script nonce="${nonce}" src="${es('mxgraph/MxContextMenuData.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxContextMenuUtils.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/MxContextMenu.js')}"></script>
    <script nonce="${nonce}" src="${es('mxgraph/index.js')}"></script>
    <!-- Core -->
    <script nonce="${nonce}" src="${es('index.js')}"></script>
    <script nonce="${nonce}" src="${es('utils.js')}"></script>
    <script nonce="${nonce}" src="${es('utils/qualifiedNameUtils.js')}"></script>
    <script nonce="${nonce}" src="${es('render/renderUtils.js')}"></script>
    <!-- Config -->
    <script nonce="${nonce}" src="${es('config/displaySettings.js')}"></script>
    <script nonce="${nonce}" src="${es('config/typeRegistry.js')}"></script>
    <script nonce="${nonce}" src="${es('config/compartmentRules.js')}"></script>
    <script nonce="${nonce}" src="${es('config/metrics.js')}"></script>
    <!-- Render Elements -->
    <script nonce="${nonce}" src="${es('render/elements/drawTypeGlyph.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawControlNode.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawActionNode.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawCommentNode.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawAliasNode.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawUseCaseNode.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawBorderNode.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/drawCompartment.js')}"></script>
    <script nonce="${nonce}" src="${es('render/elements/index.js')}"></script>
    <script nonce="${nonce}" src="${es('render/drawElement.js')}"></script>
    <script nonce="${nonce}" src="${es('render/drawContainerHeader.js')}"></script>
    <script nonce="${nonce}" src="${es('render/drawEdge.js')}"></script>
    <script nonce="${nonce}" src="${es('render/drawContainerToggle.js')}"></script>
    <script nonce="${nonce}" src="${es('core.js')}"></script>
    <!-- ELK -->
    <script nonce="${nonce}" src="${elk.toString()}?${version}"></script>
    <script nonce="${nonce}" src="${es('layout/elkLayout.js')}"></script>
    <script nonce="${nonce}" src="${es('layout/bddLayout.js')}"></script>
    <script nonce="${nonce}" src="${es('layout/alignRanks.js')}"></script>
    <!-- Editor services -->
    <script nonce="${nonce}" src="${es('hierarchy.js')}"></script>
    <script nonce="${nonce}" src="${es('layout.js')}"></script>
    <script nonce="${nonce}" src="${es('render/index.js')}"></script>
    <!-- Interaction Layer -->
    <script nonce="${nonce}" src="${es('interaction/selectionManager.js')}"></script>
    <script nonce="${nonce}" src="${es('interaction/dragHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('interaction/zoomPanHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('interaction/connectionCreator.js')}"></script>
    <script nonce="${nonce}" src="${es('interaction/lassoSelector.js')}"></script>
    <script nonce="${nonce}" src="${es('interaction/index.js')}"></script>
    <script nonce="${nonce}" src="${es('interactions.js')}"></script>
    <!-- CodeMirror -->
    <script nonce="${nonce}" src="${codeMirrorBundle.toString()}?${version}"></script>
    <!-- PropertyPanel -->
    <script nonce="${nonce}" src="${es('config/propertyRules.js')}"></script>
    <script nonce="${nonce}" src="${es('ui/PropertyPanelWidgets.js')}"></script>
    <script nonce="${nonce}" src="${es('ui/PropertyPanelEdge.js')}"></script>
    <script nonce="${nonce}" src="${es('ui/PropertyPanelConstraints.js')}"></script>
    <script nonce="${nonce}" src="${es('ui/PropertyPanelTextualView.js')}"></script>
    <script nonce="${nonce}" src="${es('ui/PropertyPanel.js')}"></script>
    <script nonce="${nonce}" src="${es('attributes.js')}"></script>
    ${modAiWorkflow ? `<script nonce="${nonce}" src="${modAiWorkflow.toString()}?${version}"></script>` : ''}
    <!-- Model Layer -->
    <script nonce="${nonce}" src="${es('model/model-cache.js')}"></script>
    <script nonce="${nonce}" src="${es('model/visibilityFilter.js')}"></script>
    <script nonce="${nonce}" src="${es('model/portBorderNodeHandler.js')}"></script>
    <script nonce="${nonce}" src="${es('model/nodeTransformer.js')}"></script>
    <script nonce="${nonce}" src="${es('model/edgeTransformer.js')}"></script>
    <script nonce="${nonce}" src="${es('model/normalizer.js')}"></script>
    <script nonce="${nonce}" src="${es('model/index.js')}"></script>
    <!-- Boot -->
    <script nonce="${nonce}" src="${es('boot.js')}"></script>
  </body>
</html>`;
        } catch (error) {
            return buildErrorHtml(webview, error?.message || 'Failed to build block diagram webview HTML.', error?.stack || '');
        }
    }
}

module.exports = {
    HtmlGenerator,
};
