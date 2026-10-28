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
function onInputChanged() {
  const path = document.getElementById("selectedPath").value.trim();
  const html = path !== "" && isHtmlInput(path);
  document.getElementById("htmlCapture").hidden = !html;
  if (html) {
    updateCaptureHint();
    showHtmlPreview(path);
  } else {
    hideHtmlPreview();
  }
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
    src = window.__TAURI__.core.convertFileSrc(path);
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
  const capture = html ? captureValues() : undefined;
  const problem = html ? captureProblem(capture) : null;
  if (problem) {
    updateAlertStatus(problem, "error");
    stopStatusSpinner("Ready to render!");
    return;
  }
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
  showProgress(0, 0, "?");

  try {
    const result = await invoke('run_renderer', { values });
    hideHtmlPreview();
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
  document.getElementById('format').addEventListener('change', updateBackgroundUi);
  document.getElementById('outputPath').addEventListener('input', updateBackgroundUi);

  listen('render-progress', (event) => {
    const p = event.payload;
    showProgress(p.percent, p.frame, p.total_frames);
  });

  loadDefaultsFromLocalStorage();
  updateBackgroundUi();
  detectChrome();

  setTimeout(() => {
    stopStatusSpinner("Ready to render!");
  }, 100);
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