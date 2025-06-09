//import { open } from '@tauri-apps/plugin-dialog';
//import { open } from '@tauri-apps/api/dialog';
const { invoke } = window.__TAURI__.core;

const valueOrUndefined = (val, parseFn = (v) => v) =>
  val === "" ? undefined : parseFn(val);

async function selectFile() {
  //console.log("Select file button clicked");
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
  //console.log("Select folder button clicked");
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
  const statusBar = document.getElementById("status");
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

async function runRender() {
  //console.log("Running render...");
  const inputPath = document.getElementById('selectedPath').value;
  const outputPath = document.getElementById('outputPath').value;
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
    document.getElementById('resultArea').style.display = 'block';
    document.getElementById('resultPath').textContent = outputPath;
    /*
    const URL = window.URL || window.webkitURL
    const response = await fetch(`file://${outputPath}`);
    const blob = await response.blob();
    const fileURL = URL.createObjectURL(blob)
    document.getElementById('previewVideo').src = fileURL; // `file://${outputPath}`;
    */
  } catch (error) {
    showStatus(`❌ Render failed: ${error}`, "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById('selectFileBtn').addEventListener('click', selectFile);
  document.getElementById('selectFolderBtn').addEventListener('click', selectFolder);
  document.getElementById('renderBtn').addEventListener("click", runRender);

  document.getElementById('revealBtn').addEventListener('click', () => {
    const path = document.getElementById('resultPath').textContent;
    window.__TAURI__.opener.revealItemInDir(path);
  });

  document.getElementById('openBtn').addEventListener('click', async () => {
    const path = document.getElementById('resultPath').textContent;
    //console.log(" window.__TAURI__",  window.__TAURI__)
    window.__TAURI__.opener.openPath(path);
    await window.__TAURI__.shell.open(`file://${path}`);
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
    showStatus("Form reset.", "success");
  });
});
