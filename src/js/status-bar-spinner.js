// Spinner animation setup
let spinnerInterval;
let startTime;
const spinnerFrames = ["⠁","⠃","⠇","⠧","⠷","⠿","⠻","⠟","⠯","⠷","⠾","⠽","⠻","⠛","⠋"];
let spinnerIndex = 0;

function startStatusSpinner(message = "Processing") {
  const spinner = document.querySelector(".spinner, .spinner-text");
  if (spinner) spinner.style.display = "inline-block";
  updateMainStatus(message);
}

function stopStatusSpinner(finalMessage = "✅ Done!") {
  const spinner = document.querySelector(".spinner, .spinner-text");
  if (spinner) spinner.style.display = "none";
  updateMainStatus(finalMessage);
}

function updateMainStatus(message = "Processing...") {
  const statusText = document.getElementById("status-bar-text");
  if (!statusText) return; 
  statusText.textContent = message;
  statusText.title = message;
}

function updateAlertStatus(message = "", type = "success") {
  const alert = document.getElementById("status-alert");
  if (!alert) return;
  alert.textContent = message;
  alert.title = message;
  alert.className = `status-right ${type}`;
}

window.startStatusSpinner = startStatusSpinner;
window.stopStatusSpinner = stopStatusSpinner;
window.updateMainStatus = updateMainStatus;
window.updateAlertStatus = updateAlertStatus;
