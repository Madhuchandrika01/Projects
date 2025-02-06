document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector("#mobile-menu"); // Change from .menu-toggle to #mobile-menu
    const navLinks = document.querySelector(".nav-links");

    if (menuToggle && navLinks) { // Ensure both elements exist
        menuToggle.addEventListener("click", () => {
            navLinks.classList.toggle("active");
        });
    }
});
