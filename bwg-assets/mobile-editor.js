import { r as React, j as jsx } from "./vendor-react-C9qzurSm.js";

const activeDrags = new Set();
let suppressCanvasClick = false;

// Keep mouse dragging, and distinguish a finger drag from a stationary long press.
export function bindMapDrag(sprite, handlers) {
  let pointer = null;
  let origin;
  let dragging = false;
  let timer;
  const clearHold = () => clearTimeout(timer);
  const finish = () => {
    clearHold();
    pointer = null;
    activeDrags.delete(finish);
    sprite.cursor = "grab";
    if (dragging) {
      dragging = false;
      handlers.onEnd();
    }
  };
  const start = event => {
    dragging = true;
    sprite.cursor = "grabbing";
    handlers.onStart?.(event);
    handlers.onMove(event);
  };
  const down = event => {
    if (event.button !== 0 || pointer !== null) return;
    event.stopPropagation();
    pointer = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    activeDrags.add(finish);
    if (event.pointerType !== "touch") {
      start(event);
      return;
    }
    const target = sprite.parent;
    if (target.contextMenuHandler) {
      // Pixi reuses event objects, so retain coordinates rather than the event.
      const position = { global: { x: event.global.x, y: event.global.y } };
      timer = setTimeout(() => {
        finish();
        suppressCanvasClick = true;
        target.contextMenuHandler?.(target, position);
      }, 550);
    }
  };
  const move = event => {
    if (event.pointerId !== pointer) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 7) return;
      clearHold();
      start(event);
    } else handlers.onMove(event);
  };
  const up = event => {
    if (event.pointerId === pointer) finish();
  };
  sprite.eventMode = "static";
  sprite.cursor = "grab";
  sprite.on("pointerdown", down);
  sprite.on("globalpointermove", move);
  sprite.on("pointerup", up);
  sprite.on("pointerupoutside", up);
  sprite.on("pointercancel", up);
  return () => {
    finish();
    sprite.off("pointerdown", down);
    sprite.off("globalpointermove", move);
    sprite.off("pointerup", up);
    sprite.off("pointerupoutside", up);
    sprite.off("pointercancel", up);
  };
}

// Transform only the displayed canvas; exported images retain their full size.
export function installMapViewport(canvas, place) {
  const host = canvas.parentElement;
  const mobile = matchMedia("(max-width: 1023px)");
  const pointers = new Map();
  const listeners = new Set();
  let scale = 1, x = 0, y = 0, mode = "edit", gesture = null;
  const snapshot = () => ({ scale, mode });
  const notify = () => listeners.forEach(listener => listener(snapshot()));
  const constrain = () => {
    const minX = host.clientWidth * (1 - scale);
    const minY = host.clientHeight * (1 - scale);
    x = Math.max(minX, Math.min(0, x));
    y = Math.max(minY, Math.min(0, y));
  };
  const render = () => {
    constrain();
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    canvas.style.cursor = mode === "pan" ? "grab" : mode === "edit" ? "auto" : "crosshair";
    notify();
  };
  const zoom = (next, center) => {
    const bounds = host.getBoundingClientRect();
    const anchor = center ?? { x: bounds.width / 2, y: bounds.height / 2 };
    next = Math.max(1, Math.min(5, next));
    x = anchor.x - (anchor.x - x) * next / scale;
    y = anchor.y - (anchor.y - y) * next / scale;
    scale = next;
    render();
  };
  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const down = event => {
    if (!mobile.matches || event.target !== canvas || event.button !== 0) return;
    suppressCanvasClick = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      activeDrags.forEach(finish => finish());
      const mid = midpoint();
      gesture = { ...mid, scale, panX: x, panY: y, pinch: true };
      stop(event);
    } else if (mode !== "edit") {
      gesture = { x: event.clientX, y: event.clientY, panX: x, panY: y, moved: false };
      canvas.setPointerCapture(event.pointerId);
      stop(event);
    }
  };
  const move = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture) return;
    stop(event);
    if (pointers.size >= 2 && gesture.pinch) {
      const mid = midpoint();
      const bounds = host.getBoundingClientRect();
      scale = Math.max(1, Math.min(5, gesture.scale * mid.distance / Math.max(1, gesture.distance)));
      x = mid.x - bounds.left - (gesture.x - bounds.left - gesture.panX) * scale / gesture.scale;
      y = mid.y - bounds.top - (gesture.y - bounds.top - gesture.panY) * scale / gesture.scale;
      render();
    } else if (!gesture.pinch) {
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.hypot(dx, dy) > 7) gesture.moved = true;
      if (mode === "pan") { x = gesture.panX + dx; y = gesture.panY + dy; render(); }
    }
  };
  const up = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (event.type === "pointercancel") activeDrags.forEach(finish => finish());
    if (gesture) {
      stop(event);
      if (event.type === "pointerup" && !gesture.pinch && !gesture.moved && mode !== "pan" && mode !== "edit") {
        const bounds = canvas.getBoundingClientRect();
        place(mode, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
      }
      // Suppress the remaining finger until it lifts after a pinch.
      if (!pointers.size) gesture = null;
    }
  };
  const reset = () => {
    activeDrags.forEach(finish => finish());
    pointers.clear();
    gesture = null;
    scale = 1; x = 0; y = 0;
    render();
  };
  const click = event => {
    if (event.target === canvas && suppressCanvasClick) stop(event);
  };
  const blur = () => {
    activeDrags.forEach(finish => finish());
    pointers.clear();
    gesture = null;
  };
  const resize = new ResizeObserver(reset);
  resize.observe(host);
  mobile.addEventListener("change", reset);
  window.addEventListener("click", click, true);
  window.addEventListener("blur", blur);
  // Capture before Pixi's document listeners so navigating never moves buildings.
  for (const [type, handler] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]]) {
    window.addEventListener(type, handler, { capture: true, passive: false });
  }
  return {
    zoom: factor => zoom(scale * factor),
    reset,
    setMode(next) { activeDrags.forEach(finish => finish()); mode = next; render(); },
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    destroy() {
      resize.disconnect();
      mobile.removeEventListener("change", reset);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", blur);
      for (const [type, handler] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]]) {
        window.removeEventListener(type, handler, true);
      }
      listeners.clear();
    }
  };
}

const tools = [["city-1", "一环"], ["city-2", "二环"], ["city-3", "三环"], ["city-4", "车身"], ["flag", "旗帜"], ["mine", "联盟矿"]];

export function MobileControls({ scene, toolsOpen, onToggleTools, onDismissContext }) {
  const [view, setView] = React.useState({ scale: 1, mode: "edit" });
  React.useEffect(() => scene?.viewport.subscribe(setView), [scene]);
  const button = (label, action, props = {}) => jsx.jsx("button", { type: "button", disabled: !scene, onClick: action, ...props, children: label });
  return jsx.jsxs("nav", { className: "mobile-controls", "aria-label": "地图操作", onClick: event => { event.stopPropagation(); onDismissContext(); }, children: [
    jsx.jsx("div", { className: "mobile-hint", role: "status", children: view.mode === "pan" ? "单指移动地图 · 双指缩放" : view.mode === "edit" ? "拖动建筑调整位置 · 长按建筑打开菜单" : `点地图放置${tools.find(([key]) => key === view.mode)?.[1] ?? "建筑"} · 双指缩放` }),
    jsx.jsx("div", { className: "mobile-palette", "aria-label": "选择要放置的建筑", children: tools.map(([key, label]) => button(label, () => scene.viewport.setMode(view.mode === key ? "edit" : key), { key, "aria-pressed": view.mode === key })) }),
    jsx.jsxs("div", { className: "mobile-actions", children: [
      button("编辑", () => scene.viewport.setMode("edit"), { "aria-pressed": view.mode === "edit" }),
      button("移动", () => scene.viewport.setMode("pan"), { "aria-pressed": view.mode === "pan" }),
      button("−", () => scene.viewport.zoom(1 / 1.35), { "aria-label": "缩小地图", disabled: !scene || view.scale <= 1 }),
      button(`${Math.round(view.scale * 100)}%`, () => scene.viewport.reset(), { "aria-label": "复位地图视图" }),
      button("＋", () => scene.viewport.zoom(1.35), { "aria-label": "放大地图", disabled: !scene || view.scale >= 5 }),
      button(toolsOpen ? "收起" : "工具", onToggleTools, { "aria-expanded": toolsOpen, "aria-controls": "editor-tools", className: "mobile-tools-toggle" })
    ] })
  ] });
}
