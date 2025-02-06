document.addEventListener("DOMContentLoaded", function () {
    console.log("Script loaded");  // Check if script is running
    const menuToggle = document.querySelector("#mobile-menu");
    const navLinks = document.querySelector(".nav-links");

    if (menuToggle && navLinks) {
        console.log("Menu elements found");
        menuToggle.addEventListener("click", function () {
            console.log("Menu clicked");
            navLinks.classList.toggle("active");
        });
    } else {
        console.log("Menu elements not found");
    }
});
