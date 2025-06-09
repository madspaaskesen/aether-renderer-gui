const { invoke } = window.__TAURI__.core;

function showStatus(message, type = "success") {
  const statusBar = document.getElementById("status");
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

async function runRender() {
  //console.log("Running render...");
  const inputPath = document.getElementById('input').value;
  const outputPath = document.getElementById('output').value;
  if (!inputPath || !outputPath) {
    showStatus("Input and output paths must be specified.", "error");
    return;
  }
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
  try {
    //console.log("Values to send:", values);
    const result = await invoke('run_renderer', { values });
    showStatus(`✅ Render completed: ${outputPath}`, "success");
  } catch (error) {
    showStatus(`❌ Render failed: ${error}`, "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#configButton").addEventListener("click", (e) => {
    //console.log("Config button clicked");
    runRender();
  });
});
