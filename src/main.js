const { invoke } = window.__TAURI__.core;

async function runRender() {
  //console.log("Running render...");
  const inputPath = document.getElementById('input').value;
  const outputPath = document.getElementById('output').value;
  if (!inputPath || !outputPath) {
    console.error("Input and output paths must be specified.");
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
    fps: fps ? parseFloat(fps) : null,
    format: format ? format : 'webm',
    fade_in: fadeIn ? parseFloat(fadeIn) : null,
    fade_out: fadeOut ? parseFloat(fadeOut) : null,
    bitrate: bitrate ? bitrate : null,
    crf: crf ? parseInt(crf) : null,
    preview: document.getElementById('preview').checked ? true : null,
  };
  try {
    console.log("Values to send:", values);
    const runRenderResult = await invoke('run_renderer', { values });
    console.log("Render completed successfully", runRenderResult);
  } catch (error) {
    console.error("Render failed:", error);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#configButton").addEventListener("click", (e) => {
    console.log("Config button clicked");
    runRender();
  });
});
