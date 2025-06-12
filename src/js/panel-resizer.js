window.addEventListener("DOMContentLoaded", () => {
    const resizer = document.getElementById("resizer");
    const leftPanel = document.getElementById("leftPanel");
    const rightPanel = document.getElementById("rightPanel");

    let isDragging = false;

    resizer.addEventListener("mousedown", () => {
        isDragging = true;
        document.body.style.cursor = "ew-resize";
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.cursor = "default";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        /*
        const containerLeft = resizer.parentNode.getBoundingClientRect().left;
        const leftWidth = e.clientX - containerLeft;
        const rightWidth = containerWidth - leftWidth - resizer.offsetWidth;
        */
        const containerWidth = resizer.parentNode.offsetWidth;
        let leftWidth = e.clientX - 130;
        if (leftWidth < 400) leftWidth = 400; // Minimum width for left panel
        if (leftWidth > containerWidth - 400) leftWidth = containerWidth - 400; // Maximum width for left panel
        //const rightWidth = containerWidth - leftWidth - 5;
        //const rightWidth = (containerWidth - leftWidth) - 170;
        leftPanel.style.width = `${leftWidth}px`;
        rightPanel.style.width = `${rightWidth}px`;
    });
});