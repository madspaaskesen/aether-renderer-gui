const { invoke } = window.__TAURI__.core;

const valueOrUndefined = (val, parseFn = (v) => v) =>
  val === "" ? undefined : parseFn(val);

async function selectFile() {
  const path = await window.__TAURI__.dialog.open({
    multiple: false,
    directory: false
  });
  if (path) {
    document.getElementById('selectedPath').value = path;
    console.log("Selected file path:", path);
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
  }
}

function showStatus(message, type = "success") {
  const statusBar = document.getElementById("status-bar-text");
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

function beginRunRender() {
  startStatusSpinner("Rendering with FFmpeg");
  startRunRender();
}

function startRunRender() {
  window.setTimeout(async() => {
    await runRender();
  }, 500);  
}

async function runRender() {
  const inputPath = document.getElementById('selectedPath').value;
  if (!inputPath) {
    updateAlertStatus("Input and output paths must be specified.", "error");
    return;
  }
  if (!document.getElementById('outputPath').value)
    document.getElementById('outputPath').value = "output.webm";
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
  };
  if (document.getElementById('saveDefaults').checked) {
    saveDefaultsToLocalStorage();
  }
  
  try {
    await new Promise(r => setTimeout(r, 100));
    const result = await invoke('run_renderer', { values });
    //showStatus(`✅ Render completed: ${outputPath}`, "success");
    document.getElementById('resultArea').style.display = 'block';
    document.getElementById('resultPath').textContent = outputPath;
    const rawBytes = await invoke('get_rendered_file', { path: outputPath });
    const blob = new Blob([new Uint8Array(rawBytes)], { type: 'video/webm' });
    // 🎥 Preview it
    const fileURL = URL.createObjectURL(blob);
    //console.log("File URL created:", fileURL);
    const preview = document.getElementById('previewVideo');
    preview.src = fileURL;
    preview.style.display = 'block';
    preview.play();
  } catch (error) {
    updateAlertStatus(`❌ Render failed: ${error}`, "error");
  }
  stopStatusSpinner("✅ Render Done!");
}

function saveDefaultsToLocalStorage() {
  const settings = {
    fps: document.getElementById("fps").value,
    format: document.getElementById("format").value,
    fade_in: document.getElementById("fade_in").value,
    fade_out: document.getElementById("fade_out").value,
    bitrate: document.getElementById("bitrate").value,
    crf: document.getElementById("crf").value,
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

  loadDefaultsFromLocalStorage();

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