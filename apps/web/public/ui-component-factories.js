/**
 * UI Component Factories — DOM element generators for UIComponentShop
 * Each function takes a config object and returns a DOM element
 */

/* ── Globe Popup ── */
function createGlobePopup(config) {
  const el = document.createElement("div");
  el.className = "ui-component globe-popup";

  const title = config.title || "Untitled";
  const content = config.content || "";
  const severity = config.severity || "info";
  const closable = config.closable !== false;

  el.innerHTML = `
    <div class="popup-header popup-severity-${severity}">
      <span class="popup-title">${escapeHtml(title)}</span>
      ${closable ? '<button class="popup-close">&times;</button>' : ""}
    </div>
    <div class="popup-body">${typeof content === "string" ? content : ""}</div>
    ${config.footer ? `<div class="popup-footer">${config.footer}</div>` : ""}
  `;

  // Close button
  if (closable) {
    const closeBtn = el.querySelector(".popup-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (config.onClose) config.onClose();
        if (config.shop && config.id) config.shop.destroy(config.id);
      });
    }
  }

  // Draggable
  if (config.draggable) {
    makeDraggable(el, el.querySelector(".popup-header"));
  }

  return el;
}

/* ── Alert Toast ── */
function createAlertToast(config) {
  const el = document.createElement("div");
  el.className = "ui-component alert-toast";

  const message = config.message || "";
  const severity = config.severity || "info";
  const duration = config.duration || 5000;

  el.innerHTML = `
    <div class="toast-icon toast-severity-${severity}">●</div>
    <div class="toast-message">${escapeHtml(message)}</div>
    <button class="toast-close">&times;</button>
  `;

  // Auto-remove
  if (duration > 0) {
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(-20px)";
      setTimeout(() => {
        if (config.shop && config.id) config.shop.destroy(config.id);
        else if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, duration);
  }

  // Close button
  const closeBtn = el.querySelector(".toast-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (config.shop && config.id) config.shop.destroy(config.id);
      else if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  return el;
}

/* ── Floating Panel ── */
function createFloatingPanel(config) {
  const el = document.createElement("div");
  el.className = "ui-component floating-panel";

  const title = config.title || "Panel";
  const content = config.content || "";
  const width = config.width || "300px";
  const height = config.height || "auto";

  el.style.width = width;
  el.style.minHeight = "100px";
  if (height !== "auto") el.style.height = height;

  el.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">${escapeHtml(title)}</span>
      <div class="panel-controls">
        <button class="panel-minimize">−</button>
        <button class="panel-close">×</button>
      </div>
    </div>
    <div class="panel-body">${typeof content === "string" ? content : ""}</div>
  `;

  // Controls
  const closeBtn = el.querySelector(".panel-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (config.onClose) config.onClose();
      if (config.shop && config.id) config.shop.destroy(config.id);
    });
  }

  const minimizeBtn = el.querySelector(".panel-minimize");
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      const body = el.querySelector(".panel-body");
      if (body) {
        body.style.display = body.style.display === "none" ? "" : "none";
        minimizeBtn.textContent = body.style.display === "none" ? "+" : "−";
      }
    });
  }

  // Draggable
  if (config.draggable !== false) {
    makeDraggable(el, el.querySelector(".panel-header"));
  }

  // Resizable
  if (config.resizable) {
    makeResizable(el);
  }

  return el;
}

/* ── Badge ── */
function createBadge(config) {
  const el = document.createElement("div");
  el.className = "ui-component globe-badge";

  const label = config.label || "";
  const severity = config.severity || "info";
  const size = config.size || "normal";

  el.classList.add(`badge-size-${size}`);
  el.innerHTML = `
    <div class="badge-dot badge-severity-${severity}"></div>
    <span class="badge-label">${escapeHtml(label)}</span>
  `;

  return el;
}

/* ── Info Card ── */
function createInfoCard(config) {
  const el = document.createElement("div");
  el.className = "ui-component info-card";

  const title = config.title || "";
  const imageUrl = config.imageUrl || null;
  const fields = config.fields || [];
  const actions = config.actions || [];

  let html = "";
  if (imageUrl) {
    html += `<div class="info-card-image" style="background-image:url('${escapeHtml(imageUrl)}')"></div>`;
  }

  html += `<div class="info-card-header">${escapeHtml(title)}</div>`;

  if (fields.length) {
    html += '<div class="info-card-fields">';
    for (const field of fields) {
      html += `
        <div class="info-card-field">
          <span class="field-label">${escapeHtml(field.label)}</span>
          <span class="field-value">${escapeHtml(String(field.value))}</span>
        </div>
      `;
    }
    html += "</div>";
  }

  if (actions.length) {
    html += '<div class="info-card-actions">';
    for (const action of actions) {
      html += `<button class="info-card-action" data-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`;
    }
    html += "</div>";
  }

  el.innerHTML = html;

  // Action handlers
  el.querySelectorAll(".info-card-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const actionId = btn.dataset.action;
      const action = actions.find((a) => a.id === actionId);
      if (action && typeof action.handler === "function") {
        action.handler(config, action);
      }
    });
  });

  return el;
}

/* ── Video Embed ── */
function createVideoEmbed(config) {
  const el = document.createElement("div");
  el.className = "ui-component video-embed";

  const url = config.url || "";
  const safeUrl = sanitizeEmbedUrl(url);

  if (!safeUrl) {
    el.innerHTML = `<div class="video-error">Invalid video URL</div>`;
    return el;
  }

  el.innerHTML = `
    <iframe
      src="${safeUrl}"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  `;

  return el;
}

/* ── Image Viewer ── */
function createImageViewer(config) {
  const el = document.createElement("div");
  el.className = "ui-component image-viewer";

  const images = config.images || [];
  const currentIndex = config.currentIndex || 0;

  if (!images.length) {
    el.innerHTML = `<div class="image-empty">No images</div>`;
    return el;
  }

  el.innerHTML = `
    <div class="image-stage">
      <img src="${escapeHtml(images[currentIndex])}" alt="" />
    </div>
    <div class="image-nav">
      <button class="image-prev">&lt;</button>
      <span class="image-counter">${currentIndex + 1} / ${images.length}</span>
      <button class="image-next">&gt;</button>
    </div>
  `;

  let idx = currentIndex;
  const img = el.querySelector("img");
  const counter = el.querySelector(".image-counter");

  el.querySelector(".image-prev")?.addEventListener("click", () => {
    idx = (idx - 1 + images.length) % images.length;
    img.src = images[idx];
    counter.textContent = `${idx + 1} / ${images.length}`;
  });

  el.querySelector(".image-next")?.addEventListener("click", () => {
    idx = (idx + 1) % images.length;
    img.src = images[idx];
    counter.textContent = `${idx + 1} / ${images.length}`;
  });

  return el;
}

/* ── Timeline Strip ── */
function createTimeline(config) {
  const el = document.createElement("div");
  el.className = "ui-component timeline-strip";

  const events = config.events || [];
  const title = config.title || "Timeline";

  let html = `<div class="timeline-title">${escapeHtml(title)}</div><div class="timeline-events">`;

  for (const event of events) {
    const time = event.time || "";
    const label = event.label || "";
    const severity = event.severity || "info";
    html += `
      <div class="timeline-event timeline-severity-${severity}">
        <div class="timeline-time">${escapeHtml(time)}</div>
        <div class="timeline-label">${escapeHtml(label)}</div>
      </div>
    `;
  }

  html += "</div>";
  el.innerHTML = html;

  return el;
}

/* ── Helpers ── */
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeEmbedUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const allowedHosts = [
      "youtube.com",
      "www.youtube.com",
      "youtu.be",
      "vimeo.com",
      "www.vimeo.com",
      "dailymotion.com",
      "www.dailymotion.com",
    ];
    if (allowedHosts.includes(parsed.hostname)) {
      return parsed.href;
    }
    // Allow iframe embeds from known sources
    if (parsed.hostname.endsWith(".youtube.com") || parsed.hostname.endsWith(".vimeo.com")) {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

function makeDraggable(element, handle) {
  if (!handle) return;

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  handle.style.cursor = "move";

  handle.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = element.offsetLeft;
    initialTop = element.offsetTop;
    element.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    element.style.left = `${initialLeft + dx}px`;
    element.style.top = `${initialTop + dy}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    element.style.transition = "";
  });
}

function makeResizable(element) {
  const resizer = document.createElement("div");
  resizer.className = "resizer";
  resizer.style.cssText = `
    position: absolute;
    bottom: 0;
    right: 0;
    width: 12px;
    height: 12px;
    cursor: se-resize;
    background: var(--accent-dim, #006622);
    border-radius: 0 0 4px 0;
  `;
  element.appendChild(resizer);

  let isResizing = false;
  let startX, startY, initialWidth, initialHeight;

  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    initialWidth = element.offsetWidth;
    initialHeight = element.offsetHeight;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const dw = e.clientX - startX;
    const dh = e.clientY - startY;
    element.style.width = `${Math.max(100, initialWidth + dw)}px`;
    element.style.height = `${Math.max(50, initialHeight + dh)}px`;
  });

  document.addEventListener("mouseup", () => {
    isResizing = false;
  });
}

/* ── Export ── */
const UIComponentFactories = {
  createGlobePopup,
  createAlertToast,
  createFloatingPanel,
  createBadge,
  createInfoCard,
  createVideoEmbed,
  createImageViewer,
  createTimeline,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = UIComponentFactories;
}
