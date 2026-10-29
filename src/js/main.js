const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const MIME_TYPES = {
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  gif: "image/gif",
};

const valueOrUndefined = (val, parseFn = (v) => v) =>
  val === "" ? undefined : parseFn(val);

const HTML_EXTENSIONS = ["html", "htm", "xhtml"];
const CHROME_PATH_KEY = "aetherChromePath";

/** An HTML file or web address (captured in Chrome), not a folder or ZIP of frames. */
function isHtmlInput(path) {
  const p = path.trim().toLowerCase();
  return p.startsWith("http://") || p.startsWith("https://")
    || HTML_EXTENSIONS.some((ext) => p.endsWith(`.${ext}`));
}

async function selectFile() {
  const path = await window.__TAURI__.dialog.open({
    multiple: false,
    directory: false
  });
  if (path) {
    document.getElementById('selectedPath').value = path;
    console.log("Selected file path:", path);
    onInputChanged();
  }
}

async function selectHtml() {
  const path = await window.__TAURI__.dialog.open({
    multiple: false,
    directory: false,
    filters: [{ name: "HTML", extensions: HTML_EXTENSIONS }],
  });
  if (path) {
    document.getElementById('selectedPath').value = path;
    onInputChanged();
  }
}

async function selectFolder() {
  const path = await window.__TAURI__.dialog.open({
    multiple: false,
    directory: true
  });
  if (path) {
    document.getElementById('selectedPath').value = path;
    console.log("Selected folder path:", path);
    onInputChanged();
  }
}

// ---------- HTML input ----------

/** Width, height and duration from the "HTML capture" fields. */
function captureValues() {
  return {
    width: parseInt(document.getElementById("captureWidth").value, 10),
    height: parseInt(document.getElementById("captureHeight").value, 10),
    duration: parseFloat(document.getElementById("captureDuration").value),
  };
}

function currentFps() {
  return parseFloat(document.getElementById("fps").value) || 30;
}

/** What's wrong with the capture fields, or null. */
function captureProblem({ width, height, duration }) {
  if (!(width > 0 && height > 0)) return "Size must be at least 1 × 1 px.";
  if (!(duration > 0)) return "Duration must be more than 0 seconds.";
  if (Math.round(duration * currentFps()) < 1) return "Duration is too short for one frame.";
  return null;
}

function updateCaptureHint() {
  const values = captureValues();
  const hint = document.getElementById("captureHint");
  const problem = captureProblem(values);
  hint.classList.toggle("warn", !!problem);
  hint.textContent = problem
    ?? `${Math.round(values.duration * currentFps())} frames at ${currentFps()} fps, captured in headless Chrome.`;
}

/** Show the HTML settings and live preview for an HTML input, hide them otherwise. */
async function onInputChanged() {
  const input = document.getElementById("selectedPath");
  const path = input.value.trim();
  if (editor.path && path !== editor.path && !(await okToDiscard())) {
    input.value = editor.path; // keep the file being edited
    return;
  }
  await loadEditor(path);
  const html = path !== "" && isHtmlInput(path);
  document.getElementById("htmlCapture").hidden = !html;
  if (html) {
    updateCaptureHint();
    showHtmlPreview(path);
  } else {
    hideHtmlPreview();
  }
}

/** Pick the preset that matches the size fields, else "Custom". */
function syncSizePreset() {
  const w = document.getElementById("captureWidth").value;
  const h = document.getElementById("captureHeight").value;
  const preset = document.getElementById("sizePreset");
  const match = [...preset.options].some((o) => o.value === `${w}x${h}`);
  preset.value = match ? `${w}x${h}` : "custom";
}

/** A preset was chosen: fill in its size. */
function applySizePreset() {
  const value = document.getElementById("sizePreset").value;
  if (value === "custom") return;
  const [w, h] = value.split("x");
  document.getElementById("captureWidth").value = w;
  document.getElementById("captureHeight").value = h;
  updateCaptureHint();
  fitHtmlPreview();
}

/**
 * convertFileSrc escapes the whole path into one URL segment
 * ("asset://localhost/%2FUsers%2Fme%2Fpage.html"), so the page's relative links
 * ("assets/style.css") resolve against the host and break. Turn the folders
 * back into real segments; only the first separator (the root) stays escaped.
 * The asset protocol decodes the path the same either way.
 */
function previewUrl(path) {
  const url = window.__TAURI__.core.convertFileSrc(path);
  const first = url.search(/%2F|%5C/i);
  if (first < 0) return url;
  const rest = first + 3;
  return url.slice(0, rest) + url.slice(rest).replace(/%2F|%5C/gi, "/");
}

async function showHtmlPreview(path) {
  const frame = document.getElementById("htmlFrame");
  let src = path;
  if (!/^https?:\/\//i.test(path)) {
    try {
      // Opens the asset protocol for this file's folder only (CSS, scripts, images).
      await invoke("allow_preview", { path });
    } catch (error) {
      updateAlertStatus(String(error), "warn");
      return;
    }
    src = previewUrl(path);
  }
  document.getElementById("resultArea").style.display = "none";
  document.getElementById("ghostPreview").style.display = "none";
  document.getElementById("htmlPreview").hidden = false;
  if (frame.dataset.src !== src) {
    frame.dataset.src = src;
    frame.src = src;
  }
  fitHtmlPreview();
}

function hideHtmlPreview() {
  const frame = document.getElementById("htmlFrame");
  document.getElementById("htmlPreview").hidden = true;
  document.getElementById("ghostPreview").style.display = "";
  frame.removeAttribute("src");
  frame.removeAttribute("srcdoc");
  delete frame.dataset.src;
}

/** Size the iframe to the capture size and scale it down to fit the panel. */
function fitHtmlPreview() {
  const { width, height } = captureValues();
  if (!(width > 0 && height > 0)) return;
  const frame = document.getElementById("htmlFrame");
  const stage = document.getElementById("htmlPreviewStage");
  const scale = Math.min(1, stage.clientWidth / width, stage.clientHeight / height);
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
  // The frame edge marks the captured area; keep it ~2px on screen at any scale.
  frame.style.outline = `${2 / scale}px dashed rgba(78, 78, 247, 0.75)`;
}

// ---------- Code editor (right panel, "Code" tab) ----------

/** The HTML file in the editor: its path, the text on disk, and whether it was edited. */
const editor = { path: null, saved: "", dirty: false };

const NEW_HTML_TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  /* A transparent page gives a transparent video (WebM, MOV, GIF). */
  html, body { margin: 0; height: 100%; background: transparent; }
  body { display: grid; place-items: center; font-family: system-ui, sans-serif; }

  .hello {
    font-size: 12vmin;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0 2vmin #4e4ef7;
    animation: pop 2s ease-in-out infinite alternate;
  }
  @keyframes pop {
    from { transform: scale(0.8); opacity: 0.3; }
    to   { transform: scale(1);   opacity: 1; }
  }
</style>
</head>
<body>
  <div class="hello">Hello Æther</div>
</body>
</html>
`;

function showView(view) {
  const code = view === "code";
  document.getElementById("tabPreview").classList.toggle("active", !code);
  document.getElementById("tabCode").classList.toggle("active", code);
  document.getElementById("tabPreview").setAttribute("aria-pressed", String(!code));
  document.getElementById("tabCode").setAttribute("aria-pressed", String(code));
  document.getElementById("viewTitle").innerHTML = code
    ? '<svg class="icon" aria-hidden="true"><use href="#i-code"/></svg>Code'
    : '<svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>Preview';
  document.getElementById("codePane").hidden = !code;
  document.querySelector("#rightPanel .result-wrapper").hidden = code;
  if (code) document.getElementById("codeEditor").focus();
  else fitHtmlPreview();
}

function updateEditorUi() {
  const has = editor.path !== null;
  document.getElementById("codeEmpty").hidden = has;
  document.getElementById("codeEditorWrap").hidden = !has;
  document.getElementById("codeFile").textContent = has ? editor.path.split(/[\\/]/).pop() : "";
  document.getElementById("codeFile").title = editor.path ?? "";
  document.getElementById("codeDirty").hidden = !editor.dirty;
  document.getElementById("saveHtmlBtn").disabled = !editor.dirty;
}

/** Load a local HTML file into the editor (or clear it for anything else). */
async function loadEditor(path) {
  const local = path && isHtmlInput(path) && !/^https?:\/\//i.test(path);
  if (!local) {
    Object.assign(editor, { path: null, saved: "", dirty: false });
    document.getElementById("codeEditor").value = "";
    updateEditorUi();
    return;
  }
  if (editor.path === path) return;
  try {
    const text = await invoke("read_html_file", { path });
    Object.assign(editor, { path, saved: text, dirty: false });
    document.getElementById("codeEditor").value = text;
  } catch (error) {
    Object.assign(editor, { path: null, saved: "", dirty: false });
    updateAlertStatus(String(error), "warn");
  }
  updateEditorUi();
}

/** Unsaved edits may be thrown away? Asks only when there are some. */
async function okToDiscard() {
  if (!editor.dirty) return true;
  return window.__TAURI__.dialog.confirm(
    "The HTML has unsaved changes. Discard them?",
    { title: "Unsaved changes", kind: "warning", okLabel: "Discard", cancelLabel: "Keep editing" },
  );
}

async function saveEditor() {
  if (!editor.path) return false;
  const text = document.getElementById("codeEditor").value;
  try {
    await invoke("write_html_file", { path: editor.path, contents: text });
  } catch (error) {
    updateAlertStatus(String(error), "error");
    return false;
  }
  Object.assign(editor, { saved: text, dirty: false });
  updateEditorUi();
  reloadHtmlPreview();
  updateMainStatus("💾 Saved");
  return true;
}

/** "New HTML": pick where to save it, write the template, and open it. */
async function newHtml() {
  if (!(await okToDiscard())) return;
  const path = await window.__TAURI__.dialog.save({
    defaultPath: "animation.html",
    filters: [{ name: "HTML", extensions: HTML_EXTENSIONS }],
  });
  if (!path) return;
  try {
    await invoke("write_html_file", { path, contents: NEW_HTML_TEMPLATE });
  } catch (error) {
    updateAlertStatus(String(error), "error");
    return;
  }
  editor.dirty = false; // the old edits were discarded above
  document.getElementById("selectedPath").value = path;
  await onInputChanged();
  showView("code");
}

/** The editor's text as the preview page, with <base> so relative links still work. */
function editorSrcdoc() {
  const url = previewUrl(editor.path);
  const base = `<base href="${url.slice(0, url.lastIndexOf("/") + 1)}">`;
  const text = document.getElementById("codeEditor").value;
  const head = text.match(/<head[^>]*>/i);
  return head ? text.replace(head[0], head[0] + base) : base + text;
}

let previewTimer;
function onEditorInput() {
  editor.dirty = document.getElementById("codeEditor").value !== editor.saved;
  updateEditorUi();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const frame = document.getElementById("htmlFrame");
    if (editor.dirty) frame.srcdoc = editorSrcdoc();
    else reloadHtmlPreview();
  }, 500);
}

/** Show the file on disk again (after saving, or when the edits were undone). */
function reloadHtmlPreview() {
  const frame = document.getElementById("htmlFrame");
  frame.removeAttribute("srcdoc");
  if (frame.dataset.src) frame.src = frame.dataset.src;
}

/** Tab indents instead of leaving the editor. */
function onEditorKeydown(e) {
  if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  const ta = e.target;
  ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end");
  onEditorInput();
}

// ---------- Bug reports and feature requests ----------

/** The last few errors, sent along with bug reports (newest last). */
const recentErrors = [];
let lastRenderError = null;

function recordError(source, message) {
  recentErrors.push({ at: new Date().toISOString(), source, message: String(message).slice(0, 2000) });
  if (recentErrors.length > 10) recentErrors.shift();
}

window.addEventListener("error", (e) => recordError("ui", e.message));
window.addEventListener("unhandledrejection", (e) => recordError("ui", e.reason));

let feedbackKind = "bug";

function setFeedbackKind(kind) {
  feedbackKind = kind;
  const bug = kind === "bug";
  document.getElementById("feedbackBugTab").classList.toggle("active", bug);
  document.getElementById("feedbackFeatureTab").classList.toggle("active", !bug);
  document.getElementById("feedbackTitle").textContent = bug ? "Bug report" : "Feature request";
  document.getElementById("feedbackSubtitle").textContent = bug
    ? "What went wrong? Diagnostics help me fix it faster."
    : "What would make Aether Renderer better for you?";
  document.getElementById("feedbackMessage").placeholder = bug
    ? "Describe what happened, and what you expected..."
    : "Describe the feature you'd like...";
  // Diagnostics matter for bugs; for ideas they're just noise.
  document.getElementById("feedbackDiagnostics").checked = bug;
  updateFeedbackPreview();
}

/** Versions, OS, tools and the current settings: no file contents. */
async function collectDiagnostics() {
  let about = {};
  try {
    about = await invoke("about_info", {
      chrome: document.getElementById("chromePath").value.trim() || null,
    });
  } catch {}
  const input = document.getElementById("selectedPath").value.trim();
  const kind = !input ? "none"
    : /^https?:\/\//i.test(input) ? "url"
    : isHtmlInput(input) ? "html"
    : input.toLowerCase().endsWith(".zip") ? "zip" : "folder";
  return {
    app: { gui: about.version, core: about.core, capture: about.capture },
    tools: { ffmpeg: about.ffmpeg ?? "not found", chrome: about.chrome ?? "not found" },
    os: navigator.userAgent,
    settings: {
      input: kind,
      format: currentFormat(),
      fps: currentFps(),
      background: selectedBackground() ?? "transparent",
      fade_in: document.getElementById("fade_in").value || undefined,
      fade_out: document.getElementById("fade_out").value || undefined,
      capture: kind === "html" || kind === "url" ? captureValues() : undefined,
    },
    recentErrors,
  };
}

let feedbackDiagnostics = null;

async function updateFeedbackPreview() {
  const include = document.getElementById("feedbackDiagnostics").checked;
  const pre = document.getElementById("feedbackPreview");
  if (!include) {
    pre.textContent = "Only your message (and email, if you wrote one), the app version and OS.";
    return;
  }
  feedbackDiagnostics ??= await collectDiagnostics();
  pre.textContent = JSON.stringify(feedbackDiagnostics, null, 2);
}

/** Open the Feedback window; `message` pre-fills it (e.g. a render error). */
async function openFeedback(kind = "bug", message = "") {
  document.querySelector(".drawer").classList.remove("open");
  closeAbout();
  feedbackDiagnostics = null; // collect fresh each time
  document.getElementById("feedbackStatus").textContent = "";
  document.getElementById("feedbackSend").disabled = false;
  if (message) document.getElementById("feedbackMessage").value = message;
  document.getElementById("feedbackModal").hidden = false;
  setFeedbackKind(kind);
  const box = document.getElementById("feedbackMessage");
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}

function closeFeedback() {
  document.getElementById("feedbackModal").hidden = true;
}

async function sendFeedback(e) {
  e.preventDefault();
  const status = document.getElementById("feedbackStatus");
  const send = document.getElementById("feedbackSend");
  const message = document.getElementById("feedbackMessage").value.trim();
  if (message.length < 5) {
    status.textContent = "Please write a little more.";
    return;
  }
  send.disabled = true;
  status.textContent = "Sending…";
  try {
    const include = document.getElementById("feedbackDiagnostics").checked;
    await invoke("send_feedback", {
      feedback: {
        kind: feedbackKind,
        email: document.getElementById("feedbackEmail").value.trim() || null,
        message,
        diagnostics: include ? (feedbackDiagnostics ?? await collectDiagnostics()) : null,
        user_agent: navigator.userAgent,
        website: document.getElementById("feedbackWebsite").value,
      },
    });
    status.textContent = "Sent. Thank you ❤️";
    document.getElementById("feedbackMessage").value = "";
    setTimeout(closeFeedback, 900);
  } catch (error) {
    status.textContent = String(error);
    send.disabled = false;
  }
}

// ---------- Drag and drop ----------

/** What a drop means as input: PNG frames dropped one by one mean their folder. */
function inputFromDrop(paths) {
  const allPngs = paths.every((p) => p.toLowerCase().endsWith(".png"));
  if (allPngs) return paths[0].replace(/[\\/][^\\/]+$/, "");
  return paths[0];
}

function setupDragDrop() {
  const webview = window.__TAURI__.webview?.getCurrentWebview?.();
  if (!webview) return;
  const overlay = document.getElementById("dropOverlay");
  webview.onDragDropEvent(async (event) => {
    const { type, paths } = event.payload;
    if (type === "enter" || type === "over") {
      overlay.hidden = false;
    } else if (type === "leave") {
      overlay.hidden = true;
    } else if (type === "drop") {
      overlay.hidden = true;
      if (!paths?.length) return;
      const input = inputFromDrop(paths);
      if (paths.length > 1 && input === paths[0]) {
        updateAlertStatus("Several files dropped: using the first one.", "warn");
      }
      document.getElementById("selectedPath").value = input;
      await onInputChanged();
    }
  });
}

// ---------- Chrome for HTML capture (Settings) ----------

async function detectChrome() {
  const explicit = document.getElementById("chromePath").value.trim();
  const status = document.getElementById("chromeStatus");
  const found = await invoke("detect_chrome", { explicit: explicit || null });
  status.classList.toggle("ok", !!found);
  status.classList.toggle("warn", !found);
  if (found) {
    status.textContent = `✅ Using ${found}`;
  } else if (explicit) {
    status.textContent = "⚠️ No chrome-headless-shell at that path.";
  } else {
    status.textContent = "⚠️ Not found. Install it with:";
    const cmd = document.createElement("code");
    cmd.textContent = "npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer";
    status.append(cmd);
  }
  return found;
}

async function browseChrome() {
  const path = await window.__TAURI__.dialog.open({ multiple: false, directory: false });
  if (path) {
    document.getElementById("chromePath").value = path;
    saveChromePath();
    detectChrome();
  }
}

function saveChromePath() {
  localStorage.setItem(CHROME_PATH_KEY, document.getElementById("chromePath").value.trim());
}

function showStatus(message, type = "success") {
  const statusBar = document.getElementById("status-bar-text");
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

// ---------- Background color ----------

/** The background to send to the renderer: a hex color, or undefined for transparent. */
function selectedBackground() {
  if (document.getElementById("bgTransparent").checked) return undefined;
  return document.getElementById("bgColor").value;
}

/** Enable the color picker and explain what the choice means for the chosen format. */
function updateBackgroundUi() {
  const transparent = document.getElementById("bgTransparent").checked;
  const color = document.getElementById("bgColor");
  const format = currentFormat();
  color.disabled = transparent;
  document.getElementById("bgColorValue").textContent = transparent ? "transparent" : color.value;

  const hint = document.getElementById("bgHint");
  hint.classList.remove("warn");
  if (transparent && format === "mp4") {
    hint.textContent = "⚠️ MP4 can't be transparent: transparent areas become black. Pick the color of the page or video it will sit on.";
    hint.classList.add("warn");
  } else if (!transparent) {
    hint.textContent = `Transparent areas are filled with ${color.value}; fades go to this color.`;
  } else {
    hint.textContent = "";
  }
}

const FORMAT_EXT = /\.(webm|mp4|mov|gif)$/i;

/** Format picked -> give the output file that extension, so the two never disagree. */
function syncOutputExtension() {
  const out = document.getElementById("outputPath");
  const name = out.value.trim();
  if (!name) return;
  const format = document.getElementById("format").value || "webm";
  const known = name.match(FORMAT_EXT);
  if (known) {
    out.value = name.slice(0, -known[1].length) + format;
  } else if (!/\.[^./\\]+$/.test(name)) {
    out.value = `${name}.${format}`; // no extension yet
  }
}

/** Extension typed in the output path -> pick that format in the menu. */
function syncFormatFromOutput() {
  const known = document.getElementById("outputPath").value.trim().match(FORMAT_EXT);
  if (known) document.getElementById("format").value = known[1].toLowerCase();
  updateBackgroundUi();
}

/** The chosen format, or the one implied by the output file name, else webm. */
function currentFormat() {
  const chosen = document.getElementById("format").value;
  if (chosen) return chosen;
  const ext = document.getElementById("outputPath").value.split(".").pop().toLowerCase();
  return MIME_TYPES[ext] ? ext : "webm";
}

// ---------- Progress ----------

function showProgress(percent, frame, total) {
  const bar = document.getElementById("statusProgress");
  bar.hidden = false;
  document.getElementById("statusProgressFill").style.width = `${percent}%`;
  updateMainStatus(`Rendering ${Math.round(percent)}% (${frame}/${total} frames)`);
}

function hideProgress() {
  document.getElementById("statusProgress").hidden = true;
  document.getElementById("statusProgressFill").style.width = "0%";
}

// ---------- Render ----------

function beginRunRender() {
  const html = isHtmlInput(document.getElementById('selectedPath').value);
  startStatusSpinner(html ? "Capturing in Chrome and encoding" : "Rendering with FFmpeg");
  runRender();
}

async function runRender() {
  const inputPath = document.getElementById('selectedPath').value.trim();
  if (!inputPath) {
    updateAlertStatus("Input and output paths must be specified.", "error");
    stopStatusSpinner("Ready to render!");
    return;
  }
  const html = isHtmlInput(inputPath);
  if (html && editor.dirty && editor.path === inputPath) {
    const save = await window.__TAURI__.dialog.confirm(
      "The HTML has unsaved changes, and the render uses the saved file. Save first?",
      { title: "Unsaved changes", kind: "warning", okLabel: "Save and render", cancelLabel: "Cancel" },
    );
    if (!save || !(await saveEditor())) {
      stopStatusSpinner("Ready to render!");
      return;
    }
  }
  const capture = html ? captureValues() : undefined;
  const problem = html ? captureProblem(capture) : null;
  if (problem) {
    updateAlertStatus(problem, "error");
    stopStatusSpinner("Ready to render!");
    return;
  }
  syncOutputExtension();
  if (!document.getElementById('outputPath').value)
    document.getElementById('outputPath').value = `output.${currentFormat()}`;
  const outputPath = document.getElementById('outputPath').value;
  const fps = document.getElementById('fps').value;
  const format = document.getElementById('format').value;
  const fadeIn = document.getElementById('fade_in').value;
  const fadeOut = document.getElementById('fade_out').value;
  const bitrate = document.getElementById('bitrate').value;
  const crf = document.getElementById('crf').value;
  const values = {
    input: inputPath,
    output: outputPath,
    fps: valueOrUndefined(fps, parseFloat),
    format: valueOrUndefined(format),
    fade_in: valueOrUndefined(fadeIn, parseFloat),
    fade_out: valueOrUndefined(fadeOut, parseFloat),
    bitrate: valueOrUndefined(bitrate),
    crf: valueOrUndefined(crf, parseInt),
    preview: document.getElementById('preview').checked || undefined,
    background: selectedBackground(),
    capture,
    chrome: html ? (document.getElementById('chromePath').value.trim() || undefined) : undefined,
  };
  if (document.getElementById('saveDefaults').checked) {
    saveDefaultsToLocalStorage();
  }

  const renderBtn = document.getElementById('renderBtn');
  renderBtn.disabled = true;
  updateAlertStatus("", "success");
  document.getElementById("reportErrorBtn").hidden = true;
  showProgress(0, 0, "?");

  try {
    const result = await invoke('run_renderer', { values });
    hideHtmlPreview();
    showView("preview");
    document.getElementById('resultArea').style.display = 'block';
    document.getElementById('resultPath').textContent = result.output;
    await showPreview(result.output);
    if (result.notes && result.notes.includes("ℹ️")) {
      updateAlertStatus(result.notes.split("\n").find((l) => l.includes("ℹ️")), "warn");
    } else if (result.warnings.length) {
      updateAlertStatus(result.warnings.join(" "), "warn");
    }
    stopStatusSpinner(`✅ Render done! ${result.frames ?? ""} frames`);
  } catch (error) {
    updateAlertStatus(`❌ Render failed: ${error}`, "error");
    recordError("render", error);
    lastRenderError = String(error);
    document.getElementById("reportErrorBtn").hidden = false;
    stopStatusSpinner("Render failed");
  } finally {
    hideProgress();
    renderBtn.disabled = false;
  }
}

async function showPreview(outputPath) {
  const ext = outputPath.split(".").pop().toLowerCase();
  const rawBytes = await invoke('get_rendered_file', { path: outputPath });
  const blob = new Blob([new Uint8Array(rawBytes)], { type: MIME_TYPES[ext] || "video/webm" });
  const fileURL = URL.createObjectURL(blob);

  const video = document.getElementById('previewVideo');
  const image = document.getElementById('previewImage');
  if (ext === "gif") {
    video.pause();
    video.style.display = 'none';
    image.src = fileURL;
    image.style.display = 'block';
  } else {
    image.style.display = 'none';
    // e.g. ProRes .mov can't play in the webview; the file itself is fine.
    video.onerror = () =>
      updateAlertStatus("Preview not supported for this format here — use Open File.", "warn");
    video.src = fileURL;
    video.style.display = 'block';
    video.play().catch(() => {});
  }
}

function saveDefaultsToLocalStorage() {
  const settings = {
    fps: document.getElementById("fps").value,
    format: document.getElementById("format").value,
    fade_in: document.getElementById("fade_in").value,
    fade_out: document.getElementById("fade_out").value,
    bitrate: document.getElementById("bitrate").value,
    crf: document.getElementById("crf").value,
    bgTransparent: document.getElementById("bgTransparent").checked,
    bgColor: document.getElementById("bgColor").value,
    captureWidth: document.getElementById("captureWidth").value,
    captureHeight: document.getElementById("captureHeight").value,
    captureDuration: document.getElementById("captureDuration").value,
    darkMode: document.body.classList.contains("dark-mode"),
  };
  localStorage.setItem("aetherDefaults", JSON.stringify(settings));
}

function loadDefaultsFromLocalStorage() {
  const stored = JSON.parse(localStorage.getItem("aetherDefaults") || "{}");
  if (stored.fps) document.getElementById("fps").value = stored.fps;
  if (stored.format) document.getElementById("format").value = stored.format;
  if (stored.fade_in) document.getElementById("fade_in").value = stored.fade_in;
  if (stored.fade_out) document.getElementById("fade_out").value = stored.fade_out;
  if (stored.bitrate) document.getElementById("bitrate").value = stored.bitrate;
  if (stored.crf) document.getElementById("crf").value = stored.crf;
  if (stored.bgTransparent !== undefined) document.getElementById("bgTransparent").checked = stored.bgTransparent;
  if (stored.bgColor) document.getElementById("bgColor").value = stored.bgColor;
  if (stored.captureWidth) document.getElementById("captureWidth").value = stored.captureWidth;
  if (stored.captureHeight) document.getElementById("captureHeight").value = stored.captureHeight;
  if (stored.captureDuration) document.getElementById("captureDuration").value = stored.captureDuration;
  syncSizePreset();
  document.getElementById("chromePath").value = localStorage.getItem(CHROME_PATH_KEY) || "";
  if (stored.darkMode !== undefined) {
    document.body.classList.toggle("dark-mode", stored.darkMode);
    document.getElementById("darkModeToggle").checked = stored.darkMode;
  }
}

function updateDarkModeSetting(enabled) {
  const stored = JSON.parse(localStorage.getItem("aetherDefaults") || "{}");
  stored.darkMode = enabled;
  localStorage.setItem("aetherDefaults", JSON.stringify(stored));
}

// Initialize the status spinner and event listeners
window.addEventListener("DOMContentLoaded", () => {
  startStatusSpinner("Loading...");
  
  document.getElementById('selectFileBtn').addEventListener('click', selectFile);
  document.getElementById('selectFolderBtn').addEventListener('click', selectFolder);
  document.getElementById('selectHtmlBtn').addEventListener('click', selectHtml);
  document.getElementById('selectedPath').addEventListener('change', onInputChanged);
  for (const id of ['captureWidth', 'captureHeight', 'captureDuration', 'fps']) {
    document.getElementById(id).addEventListener('input', () => {
      updateCaptureHint();
      fitHtmlPreview();
    });
  }
  document.getElementById('reportBugBtn').addEventListener('click', () => openFeedback("bug"));
  document.getElementById('requestFeatureBtn').addEventListener('click', () => openFeedback("feature"));
  document.getElementById('reportErrorBtn').addEventListener('click', () =>
    openFeedback("bug", `The render failed with:\n${lastRenderError}\n\nWhat I was doing: `));
  document.getElementById('feedbackBugTab').addEventListener('click', () => setFeedbackKind("bug"));
  document.getElementById('feedbackFeatureTab').addEventListener('click', () => setFeedbackKind("feature"));
  document.getElementById('feedbackDiagnostics').addEventListener('change', updateFeedbackPreview);
  document.getElementById('feedbackForm').addEventListener('submit', sendFeedback);
  document.querySelectorAll('[data-close-feedback]').forEach((el) =>
    el.addEventListener('click', closeFeedback));
  document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") closeFeedback();
  });
  // "Report a Bug…" / "Request a Feature…" in the macOS Help menu
  listen('open-feedback', (event) => openFeedback(event.payload));
  document.getElementById('tabPreview').addEventListener('click', () => showView("preview"));
  document.getElementById('tabCode').addEventListener('click', () => showView("code"));
  document.getElementById('newHtmlBtn').addEventListener('click', newHtml);
  document.getElementById('newHtmlEmptyBtn').addEventListener('click', newHtml);
  document.getElementById('saveHtmlBtn').addEventListener('click', saveEditor);
  const codeEditor = document.getElementById('codeEditor');
  codeEditor.addEventListener('input', onEditorInput);
  codeEditor.addEventListener('keydown', onEditorKeydown);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && editor.path) {
      e.preventDefault();
      saveEditor();
    }
  });
  document.getElementById('captureWidth').addEventListener('input', syncSizePreset);
  document.getElementById('captureHeight').addEventListener('input', syncSizePreset);
  document.getElementById('sizePreset').addEventListener('change', applySizePreset);
  window.addEventListener('resize', fitHtmlPreview);
  document.getElementById('browseChromeBtn').addEventListener('click', browseChrome);
  document.getElementById('detectChromeBtn').addEventListener('click', detectChrome);
  document.getElementById('chromePath').addEventListener('change', () => {
    saveChromePath();
    detectChrome();
  });
  document.getElementById('renderBtn').addEventListener("click", beginRunRender);

  document.getElementById('revealBtn').addEventListener('click', () => {
    const path = document.getElementById('resultPath').textContent;
    window.__TAURI__.opener.revealItemInDir(path);
  });

  document.getElementById('openBtn').addEventListener('click', async () => {
    const path = document.getElementById('resultPath').textContent;
    await invoke('open_file', { path: path });
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('resultArea').style.display = 'none';
    document.getElementById('resultPath').textContent = '';
    document.getElementById('selectedPath').value = '';
    document.getElementById('outputPath').value = '';
    document.getElementById('fps').value = '';
    document.getElementById('format').value = '';
    document.getElementById('fade_in').value = '';
    document.getElementById('fade_out').value = '';
    document.getElementById('bitrate').value = '';
    document.getElementById('crf').value = '';
    document.getElementById('preview').checked = false;
    document.getElementById('bgTransparent').checked = true;
    document.getElementById('captureWidth').value = '1920';
    document.getElementById('captureHeight').value = '1080';
    document.getElementById('captureDuration').value = '4';
    syncSizePreset();
    onInputChanged();
    updateBackgroundUi();
    updateAlertStatus("Form reset.", "success");
  });

  document.getElementById('darkModeToggle').addEventListener('change', (event) => {
    const isDarkMode = event.target.checked;
    document.body.classList.toggle('dark-mode', isDarkMode);
    //window.__TAURI__.settings.set('dark_mode', isDarkMode);
    updateDarkModeSetting(isDarkMode); // 🧠 save right away
    updateAlertStatus(`Dark mode ${isDarkMode ? 'enabled' : 'disabled'}.`, "success");
    document.querySelector(".drawer").classList.remove("open"); // Close drawer on toggle
  });

  document.getElementById("toggleAdvancedBtn").addEventListener("click", () => {
    document.getElementById("basicSettings").style.display = "none";
    document.getElementById("advancedSettings").style.display = "block";
  });

  document.getElementById("backToBasicBtn").addEventListener("click", () => {
    document.getElementById("advancedSettings").style.display = "none";
    document.getElementById("basicSettings").style.display = "block";
  });

  document.getElementById('bgTransparent').addEventListener('change', updateBackgroundUi);
  document.getElementById('bgColor').addEventListener('input', updateBackgroundUi);
  document.getElementById('format').addEventListener('change', () => {
    syncOutputExtension();
    updateBackgroundUi();
  });
  document.getElementById('outputPath').addEventListener('change', syncFormatFromOutput);
  document.getElementById('outputPath').addEventListener('input', updateBackgroundUi);

  // Long errors are cut off in the status bar: click to copy the whole text.
  const alertEl = document.getElementById("status-alert");
  alertEl.addEventListener("click", async () => {
    const text = alertEl.title || alertEl.textContent;
    if (!text.trim() || text === ".") return;
    try {
      await navigator.clipboard.writeText(text);
      updateMainStatus("📋 Message copied");
    } catch {}
  });

  listen('render-progress', (event) => {
    const p = event.payload;
    showProgress(p.percent, p.frame, p.total_frames);
  });

  loadDefaultsFromLocalStorage();
  setupDragDrop();
  updateBackgroundUi();
  detectChrome();

  setTimeout(() => {
    stopStatusSpinner("Ready to render!");
  }, 100);
});

// ---------- About ----------

async function openAbout() {
  document.querySelector(".drawer").classList.remove("open");
  document.getElementById("aboutModal").hidden = false;
  const set = (id, text) => (document.getElementById(id).textContent = text);
  try {
    const chrome = document.getElementById("chromePath").value.trim() || null;
    const info = await invoke("about_info", { chrome });
    set("aboutVersion", info.version);
    set("aboutCore", `aether-renderer-core ${info.core}`);
    set("aboutCapture", `aether-renderer-capture ${info.capture}`);
    set("aboutFfmpeg", info.ffmpeg ?? "⚠️ not found");
    set("aboutChrome", info.chrome ?? "not found (only needed for HTML)");
  } catch (error) {
    set("aboutVersion", `? (${error})`);
  }
}

function closeAbout() {
  document.getElementById("aboutModal").hidden = true;
}

/** The facts as plain text, for bug reports. */
function aboutText() {
  const get = (id) => document.getElementById(id).textContent;
  return [
    `Aether Renderer GUI ${get("aboutVersion")}`,
    get("aboutCore"),
    get("aboutCapture"),
    `FFmpeg: ${get("aboutFfmpeg")}`,
    `Chrome: ${get("aboutChrome")}`,
    `OS: ${navigator.userAgent}`,
  ].join("\n");
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("aboutBtn").addEventListener("click", openAbout);
  document.querySelectorAll("[data-close-about]").forEach((el) =>
    el.addEventListener("click", closeAbout));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAbout();
  });
  document.querySelectorAll("#aboutModal [data-url]").forEach((btn) =>
    btn.addEventListener("click", () => window.__TAURI__.opener.openUrl(btn.dataset.url)));
  const copyBtn = document.getElementById("copyAboutBtn");
  copyBtn.addEventListener("click", async () => {
    const label = copyBtn.querySelector(".btn-label");
    const icon = copyBtn.querySelector("use");
    try {
      await navigator.clipboard.writeText(aboutText());
      label.textContent = "Copied";
      icon.setAttribute("href", "#i-check");
    } catch {
      label.textContent = "Couldn't copy";
    }
    setTimeout(() => {
      label.textContent = "Copy info";
      icon.setAttribute("href", "#i-copy");
    }, 1500);
  });
  // "About Aether Renderer…" in the macOS menu
  listen("show-about", openAbout);
});

// Drawer toggle logic
document.addEventListener("DOMContentLoaded", () => {
  const drawer = document.querySelector(".drawer");
  const toggleDrawerBtn = document.getElementById("toggleDrawerBtn");

  if (drawer && toggleDrawerBtn) {
    toggleDrawerBtn.addEventListener("click", () => {
      drawer.classList.toggle("open");
    });
  }
});