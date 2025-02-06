document.addEventListener("DOMContentLoaded", function () {
    console.log("JavaScript Loaded");  // Log when JS loads
    const menuToggle = document.querySelector("#mobile-menu");
    const navLinks = document.querySelector(".nav-links");

    if (menuToggle && navLinks) {
        console.log("Menu elements found"); // Check if elements exist

        menuToggle.addEventListener("click", function () {
            console.log("Menu clicked"); // Log when clicked
            navLinks.classList.toggle("active");
        });
    } else {
        console.log("Menu elements NOT found");
    }
});
