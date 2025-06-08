const { invoke } = window.__TAURI__.core;

async function runRender() {
  console.log("Running render...");
  //const configPath = document.getElementById('configPath').value;
  const values = {
    input: document.getElementById('input').value,
    output: document.getElementById('output').value,
    fps: parseFloat(document.getElementById('fps').value),
    //format: document.getElementById('format').value,
    //fade_in: parseFloat(document.getElementById('fade_in').value),
    //fade_out: parseFloat(document.getElementById('fade_out').value),
    //bitrate: document.getElementById('bitrate').value,
    //crf: parseInt(document.getElementById('crf').value),
    //preview: document.getElementById('preview').checked,
  };
  console.log("Values to send:", values);
  try {
    await invoke('run_renderer', { values });
    console.log("Render completed successfully");
  } catch (error) {
    console.error("Render failed:", error);
  }
}

let greetInputEl;
let greetMsgEl;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#configButton").addEventListener("click", (e) => {
    console.log("Config button clicked");
    runRender();
  });


  /*
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
  */
});
